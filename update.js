// =====================================================================
//  Автообновление данных сайта.  Запуск:  node update.js   (или update.bat)
//  Берёт турниры из TOURNAMENTS в data.js, скачивает таблицы и матчи
//  и записывает результат в data-auto.js. Сыгранные матчи накапливаются:
//  если матч пропал с сайта-источника, он остаётся в истории.
// =====================================================================
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const DIR = __dirname;
const AUTO_FILE = path.join(DIR, "data-auto.js");

// ---------- загрузка конфигурации из data.js ----------
const ctx = {};
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(DIR, "data.js"), "utf8") + "\n;this.TOURNAMENTS = TOURNAMENTS; this.TELEGRAM = typeof TELEGRAM !== 'undefined' ? TELEGRAM : null; this.VK = typeof VK_PUBLIC !== 'undefined' ? VK_PUBLIC : null; this.PLAYERS = PLAYERS;", ctx);
const TOURNAMENTS = ctx.TOURNAMENTS;

function loadPrev() {
  try {
    const txt = fs.readFileSync(AUTO_FILE, "utf8");
    return JSON.parse(txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1));
  } catch { return { tournaments: {} }; }
}

// ---------- сеть ----------
async function get(url, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (SadovodSiteUpdater)", "Accept-Language": "ru,en" },
        signal: AbortSignal.timeout(90000),
      });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const buf = Buffer.from(await res.arrayBuffer());
      const ct = (res.headers.get("content-type") || "") + buf.slice(0, 2000).toString("latin1");
      const enc = /charset=["']?(windows-1251|cp1251)/i.test(ct) ? "windows-1251" : "utf-8";
      return new TextDecoder(enc).decode(buf);
    } catch (e) {
      last = e;
      console.log(`   повтор ${i + 1}/${tries}: ${url} (${e.message})`);
    }
  }
  throw last;
}

const strip = (s) => s.replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
const num = (s) => { const n = parseInt(String(s).replace(/[^\d-]/g, ""), 10); return isNaN(n) ? null : n; };
const pad = (n) => String(n).padStart(2, "0");
const MONTHS_EN = ["january","february","march","april","may","june","july","august","september","october","november","december"];
const MONTHS_RU = ["январ","феврал","март","апрел","ма","июн","июл","август","сентябр","октябр","ноябр","декабр"];

// дата без года → ближайший разумный год
function guessYear(month, day) {
  const now = new Date();
  let y = now.getFullYear();
  const d = new Date(y, month, day);
  if (d - now > 200 * 864e5) y--; else if (now - d > 200 * 864e5) y++;
  return y;
}

// =====================================================================
//  GOALSTREAM
// =====================================================================
async function goalstream(t) {
  const base = "https://www.goalstream.org";
  const out = { standings: [], matches: [] };

  // 1) таблица — со страницы сезона
  const season = await get(`${base}/season/${t.goalstream.seasonId}`);
  const tbl = season.split("HomeStandingsCtrl")[1]?.split("</table>")[0] || "";
  for (const row of tbl.split("<tr").slice(2)) {
    const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((c) => c[1]);
    if (cells.length < 6) continue;
    const team = strip(cells[1]);
    const v = cells.slice(2).map((c) => num(strip(c)));
    // колонки: И В [Н] П О
    const [p, w, d, l, pts] = v.length >= 5 ? v : [v[0], v[1], 0, v[2], v[3]];
    out.standings.push({ team, p, w, d, l, gf: null, ga: null, pts });
  }

  // 2) матчи — полный календарь сезона (JSON, которым пользуется сам сайт)
  const json = JSON.parse(await get(`${base}/widget?format=json&mod=gcore&name=subject-grouped-schedule&subject=gchampionship_season_${t.goalstream.seasonId}`));
  const all = [];
  for (const se of json.seasons || []) for (const [date, day] of Object.entries(se.dates || {})) for (const m of day.matchs || []) {
    const sc = strip((m.score && m.score.string) || '').match(/(\d+)\s*:\s*(\d+)/);
    all.push({ id: 'gs' + m.id, date, time: m.time || '', home: m.home.name, away: m.away.name, homeId: m.home.id, awayId: m.away.id,
      score: sc ? [+sc[1], +sc[2]] : null, venue: (m.stadium && m.stadium.name) || '', link: base + m.href });
  }
  // мячи забитые/пропущенные для таблицы — считаем по всем сыгранным матчам
  const goals = {};
  for (const m of all) if (m.score) {
    (goals[m.home] ||= [0, 0]); (goals[m.away] ||= [0, 0]);
    goals[m.home][0] += m.score[0]; goals[m.home][1] += m.score[1];
    goals[m.away][0] += m.score[1]; goals[m.away][1] += m.score[0];
  }
  for (const r of out.standings) if (goals[r.team]) [r.gf, r.ga] = goals[r.team];
  out.matches = all.filter((m) => m.homeId === t.goalstream.clubGid || m.awayId === t.goalstream.clubGid)
    .map(({ homeId, awayId, ...m }) => m);
  return out;
}

