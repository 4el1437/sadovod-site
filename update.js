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
vm.runInContext(fs.readFileSync(path.join(DIR, "data.js"), "utf8") + "\n;this.TOURNAMENTS = TOURNAMENTS; this.TELEGRAM = typeof TELEGRAM !== 'undefined' ? TELEGRAM : null; this.VK = typeof VK_PUBLIC !== 'undefined' ? VK_PUBLIC : null;", ctx);
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
//  VSPORT.SU  (универсальный разбор HTML-таблиц)
//  Таблица: ищется <table>, в которой есть название нашей команды и колонка очков.
//  Матчи: строки, где есть наша команда и дата вида 15.11 / 15.11.2026.
// =====================================================================
function tables(html) {
  return [...html.matchAll(/<table[\s\S]*?<\/table>/gi)].map((t) =>
    [...t[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((r) => [...r[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => strip(c[1])))
  );
}

function parseStandings(html, team) {
  for (const rows of tables(html)) {
    if (!rows.some((r) => r.some((c) => c.toLowerCase() === team.toLowerCase() || c.toLowerCase().includes(team.toLowerCase())))) continue;
    const head = rows[0].map((h) => h.toLowerCase());
    const col = (...names) => head.findIndex((h) => names.some((n) => h === n || h.startsWith(n)));
    const iTeam = col("команда", "клуб", "team");
    const iP = col("и", "игры", "м");
    const iW = col("в", "поб");
    const iD = col("н", "нич");
    const iL = col("п", "пор");
    const iG = col("мячи", "з-п", "голы", "заб");
    const iPts = col("о", "оч", "очки");
    if (iTeam < 0 || iPts < 0) continue;
    return rows.slice(1).filter((r) => r[iTeam]).map((r) => {
      const g = iG >= 0 ? (r[iG] || "").match(/(\d+)\s*[-:–]\s*(\d+)/) : null;
      return { team: r[iTeam], p: num(r[iP]), w: num(r[iW]), d: num(r[iD]) ?? 0, l: num(r[iL]), gf: g ? +g[1] : null, ga: g ? +g[2] : null, pts: num(r[iPts]) };
    });
  }
  return [];
}

function parseMatches(html, team, baseUrl) {
  const res = [];
  const low = team.toLowerCase();
  for (const rows of tables(html)) {
    let lastDate = "";
    for (const r of rows) {
      const line = r.join(" | ");
      const d = line.match(/(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?/);
      if (d && r.length <= 2) lastDate = d[0]; // строка-заголовок с датой тура
      if (!line.toLowerCase().includes(low)) continue;
      const ds = (d && r.length > 2 ? d : lastDate.match(/(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?/));
      if (!ds) continue;
      const mo = +ds[2] - 1, day = +ds[1];
      const year = ds[3] ? (ds[3].length === 2 ? 2000 + +ds[3] : +ds[3]) : guessYear(mo, day);
      const time = line.match(/\b(\d{1,2}):(\d{2})\b(?!\s*\d)/);
      const sc = line.match(/(\d+)\s*[:\-–]\s*(\d+)(?!\d)(?![^|]*\d\d\.)/g)?.filter((s) => !/^\d{1,2}:\d{2}$/.test(s.replace(/\s/g, "")) || !time || s.replace(/\s/g, "") !== time[0]);
      // команды: ячейки, похожие на названия (не числа, не даты)
      const teams = r.filter((c) => c && !/^[\d\s:.\-–]+$/.test(c) && c.length < 50 && !/стадион|манеж|арена|тур/i.test(c));
      const ti = teams.findIndex((c) => c.toLowerCase().includes(low));
      if (teams.length < 2 || ti < 0) continue;
      const other = teams[ti === 0 ? 1 : ti - 1];
      const usHome = ti === 0 || teams.indexOf(other) > ti;
      const s = sc && sc.length ? sc[sc.length - 1].match(/(\d+)\s*[:\-–]\s*(\d+)/) : null;
      const date = `${year}-${pad(mo + 1)}-${pad(day)}`;
      res.push({
        id: `vs-${date}-${other}`, date, time: time ? `${pad(time[1])}:${time[2]}` : "",
        home: usHome ? team : other, away: usHome ? other : team,
        score: s && new Date(date) <= new Date() ? [+s[1], +s[2]] : null,
        venue: "", link: baseUrl,
      });
    }
  }
  return res;
}

async function vsport(t) {
  const out = { standings: [], matches: [] };
  for (const url of t.vsport.urls) {
    const html = await get(url);
    if (!out.standings.length) out.standings = parseStandings(html, t.team);
    out.matches.push(...parseMatches(html, t.team, url));
  }
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
      if (id >= cfg.fromPost) cache[id] = { id, dt, text };
    }
    if (!ids.length) break;
    const min = Math.min(...ids);
    if (min <= stopAt || (before && min >= before)) break;
    before = min;
  }
  fs.writeFileSync(TG_CACHE, JSON.stringify(cache));
  return Object.values(cache).sort((a, b) => a.id - b.id);
}

function tgMatches(posts, cfg) {
  const rules = cfg.rules.map((r) => ({ ...r, re: new RegExp(r.match, "i") }));
  const local = (dt) => new Date(new Date(dt).getTime() + cfg.tz * 36e5).toISOString(); // время Красноярска
  const res = [];
  let cur = null;
  for (const p of posts) {
    const flat = p.text.replace(/\s+/g, " ");
    // шапка матча
    const rule = /садовод/i.test(flat) && rules.find((r) => r.re.test(flat));
    const opp = flat.match(/САДОВОД\s*(?:🆚|vs|-|–)\s*([^💥⚽️❗📆📅🏆\n]+?)(?:\s*[💥⚽️❗]|\s+\d|\s+🏆|\s+📅|\s+📆|$)/i);
    if (rule && opp) {
      const opponent = opp[1].replace(/[«»"]/g, "").trim();
      const round = flat.match(/(1\/\d+ финала|\d+ тур|финал|полуфинал)/i)?.[1] || "";
      if (!cur || cur.done || cur.opponent.toLowerCase() !== opponent.toLowerCase()) {
        if (cur && !cur.goals.length && !cur.done) res.pop(); // анонс без матча
        cur = { t: rule.t, opponent, round, goals: [], score: null, date: "", time: "", done: false, post: p.id };
        res.push(cur);
      }
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
  return res.filter((m) => m.goals.length || m.done).map(({ done, ...m }) => ({ ...m, finished: done }));
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
      console.log("пропущено: нет ключа (vk-token.txt)");
      if (prev.vk) result.vk = prev.vk;
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