// =====================================================================
//  VSPORT.SU (ФБЛ). Скрипты сайт не пускает, поэтому основной путь —
//  сохранённые страницы лиги в папке fbl/ (Ctrl+S в браузере → загрузить на GitHub).
//  Если сайт вдруг ответит напрямую — берём и его. Все страницы объединяются.
//  На странице: таблица (№ ▲ «Команда» И В Н П М О) и «РАСПИСАНИЕ ИГР» по дням:
//    «А» - «Б» - 8:22 (4:11) Голы: Фамилия Имя (Ассистент), мин (счёт) ... Лучший игрок матча: ...
//    «А» - «Б» Стадион. Адрес: ... Время начала матча 19:00 Судья: ...
// =====================================================================
const RU_MONTHS_GEN = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];

function vsText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&laquo;/g, "«").replace(/&raquo;/g, "»")
    .replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&gt;/g, ">").replace(/&lt;/g, "<")
    .replace(/[​-‍﻿]/g, "").replace(/\s+/g, " ");
}

// «Мустафин Артур» → «Артур Мустафин»
const swapName = (s) => { const p = s.trim().split(/\s+/); return p.length === 2 ? `${p[1]} ${p[0]}` : s.trim(); };

function parseVsport(html, t, src) {
  const txt = vsText(html);
  const aliases = [t.team, ...(t.vsport.aliases || [])].map((a) => a.toLowerCase());
  const isUs = (name) => aliases.includes(name.replace(/[«»"]/g, "").trim().toLowerCase());
  const clean = (s) => s.replace(/[«»]/g, "").trim();

  // --- таблица ---
  const standings = [];
  const tbl = txt.split(/РАСПИСАНИЕ ИГР/i)[0];
  for (const m of tbl.matchAll(/(\d+) [▲▼►=]? ?«([^»]+)» (\d+) (\d+) (\d+) (\d+) (\d+):(\d+) (\d+)/g)) {
    const team = clean(m[2]);
    standings.push({ team: isUs(team) ? t.team : team, p: +m[3], w: +m[4], d: +m[5], l: +m[6], gf: +m[7], ga: +m[8], pts: +m[9] });
  }

  // --- расписание по дням ---
  const matches = [];
  const sched = txt.split(/РАСПИСАНИЕ ИГР:?/i)[1]?.split(/Комментировать могут/i)[0] || "";
  const dayRe = /(Понедельник|Вторник|Среда|Четверг|Пятница|Суббота|Воскресенье)\.? (\d{1,2}) ([а-я]+):?/gi;
  const days = [...sched.matchAll(dayRe)];
  days.forEach((d, i) => {
    const mo = RU_MONTHS_GEN.indexOf(d[3].toLowerCase());
    if (mo < 0) return;
    const date = `${guessYear(mo, +d[2])}-${pad(mo + 1)}-${pad(d[2])}`;
    const body = sched.slice(d.index + d[0].length, days[i + 1]?.index ?? sched.length);
    // каждая игра начинается с «А» - «Б»
    const games = [...body.matchAll(/«([^»]+)» ?[-–] ?«([^»]+)»/g)];
    games.forEach((g, j) => {
      const chunk = body.slice(g.index + g[0].length, games[j + 1]?.index ?? body.length);
      const home = clean(g[1]), away = clean(g[2]);
      const usHome = isUs(home), usAway = isUs(away);
      if (!usHome && !usAway) return;
      const sc = chunk.match(/^\s*[-–]?\s*(\d+):(\d+)/);
      const time = chunk.match(/Время начала матча (\d{1,2}):(\d{2})/);
      const venue = chunk.match(/^\s*([^.]{3,80}?)\. Адрес/)?.[1]?.trim() || "";
      const m = {
        id: `vs-${date}-${usHome ? away : home}`, date, time: time ? `${pad(time[1])}:${time[2]}` : "",
        home: usHome ? t.team : home, away: usAway ? t.team : away,
        score: sc ? [+sc[1], +sc[2]] : null, venue, link: t.source, round: "",
      };
      // голы: «Фамилия Имя (Ассистент), 12 (0:1)»
      const gl = chunk.split(/Голы:/i)[1]?.split(/Лучший игрок|Наказание/i)[0];
      if (sc && gl) {
        m.goals = [];
        let prev = [0, 0];
        for (const e of gl.matchAll(/([^,()]+?)\s*(?:\(([^)]*)\))?\s*,\s*(\d+)\s*\((\d+):(\d+)\)/g)) {
          const s = [+e[4], +e[5]];
          const homeScored = s[0] > prev[0];
          prev = s;
          const oursScored = usHome ? homeScored : !homeScored;
          const ourScore = usHome ? `${s[0]}:${s[1]}` : `${s[1]}:${s[0]}`;
          if (!oursScored) { m.goals.push({ score: ourScore, opp: true, min: +e[3] }); continue; }
          const scorer = e[1].trim();
          m.goals.push({ score: ourScore, min: +e[3], scorer: /автогол/i.test(scorer) ? "Автогол" : swapName(scorer), assist: e[2] ? swapName(e[2]) : null });
        }
        const best = chunk.match(/Лучший игрок матча:\s*([^(]+?)\s*\(/)?.[1];
        if (best) m.mvp = swapName(best);
      }
      matches.push(m);
    });
  });
  return { standings, matches, src };
}

async function vsport(t) {
  const pages = [];
  // 1) сохранённые страницы из папки fbl/ (по времени изменения: новые важнее)
  const dir = path.join(DIR, t.vsport.dir || "fbl");
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir).filter((f) => /\.html?$/i.test(f))
      .map((f) => ({ f, at: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => a.at - b.at)) {
      const buf = fs.readFileSync(path.join(dir, f.f));
      const head = buf.slice(0, 3000).toString("latin1");
      pages.push({ html: new TextDecoder(/charset=["']?(windows-1251|cp1251)/i.test(head) ? "windows-1251" : "utf-8").decode(buf), src: f.f });
    }
  }
  // 2) попытка скачать напрямую (обычно не пускает)
  for (const url of t.vsport.urls || []) {
    try { pages.push({ html: await get(url, 1), src: url }); } catch (e) { console.log(`   vsport напрямую недоступен (${e.message}), беру сохранённые страницы: ${pages.length}`); }
  }
  if (!pages.length) throw new Error("нет страниц: положите сохранённую страницу лиги в папку fbl/");
  const out = { standings: [], matches: [] };
  const byId = new Map();
  for (const p of pages) {
    const r = parseVsport(p.html, t, p.src);
    if (r.standings.length) out.standings = r.standings; // последняя по времени
    for (const m of r.matches) byId.set(m.id, { ...byId.get(m.id), ...m, goals: m.goals || byId.get(m.id)?.goals, score: m.score || byId.get(m.id)?.score || null });
  }
  out.matches = [...byId.values()];
  return out;
}

// =====================================================================
//  TELEGRAM (t.me/s/<канал> — публичная лента)
//  Шапка матча: пост с «Садовод» + ключевое слово турнира (TELEGRAM.rules).
//  Голы: посты вида «5:2 Имя Фамилия (Ассистент)». Счёт всегда «наши:соперник»,
//  пост со счётом без фамилии = гол соперника.
// =====================================================================
const TG_CACHE = path.join(DIR, "tg-cache.json");
const unhtml = (s) => s.replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "").replace(/&quot;/g, '"').replace(/&#33;/g, "!").replace(/&#39;/g, "'").replace(/&amp;/g, "&").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

async function tgPosts(cfg) {
  let cache = {};
  try { cache = JSON.parse(fs.readFileSync(TG_CACHE, "utf8")); } catch {}
  if (!Object.values(cache).some((p) => p.photos)) cache = {}; // старый формат кэша без фото — перечитать всё
  const known = Object.keys(cache).map(Number);
  const stopAt = Math.max(cfg.fromPost - 1, known.length ? Math.max(...known) - 40 : 0); // перечитываем последние ~40 постов (правки)
  let before = null;
  for (let page = 0; page < 60; page++) {
    const html = await get(`https://t.me/s/${cfg.channel}${before ? "?before=" + before : ""}`);
    const ids = [];
    for (const p of html.split('data-post="').slice(1)) {
      const id = +p.split('"')[0].split("/")[1];
      if (!id) continue;
      ids.push(id);
      const text = unhtml(p.match(/tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/)?.[1] || "").trim();
      const dt = p.match(/datetime="([^"]+)"/)?.[1] || "";
      const photos = [...p.matchAll(/tgme_widget_message_photo_wrap[^>]*background-image:url\('([^']+)'\)/g)].map((m) => m[1]);
      if (id >= cfg.fromPost) cache[id] = { id, dt, text, photos };
    }
    if (!ids.length) break;
    const min = Math.min(...ids);
    if (min <= stopAt || (before && min >= before)) break;
    before = min;
  }
  fs.writeFileSync(TG_CACHE, JSON.stringify(cache));
  return Object.values(cache).sort((a, b) => a.id - b.id);
}

// «📅 Дата: 8 ноября 2026 года ⏰ Время: 18:00 📍 Место: МСК «Сопка»» → {date, time, venue}
function announceInfo(text) {
  const out = {};
  const d = text.match(/(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)(?:\s+(\d{4}))?/i);
  if (d) {
    const mo = RU_MONTHS_GEN.indexOf(d[2].toLowerCase());
    out.date = `${d[3] || guessYear(mo, +d[1])}-${pad(mo + 1)}-${pad(d[1])}`;
  }
  const t = text.match(/(?:⏰|🕐|🕑|🕒|🕓|🕔|🕕|🕖|🕗|🕘|🕙|🕚|🕛|время)[^\d\n]{0,12}(\d{1,2}):(\d{2})/i) || text.match(/\b(\d{1,2}):(\d{2})\b/);
  if (t) out.time = `${pad(t[1])}:${t[2]}`;
  const v = text.split("\n").find((l) => /🏟|📍|место:/i.test(l));
  if (v) out.venue = v.replace(/🏟️?|📍|место:?/gi, "").replace(/[«»]/g, (c) => c).trim();
  return out;
}

function tgMatches(posts, cfg) {
  const rules = cfg.rules.map((r) => ({ ...r, re: new RegExp(r.match, "i") }));
  const local = (dt) => new Date(new Date(dt).getTime() + cfg.tz * 36e5).toISOString(); // время Красноярска
  const res = [];
  let cur = null;
  for (const p of posts) {
    const flat = p.text.replace(/\s+/g, " ");
    // картинка «Состав на матч» → к текущему матчу (до проверки шапки: такой пост может её повторять)
    if (cur && !cur.done && /состав на/i.test(flat) && p.photos?.length) cur.lineupPost = { id: p.id, photo: p.photos[0] };
    // шапка матча
    const rule = /садовод/i.test(flat) && rules.find((r) => r.re.test(flat));
    const opp = flat.match(/САДОВОД\s*(?:🆚|vs|-|–)\s*([^💥⚽️❗📆📅🏆\n]+?)(?:\s*[💥⚽️❗]|\s+\d|\s+🏆|\s+📅|\s+📆|$)/i);
    if (rule && opp) {
      const opponent = opp[1].replace(/[«»"]/g, "").trim();
      const round = flat.match(/(1\/\d+ финала|\d+ тур|финал|полуфинал)/i)?.[1] || "";
      if (!cur || cur.done || cur.opponent.toLowerCase() !== opponent.toLowerCase()) {
        cur = { t: rule.t, opponent, round, goals: [], score: null, date: "", time: "", venue: "", done: false, post: p.id, announced: false };
        res.push(cur);
      }
      // анонс: дата, время, место (повторные анонсы дополняют пустые поля)
      const info = announceInfo(p.text);
      if (info.date) { cur.date ||= info.date; cur.announced = true; }
      if (info.time) cur.time ||= info.time;
      if (info.venue) cur.venue ||= info.venue;
      if (round && !cur.round) cur.round = round;
      continue;
    }
    if (!cur || cur.done) continue;
    const g = flat.match(/^\s*(\d+)\s*:\s*(\d+)\s*(.*)$/);
    if (g) {
      const [ours, theirs] = [+g[1], +g[2]];
      const prev = cur.score || [0, 0];
      if (!cur.date) { const l = local(p.dt); cur.date = l.slice(0, 10); }
      if (ours > prev[0]) {
        const rest = g[3].trim();
        const m = rest.match(/^([^(]*?)\s*(?:\(\s*([^)]*?)\s*\))?\s*$/);
        const norm = (s) => (s || "").replace(/\s+/g, " ").trim();
        cur.goals.push({ score: `${ours}:${theirs}`, scorer: norm(m?.[1]) || null, assist: norm(m?.[2]) || null, post: p.id });
      } else if (theirs > prev[1]) {
        cur.goals.push({ score: `${ours}:${theirs}`, opp: true, post: p.id });
      }
      cur.score = [ours, theirs];
      continue;
    }
    if (/матч (закончен|окончен)/i.test(flat)) cur.done = true;
  }
  return res.filter((m) => m.goals.length || m.done || m.announced).map(({ done, ...m }) => ({ ...m, finished: done }));
}

// =====================================================================
//  VK (официальный API). Нужен сервисный ключ доступа — положите его в файл
//  vk-token.txt рядом со скриптом (или в переменную окружения VK_TOKEN).
//  Берём: посты стены (текст, фото, видео/клипы) и фотоальбомы.
// =====================================================================
function vkToken() {
  if (process.env.VK_TOKEN) return process.env.VK_TOKEN.trim();
  try { return fs.readFileSync(path.join(DIR, "vk-token.txt"), "utf8").trim(); } catch { return null; }
}

async function vkApi(method, params, token) {
  const qs = new URLSearchParams({ ...params, access_token: token, v: "5.199", lang: "ru" });
  const j = JSON.parse(await get(`https://api.vk.ru/method/${method}?${qs}`));
  if (j.error) throw new Error(`VK ${method}: ${j.error.error_msg}`);
  return j.response;
}

const bestPhoto = (p) => {
  const s = [...(p.sizes || [])].sort((a, b) => b.width * b.height - a.width * a.height);
  return { big: s[0]?.url, small: (s.find((x) => x.width <= 640) || s[0])?.url };
};
const bestImg = (arr) => [...(arr || [])].sort((a, b) => b.width - a.width)[0]?.url;

async function vk(cfg, token) {
  const owner = -Math.abs(cfg.groupId);
  const from = new Date(cfg.fromDate).getTime() / 1000;
  const posts = [];
  for (let offset = 0; offset < 1000; offset += 100) {
    const r = await vkApi("wall.get", { owner_id: owner, count: 100, offset }, token);
    for (const p of r.items) {
      if (p.date < from) { if (!p.is_pinned) offset = 1e9; continue; }
      const att = [...(p.attachments || []), ...(p.copy_history?.[0]?.attachments || [])];
      const photos = att.filter((a) => a.type === "photo").map((a) => bestPhoto(a.photo)).filter((x) => x.big);
      const v = att.find((a) => a.type === "video")?.video;
      const text = (p.text || p.copy_history?.[0]?.text || "").replace(/\[(club|id)\d+\|([^\]]+)\]/g, "$2").trim();
      if (!text && !photos.length && !v) continue;
      posts.push({
        id: p.id, date: new Date(p.date * 1000).toISOString(), text, photos,
        video: v ? { title: v.title, image: bestImg(v.image) || bestImg(v.first_frame), clip: v.type === "short_video" || /clip/.test(v.type || ""), link: `https://vk.ru/video${v.owner_id}_${v.id}` } : null,
        link: `https://vk.ru/wall${owner}_${p.id}`,
      });
    }
    if (offset + 100 >= r.count) break;
  }
  let albums = [];
  try {
    const a = await vkApi("photos.getAlbums", { owner_id: owner, need_covers: 1, photo_sizes: 1 }, token);
    albums = a.items.filter((x) => x.size > 0 && x.id > 0).map((x) => ({
      id: x.id, title: x.title, size: x.size, updated: new Date((x.updated || x.created) * 1000).toISOString(),
      cover: bestImg(x.sizes) || x.thumb_src, link: `https://vk.ru/album${owner}_${x.id}`,
    }));
  } catch (e) { console.log("   альбомы:", e.message); }
  return { posts, albums };
}

// =====================================================================
//  VK БЕЗ КЛЮЧА: официальный виджет сообщества (widget_community.php) отдаёт
//  последние ~10 постов прямо в HTML. Забираем их и накапливаем между запусками.
// =====================================================================
const decodeEnt = (s) => s
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ");

async function vkWidget(cfg) {
  const url = `https://vk.com/widget_community.php?app=0&width=600px&_ver=1&gid=${cfg.groupId}&mode=4&wide=1&height=4000`;
  const res = await fetch(url, {
    // простой UA: на «неполный» Chrome UA VK отвечает заглушкой «Ваш браузер устарел»
    headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "ru-RU,ru", Referer: "https://4el1437.github.io/" },
    signal: AbortSignal.timeout(90000),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  const html = new TextDecoder(/1251/.test(res.headers.get("content-type") || "") ? "windows-1251" : "utf-8").decode(buf);
  const owner = -Math.abs(cfg.groupId);
  const posts = [];
  for (const p of html.split(`id="post${owner}_`).slice(1)) {
    const id = +p.match(/^\d+/)?.[0];
    const ts = +(p.match(/data-date="?(\d{9,})/) || p.match(/time="(\d{9,})/) || [])[1];
    if (!id || !ts) continue;
    const raw = p.match(/class="wall_post_text"[^>]*>([\s\S]*?)<\/div>/)?.[1] || "";
    const text = decodeEnt(raw.replace(/<a[^>]*class="[^"]*(?:wall_post_more|PostTextMore)[^"]*"[\s\S]*?<\/a>/g, "")
      .replace(/<br\s*\/?>/g, "\n").replace(/<img[^>]*alt="([^"]*)"[^>]*>/g, "$1").replace(/<[^>]+>/g, "")).replace(/\s*Показать (?:ещё|полностью)…?\s*/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
    const imgs = [...p.matchAll(/background-image:\s*url\(([^)]+)\)/g)].map((m) => decodeEnt(m[1].replace(/['"]/g, "")));
    const vhref = p.match(/href="(\/(?:video|clip)-?\d+_\d+)[^"]*"/)?.[1];
    const vtitle = decodeEnt(p.match(/class="a post_video_title"[^>]*>([^<]*)/)?.[1] || "");
    const isVideo = !!vhref || /page_post_thumb_video/.test(p);
    posts.push({
      id, date: new Date(ts * 1000).toISOString(), text,
      photos: isVideo ? [] : imgs.map((u) => ({ big: u, small: u })),
      video: isVideo ? { title: vtitle, image: imgs[0] || "", clip: /\/clip/.test(vhref || ""), link: vhref ? `https://vk.ru${vhref}` : `https://vk.ru/wall${owner}_${id}` } : null,
      link: `https://vk.ru/wall${owner}_${id}`,
    });
  }
  if (!posts.length) throw new Error("виджет VK не вернул постов");
  return posts;
}

// =====================================================================
//  СОСТАВЫ НА МАТЧ: OCR картинки из поста «Состав на матч» (tesseract.js).
//  Распознаём два варианта (как есть + увеличенный ч/б с инверсией), объединяем,
//  ищем фамилии из PLAYERS с допуском на ошибки распознавания.
//  Результат кэшируется в lineups.json по номеру поста — каждая картинка распознаётся один раз.
// =====================================================================
const LINEUP_CACHE = path.join(DIR, "lineups.json");
const normRu = (s) => s.toUpperCase().replace(/Ё/g, "Е").replace(/[^А-ЯA-Z0-9 ]/g, " ");
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
function namesInText(text, players) {
  const words = normRu(text).split(/\s+/).filter((w) => w.length >= 3);
  return players.filter((p) => {
    const sur = normRu(p.name.split(" ").slice(-1)[0]).trim();
    const tol = sur.length >= 8 ? 2 : sur.length >= 5 ? 1 : 0;
    return words.some((w) => lev(w, sur) <= tol || (w.length >= 5 && sur.startsWith(w) && w.length >= sur.length - 3));
  }).map((p) => p.name);
}
async function ocrLineup(url, players) {
  const { createWorker } = require("tesseract.js");
  const Jimp = require("jimp");
  const buf = Buffer.from(await (await fetch(url, { signal: AbortSignal.timeout(60000) })).arrayBuffer());
  const img = await Jimp.read(buf);
  img.scale(2.5).greyscale().contrast(0.4);
  img.scan(0, 0, img.bitmap.width, img.bitmap.height, function (x, y, i) {
    const v = this.bitmap.data[i] > 170 ? 0 : 255; // белый текст → чёрный на белом
    this.bitmap.data[i] = this.bitmap.data[i + 1] = this.bitmap.data[i + 2] = v;
  });
  const bw = await img.getBufferAsync(Jimp.MIME_PNG);
  const worker = await createWorker("rus", 1, { cachePath: path.join(DIR, ".ocr-cache") });
  const t1 = (await worker.recognize(buf)).data.text;
  const t2 = (await worker.recognize(bw)).data.text;
  await worker.terminate();
  return [...new Set([...namesInText(t1, players), ...namesInText(t2, players)])];
}

// =====================================================================
async function main() {
  const prev = loadPrev();
  const result = { updated: new Date().toISOString(), tournaments: {} };
  for (const t of TOURNAMENTS) {
    const old = prev.tournaments?.[t.id] || { standings: [], matches: [] };
    process.stdout.write(`▶ ${t.name} … `);
    try {
      const fresh = t.goalstream ? await goalstream(t) : t.vsport ? await vsport(t) : { standings: [], matches: [] };
      // слияние матчей: новые данные важнее, старые сыгранные сохраняем
      const byId = new Map(old.matches.map((m) => [m.id, m]));
      for (const m of fresh.matches) byId.set(m.id, { ...byId.get(m.id), ...m, score: m.score || byId.get(m.id)?.score || null });
      result.tournaments[t.id] = {
        standings: fresh.standings.length ? fresh.standings : old.standings,
        matches: [...byId.values()].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)),
        ok: true, at: result.updated,
      };
      console.log(`ок: команд в таблице ${result.tournaments[t.id].standings.length}, матчей ${result.tournaments[t.id].matches.length}`);
    } catch (e) {
      console.log("ОШИБКА:", e.message, "— оставлены прошлые данные");
      result.tournaments[t.id] = { ...old, ok: false, error: e.message };
    }
  }
  // --- Telegram: голы и передачи ---
  if (ctx.TELEGRAM) {
    process.stdout.write(`▶ Telegram @${ctx.TELEGRAM.channel} … `);
    try {
      const posts = await tgPosts(ctx.TELEGRAM);
      result.telegram = { matches: tgMatches(posts, ctx.TELEGRAM), ok: true, at: result.updated };
      // составы на матч: распознаём картинки (один раз на пост, результат в lineups.json)
      let lc = {};
      try { lc = JSON.parse(fs.readFileSync(LINEUP_CACHE, "utf8")); } catch {}
      for (const m of result.telegram.matches) {
        if (!m.lineupPost) continue;
        const key = String(m.lineupPost.id);
        if (!lc[key]) {
          try {
            lc[key] = { names: await ocrLineup(m.lineupPost.photo, ctx.PLAYERS), at: result.updated };
            console.log(`\n   состав (пост ${key}, ${m.t}, ${m.opponent}): ${lc[key].names.length} чел.`);
          } catch (e) { console.log(`\n   не удалось распознать состав ${key}: ${e.message}`); continue; }
        }
        m.lineup = lc[key].names;
      }
      fs.writeFileSync(LINEUP_CACHE, JSON.stringify(lc, null, 1));
      const n = result.telegram.matches.reduce((s, m) => s + m.goals.filter((g) => !g.opp).length, 0);
      console.log(`ок: постов ${posts.length}, матчей ${result.telegram.matches.length}, наших голов ${n}`);
    } catch (e) {
      console.log("ОШИБКА:", e.message, "— оставлены прошлые данные");
      result.telegram = { ...(prev.telegram || { matches: [] }), ok: false, error: e.message };
    }
  }

  // --- VK: фото, видео, клипы ---
  if (ctx.VK) {
    const token = vkToken();
    process.stdout.write(`▶ VK ${ctx.VK.screenName} … `);
    if (!token) {
      // без ключа — через виджет сообщества, накапливая посты между запусками
      try {
        const fresh = await vkWidget(ctx.VK);
        const from = new Date(ctx.VK.fromDate).getTime();
        const byId = new Map((prev.vk?.posts || []).map((p) => [p.id, p]));
        for (const p of fresh) byId.set(p.id, p);
        const posts = [...byId.values()].filter((p) => new Date(p.date).getTime() >= from).sort((a, b) => b.date.localeCompare(a.date));
        result.vk = { posts, albums: prev.vk?.albums || [], ok: true, at: result.updated, via: "widget" };
        console.log(`ок (виджет): новых/обновлённых ${fresh.length}, всего постов ${posts.length}`);
      } catch (e) {
        console.log("ОШИБКА виджета:", e.message, "— оставлены прошлые данные");
        result.vk = { ...(prev.vk || { posts: [], albums: [] }), ok: false, error: e.message };
      }
    } else {
      try {
        result.vk = { ...(await vk(ctx.VK, token)), ok: true, at: result.updated };
        console.log(`ок: постов ${result.vk.posts.length}, альбомов ${result.vk.albums.length}`);
      } catch (e) {
        console.log("ОШИБКА:", e.message, "— оставлены прошлые данные");
        result.vk = { ...(prev.vk || { posts: [], albums: [] }), ok: false, error: e.message };
      }
    }
  }

  fs.writeFileSync(AUTO_FILE,
    "// Файл создаётся автоматически скриптом update.js — не редактируйте вручную.\n" +
    "// Ручные правки делайте в data.js (MANUAL_MATCHES / MANUAL_STANDINGS).\n" +
    "const AUTO = " + JSON.stringify(result, null, 1) + ";\n");
  console.log("Сохранено в data-auto.js");
}
main();
