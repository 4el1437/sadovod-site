// Общая логика: шапка, футер и отрисовка страниц из data.js + data-auto.js
const PAGES = [
  ["index.html", "Главная"],
  ["team.html", "Команда"],
  ["stats.html", "Статистика"],
  ["media.html", "Контент"],
  ["shop.html", "Магазин"],
];
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const MONTHS = ["января","февраля","марта","апреля","мая","июня","июля","августа","сентября","октября","ноября","декабря"];
const WEEKDAYS = ["вс","пн","вт","ср","чт","пт","сб"];
const fmtDate = (iso) => { const d = new Date(iso + "T00:00"); return isNaN(d) ? iso : `${d.getDate()} ${MONTHS[d.getMonth()]}, ${WEEKDAYS[d.getDay()]}`; };
const initials = (n) => n.split(" ").map((w) => w[0]).slice(0, 2).join("");
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };

// ---------- сборка данных: авто + ручные правки ----------
const AUTO_DATA = typeof AUTO !== "undefined" ? AUTO : { tournaments: {} };
let TG_MATCHES = AUTO_DATA.telegram?.matches || [];
// эфиры из приложения FootballLive (stream.json в ветке APP_STREAM.branch), см. pollAppStreams
let APP_STREAMS = [];
// «КОБРА» → «Кобра», «1/16 ФИНАЛА» → «1/16 финала»
const tidy = (s) => (s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s-])(\S)/g, (m, a, b) => a + b.toUpperCase()) : s);
const tidyRound = (s) => (s || "").toLowerCase();
// пересобирается заново, когда во время матча приходят онлайн-данные (live.json)
const buildT = () => TOURNAMENTS.map((t) => {
  const a = AUTO_DATA.tournaments[t.id] || { standings: [], matches: [] };
  const matches = new Map(a.matches.map((m) => [m.id, { ...m }]));
  for (const mm of MANUAL_MATCHES.filter((m) => m.t === t.id)) {
    const other = mm.home === t.team ? mm.away : mm.home;
    const hit = [...matches.values()].find((m) => m.date === mm.date && (m.home === other || m.away === other));
    if (hit) Object.assign(hit, mm); else matches.set(`manual-${mm.date}-${other}`, { ...mm });
  }
  // матчи из телеграма: прикрепляем голы к матчу из таблицы или добавляем как новый
  for (const tm of TG_MATCHES.filter((m) => m.t === t.id)) {
    // название соперника — как в турнирной таблице, если он там есть («ВИТЭН», а не «Витэн»)
    const opp = (MANUAL_STANDINGS[t.id] || a.standings).map((r) => r.team).find((n) => n.toLowerCase() === tm.opponent.toLowerCase()) || tidy(tm.opponent);
    const same = (m) => m.date === tm.date || (m.home + m.away).toLowerCase().includes(opp.toLowerCase()) && Math.abs(new Date(m.date) - new Date(tm.date)) < 3 * 864e5;
    const hit = [...matches.values()].find(same);
    // счёт по ходу матча (пока нет «Матч окончен») — отдельно от итогового
    const flip = (sc, home) => (sc ? (home === t.team ? sc : [sc[1], sc[0]]) : null);
    if (hit) { if (tm.stream && !hit.stream) hit.stream = tm.stream; if (!tm.finished && tm.score && !hit.score) hit.liveScore = flip(tm.score, hit.home);
      // минуты голов — из протокола, если он есть (в телеграме только время поста)
      if (tm.goals?.length && hit.goals?.length) for (const g of tm.goals) { const o = hit.goals.find((x) => x.score === g.score && x.min != null); if (o && g.min == null) g.min = o.min; }
      if (!hit.time && tm.time) hit.time = tm.time; if (!hit.venue && tm.venue) hit.venue = tm.venue; if (tm.lineup?.length) hit.lineup = tm.lineup; if (tm.goals?.length) hit.goals = tm.goals; // авторы голов — по телеграму команды (в протоколах организаторов бывают ошибки в фамилиях)
      if (!hit.score && tm.score && tm.finished) { hit.score = hit.home === t.team ? tm.score : [tm.score[1], tm.score[0]]; hit.tgScore = true; } if (!hit.round) hit.round = tidyRound(tm.round); }
    else matches.set("tg" + tm.post, { date: tm.date, time: tm.time || "", home: t.team, away: opp, score: tm.finished ? tm.score : null, tgScore: tm.finished, venue: tm.venue || "", announced: !tm.finished, round: tidyRound(tm.round), goals: tm.goals, lineup: tm.lineup, stream: tm.stream, liveScore: !tm.finished && tm.score ? tm.score : null });
  }
  // счёт есть только в телеграме (организатор ещё не обновил таблицу) — сами дописываем матч в таблицу:
  // победа 3, ничья 1, поражение 0, мячи — нам и сопернику. Как только придёт официальная таблица с этим матчем, правка исчезнет.
  // эфир из приложения: ссылка на трансляцию к матчу этого дня (самая свежая — важнее телеграма).
  // Матч с «Садоводом» ищем по дате и сопернику, чужой (тестовый) — по дате и обеим командам; нет такого — добавляем.
  const us = (n) => [t.team, CLUB.name].some((x) => x.toLowerCase() === (n || "").toLowerCase());
  const lc = (n) => (n || "").toLowerCase();
  for (const s of APP_STREAMS.filter((x) => x.t === t.id && x.date && /^https?:\/\/\S+$/.test(x.stream || ""))) { // «-» и прочий не-адрес — пропускаем (кнопка вела бы на 404)
    const other = us(s.home) ? s.away : us(s.away) ? s.home : null;
    const hit = [...matches.values()].find((m) => m.date === s.date && (other
      ? lc(m.home) === lc(other) || lc(m.away) === lc(other)
      : lc(m.home) === lc(s.home) && lc(m.away) === lc(s.away)));
    if (hit) { hit.stream = s.stream; if (!hit.time && s.time) hit.time = s.time; }
    else matches.set("app-" + s.matchId, { date: s.date, time: s.time || "", home: us(s.home) ? t.team : s.home, away: us(s.away) ? t.team : s.away,
      score: null, venue: "", announced: true, stream: s.stream, appKey: other ? null : String(s.matchId).slice(0, 8) });
  }
  let standings = MANUAL_STANDINGS[t.id] || a.standings;
  const extra = MANUAL_STANDINGS[t.id] || t.cup ? [] : [...matches.values()].filter((m) => m.tgScore && m.score);
  if (extra.length) {
    standings = standings.map((r) => ({ ...r }));
    const row = (name) => standings.find((r) => r.team.toLowerCase() === name.toLowerCase()) || (standings.push({ team: name, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 }), standings.at(-1));
    for (const m of extra) for (const [team, f, g] of [[m.home, m.score[0], m.score[1]], [m.away, m.score[1], m.score[0]]]) {
      const r = row(team);
      r.p++; r.gf += f; r.ga += g;
      if (f > g) { r.w++; r.pts += 3; } else if (f === g) { r.d++; r.pts += 1; } else r.l++;
    }
    standings.sort((x, y) => y.pts - x.pts || (y.gf - y.ga) - (x.gf - x.ga) || y.gf - x.gf);
  }
  return {
    ...t,
    standings,
    matches: [...matches.values()].map((m) => ({ ...m, t: t.id, us: t.team, key: t.id + ":" + m.date + (m.appKey ? ":" + m.appKey : "") })),
    updated: a.at, ok: a.ok !== false,
  };
});
let T, TBY, ALL_MATCHES;
const rebuild = () => { T = buildT(); TBY = Object.fromEntries(T.map((t) => [t.id, t])); ALL_MATCHES = T.flatMap((t) => t.matches); };
rebuild();
const isUs = (m, name) => name === m.us;

function layout() {
  const cur = location.pathname.split("/").pop() || "index.html";
  const upd = AUTO_DATA.updated ? new Date(AUTO_DATA.updated).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }) : "—";
  document.body.insertAdjacentHTML("afterbegin", `
    <header class="header"><div class="header__in">
      <a class="brand" href="index.html"><img src="${CLUB.logo}" alt="" onerror="this.style.display='none'">${esc(CLUB.fullName)}</a>
      <button class="burger" aria-label="Меню" onclick="document.querySelector('.nav').classList.toggle('open')">☰</button>
      <nav class="nav">${PAGES.map(([h, t]) => `<a href="${h}" class="${h === cur ? "active" : ""}">${t}</a>`).join("")}</nav>
    </div></header>`);
  document.body.insertAdjacentHTML("beforeend", `
    <footer class="footer">${esc(CLUB.fullName)} · ${esc(CLUB.city)} ·
      <a href="${CLUB.telegram}" target="_blank">Телеграм</a> · <a href="${CLUB.goalstream}" target="_blank">Goalstream</a><br>
      Таблицы и матчи обновлены ${esc(upd)}</footer>`);
}

// ---------- матчи ----------
function result(m) {
  if (!m.score) return null;
  const [h, a] = m.score;
  const ours = m.home === m.us ? h : a, theirs = m.home === m.us ? a : h;
  return ours > theirs ? "W" : ours < theirs ? "L" : "D";
}
const RES_TXT = { W: "Победа", D: "Ничья", L: "Поражение" };
const RES_LETTER = { W: "В", D: "Н", L: "П" };

// идёт ли матч сейчас: от 30 минут до начала до 3 часов после, пока нет итогового счёта
const kickoff = (m) => new Date(`${m.date}T${m.time || "12:00"}:00+0${TELEGRAM.tz ?? 7}:00`); // время Красноярска у любого зрителя
const isLive = (m) => !m.score && !!m.time && Date.now() > kickoff(m) - 30 * 6e4 && Date.now() < +kickoff(m) + 3 * 36e5;

function matchCard(m) {
  const r = result(m);
  const live = isLive(m), sc = m.score || m.liveScore;
  const center = sc ? `<div class="match__score">${sc[0]} : ${sc[1]}</div>` : `<div class="match__vs">${esc(m.time || "vs")}</div>`;
  const tag = r ? `<span class="badge ${r}">${RES_TXT[r]}</span>` : live ? `<span class="live-badge">● онлайн</span>` : m.time ? `<span class="countdown" data-at="${m.date}T${m.time}"></span>` : "";
  const t = TBY[m.t];
  return `<div class="card match match--link" data-match="${esc(m.key)}" tabindex="0" role="button" aria-label="Матч: ${esc(m.home)} — ${esc(m.away)}">
    <div class="match__meta"><span>${fmtDate(m.date)}${m.time ? " · " + esc(m.time) : ""}</span><span class="tag tag-${m.t}">${esc(t.short)}${m.round ? " · " + esc(m.round) : ""}</span></div>
    <div class="match__row">
      <div class="match__team ${isUs(m, m.home) ? "us" : ""}">${esc(m.home)}</div>${center}
      <div class="match__team ${isUs(m, m.away) ? "us" : ""}">${esc(m.away)}</div>
    </div>
    <div class="match__foot"><span class="muted">${m.venue ? "📍 " + esc(m.venue) : ""}</span>${tag}</div>
    ${scorersLine(m)}
    <div class="match__more">${m.stream && !m.score ? "📺 трансляция · " : ""}${(m.goals || []).length ? "голы и состав" : "о матче"} →</div>
  </div>`;
}

// кто сыграл матч: ручной состав (MANUAL_LINEUPS) или распознанная картинка + авторы голов/передач
function playedIn(m) {
  const manual = typeof MANUAL_LINEUPS !== "undefined" ? MANUAL_LINEUPS[`${m.t}:${m.date}`] : null;
  const set = new Set(manual || m.lineup || []);
  if (!manual) for (const g of m.goals || []) {
    if (g.opp) continue;
    if (g.scorer && !/автогол/i.test(g.scorer)) set.add(g.scorer);
    if (g.assist) set.add(g.assist);
  }
  if (m.mvp && !manual) set.add(m.mvp);
  return m.score || set.size ? set : new Set();
}

// «⚽ Мустафин ×7, Андриевич ×3 …»
function scorersLine(m) {
  const ours = (m.goals || []).filter((g) => !g.opp && g.scorer);
  if (!ours.length) return "";
  const cnt = new Map();
  for (const g of ours) { const n = /автогол/i.test(g.scorer) ? "автогол" : g.scorer.split(" ").slice(-1)[0]; cnt.set(n, (cnt.get(n) || 0) + 1); }
  return `<div class="match__goals">⚽ ${[...cnt].map(([n, c]) => esc(n) + (c > 1 ? ` ×${c}` : "")).join(", ")}${m.mvp ? `<br>⭐ Лучший игрок: ${esc(m.mvp)}` : ""}</div>`;
}

function tickCountdowns() {
  document.querySelectorAll(".countdown").forEach((el) => {
    const diff = new Date(el.dataset.at) - new Date();
    if (diff <= 0) { el.textContent = "Ожидается счёт"; return; }
    const d = Math.floor(diff / 864e5), h = Math.floor(diff / 36e5) % 24, mi = Math.floor(diff / 6e4) % 60;
    el.textContent = `через ${d ? d + " д " : ""}${h} ч ${mi} мин`;
  });
}

function standingsTable(t) {
  const rows = t.standings;
  if (!rows.length) return `<div class="card muted">Таблица пока не загружена. <a href="${t.source}" target="_blank">Смотреть на сайте турнира →</a></div>`;
  const hasGoals = rows.some((r) => r.gf != null);
  return `<div class="table-wrap"><table>
    <thead><tr><th>#</th><th class="l">Команда</th><th>И</th><th>В</th><th>Н</th><th>П</th>${hasGoals ? "<th>Мячи</th>" : ""}<th>О</th></tr></thead>
    <tbody>${rows.map((r, i) => `<tr class="${r.team === t.team ? "us" : ""}">
      <td>${i + 1}</td><td class="l">${esc(r.team)}</td><td>${r.p ?? "–"}</td><td>${r.w ?? "–"}</td><td>${r.d ?? "–"}</td><td>${r.l ?? "–"}</td>
      ${hasGoals ? `<td>${r.gf ?? "–"}:${r.ga ?? "–"}</td>` : ""}<td class="pts">${r.pts ?? "–"}</td></tr>`).join("")}
    </tbody></table></div>
    <p class="muted" style="font-size:13px">Источник: <a href="${t.source}" target="_blank">${esc(new URL(t.source).hostname)}</a>${t.ok ? "" : " · ⚠ последнее обновление не удалось"}</p>`;
}

function tabs(id, items, active, onPick, cls = "chip") {
  const el = typeof id === "string" ? document.getElementById(id) : id;
  el.innerHTML = items.map(([k, v]) => `<button class="${cls} ${k === active ? "active" : ""}" data-k="${k}">${esc(v)}</button>`).join("");
  el.querySelectorAll("button").forEach((b) => (b.onclick = () => {
    el.querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
    onPick(b.dataset.k);
  }));
  onPick(active);
}

// ---------- страницы ----------
function tournamentSummary(t) {
  if (t.cup) {
    const last = t.matches.filter((m) => m.score).sort((a, b) => b.date.localeCompare(a.date))[0];
    const r = last && result(last);
    return `<div class="card tsum">
      <div class="tsum__head"><span class="tag tag-${t.id}">${esc(t.short)}</span><span class="muted">как «${esc(t.team)}»</span></div>
      <div class="tsum__name">${esc(t.full)}</div>
      <div class="tsum__nums">
        <div><b>${last ? esc(last.round || "—") : "—"}</b><span>${last ? (r === "W" ? "пройден ✅" : r === "L" ? "вылет" : "стадия") : "ещё не стартовали"}</span></div>
        ${last ? `<div><b>${last.score.join(":")}</b><span>${esc(last.home === t.team ? last.away : last.home)}</span></div>` : ""}
      </div></div>`;
  }
  const me = t.standings.find((r) => r.team === t.team);
  const place = me ? t.standings.indexOf(me) + 1 : null;
  const form = t.matches.filter((m) => m.score).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 5)
    .map((m) => `<span class="badge ${result(m)}" title="${esc(m.home)} ${m.score.join(":")} ${esc(m.away)} — ${RES_TXT[result(m)]}">${RES_LETTER[result(m)]}</span>`).join(" ");
  return `<div class="card tsum">
    <div class="tsum__head"><span class="tag tag-${t.id}">${esc(t.short)}</span><span class="muted">как «${esc(t.team)}»</span></div>
    <div class="tsum__name">${esc(t.full)}</div>
    <div class="tsum__nums">
      <div><b>${place ?? "–"}</b><span>место</span></div>
      <div><b>${me?.pts ?? "–"}</b><span>очков</span></div>
      <div><b>${me ? `${me.w}-${me.d}-${me.l}` : "–"}</b><span>В-Н-П</span></div>
    </div>
    ${form ? `<div class="muted" style="font-size:13px">Форма: ${form}</div>` : ""}
  </div>`;
}

function pageHome() {
  const now = new Date();
  const when = (m) => new Date(`${m.date}T${m.time || "23:59"}`);
  const played = ALL_MATCHES.filter((m) => m.score).sort((a, b) => when(b) - when(a));
  const upcoming = ALL_MATCHES.filter((m) => !m.score && when(m) >= new Date(now - 3 * 36e5)).sort((a, b) => when(a) - when(b));
  $("#app").innerHTML = `
    <section class="hero">
      <img src="${CLUB.logo}" alt="Эмблема" onerror="this.style.display='none'">
      <div><h1>${esc(CLUB.fullName)}</h1><p>${esc(CLUB.city)} · ${T.length} турнира в сезоне ${esc(T[0].season)}</p></div>
      <div class="hero__stats">
        <div class="hero__stat"><b>${played.length}</b><span>сыграно</span></div>
        <div class="hero__stat"><b>${played.filter((m) => result(m) === "W").length}</b><span>побед</span></div>
        ${played.some((m) => result(m) === "D") ? `<div class="hero__stat"><b>${played.filter((m) => result(m) === "D").length}</b><span>ничьих</span></div>` : ""}
        <div class="hero__stat"><b>${played.reduce((s, m) => s + (m.home === m.us ? m.score[0] : m.score[1]), 0)}</b><span>забито</span></div>
      </div>
    </section>
    <div class="grid grid-2" style="margin-top:16px">${T.map(tournamentSummary).join("")}</div>
    <div class="grid grid-2">
      <div><h2>Ближайшие матчи</h2><div class="grid">${upcoming.length ? upcoming.slice(0, 4).map(matchCard).join("") : '<div class="card muted">Расписание пока не опубликовано</div>'}</div></div>
      <div><h2>Последние результаты</h2><div class="grid">${played.length ? played.slice(0, 4).map(matchCard).join("") : '<div class="card muted">Сыгранных матчей пока нет</div>'}</div></div>
    </div>
    <h2>Турнирные таблицы</h2>
    <div class="filters" id="ttabs"></div><div id="table"></div>
    <h2>Все матчи сезона</h2>
    <div class="filters" id="mtabs"></div><div class="grid grid-2" id="allm"></div>
    <h2>Новости и медиа</h2><div class="grid grid-3">${ALL_CONTENT.filter((c) => c.type === "news" || c.source === "vk").sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3).map((c) => postCard(c, ALL_CONTENT.indexOf(c))).join("")}</div>`;
  const tKey = TBY[store.get("tab")] ? store.get("tab") : T[0].id;
  tabs("ttabs", T.filter((t) => !t.cup).map((t) => [t.id, t.short]), TBY[tKey]?.cup ? T[0].id : tKey, (k) => { $("#table").innerHTML = standingsTable(TBY[k]); store.set("tab", k); });
  tabs("mtabs", [["all", "Все"], ...T.map((t) => [t.id, t.short])], "all", (k) => {
    const list = ALL_MATCHES.filter((m) => k === "all" || m.t === k).sort((a, b) => when(a) - when(b));
    $("#allm").innerHTML = list.map(matchCard).join("") || '<div class="card muted">Матчей пока нет</div>';
    tickCountdowns();
  });
  tickCountdowns(); window.__cd ||= setInterval(tickCountdowns, 30000);
}

const POS_NAMES = { ВРТ: "Вратари", ЗАЩ: "Защитники", ПЗ: "Полузащитники", НАП: "Нападающие" };
const POS_ONE = { ВРТ: "Вратарь", ЗАЩ: "Защитник", ПЗ: "Полузащитник", НАП: "Нападающий" };
function personCard(p, sub, num) {
  const isPl = PLAYERS.some((x) => x.name === p.name);
  return `<div class="card person${isPl ? " person--link" : ""}"${isPl ? ` data-player="${esc(p.name)}" tabindex="0" role="button" aria-label="Статистика: ${esc(p.name)}"` : ""}>
    <div class="person__photo">${p.photo ? `<img src="${p.photo}" alt="" loading="lazy" onerror="this.replaceWith('${initials(p.name)}')">` : initials(p.name)}${num != null ? `<span class="person__num">${num}</span>` : ""}${p.captain ? `<span class="person__cap" title="Капитан">C</span>` : ""}</div>
    <div class="person__body"><div class="person__name">${esc(p.name)}</div><div class="person__role">${esc(sub)}${p.captain ? " · капитан" : ""}</div></div></div>`;
}
function pageTeam() {
  $("#app").innerHTML = `
    <h1>Команда</h1><p class="sub">Состав ${esc(CLUB.fullName)} на сезон ${esc(T[0].season)}. В ФБЛ выступаем как «${esc(TBY.fbl?.team || "")}».</p>
    <h2>Тренер и руководство</h2><div class="grid grid-cards">${STAFF.map((s) => personCard(s, s.role)).join("")}</div>
    <h2>Игроки</h2>
    <div class="filters" id="ptabs"></div>
    <div class="grid grid-cards" id="players"></div>`;
  const usedPos = Object.keys(POS_NAMES).filter((k) => PLAYERS.some((p) => p.pos === k));
  tabs("ptabs", [["all", "Все"], ...usedPos.map((k) => [k, POS_NAMES[k]])], "all", (f) => {
    const order = Object.keys(POS_ONE);
    const list = PLAYERS.filter((p) => f === "all" || p.pos === f)
      .sort((a, b) => ((order.indexOf(a.pos) + 9) % 9) - ((order.indexOf(b.pos) + 9) % 9) || (a.num ?? 99) - (b.num ?? 99));
    $("#players").innerHTML = list.map((p) => personCard(p, POS_ONE[p.pos] || "Игрок", p.num)).join("") || '<p class="muted">Нет игроков</p>';
  });
}

function pageStats() {
  $("#app").innerHTML = `<h1>Статистика</h1><p class="sub">Игры, голы и передачи игроков</p>
    <div class="seg" id="sseg"></div><div class="filters" id="stabs"></div><div id="sbody"></div>`;
  // голы и передачи из телеграма → строки {t, name, goals, assists}
  const auto = [];
  for (const t of T) for (const m of t.matches) for (const g of m.goals || []) {
    if (g.opp) continue;
    if (g.scorer && !/автогол/i.test(g.scorer)) auto.push({ t: t.id, name: g.scorer, goals: 1 });
    if (g.assist) auto.push({ t: t.id, name: g.assist, assists: 1 });
  }
  for (const t of T) for (const m of t.matches) if (m.score) for (const n of playedIn(m)) auto.push({ t: t.id, name: n, games: 1 });
  const all = [...auto, ...PLAYER_STATS];
  if (!all.length) {
    $("#sbody").innerHTML = `<div class="card empty"><div class="empty__icon">📊</div><h2>Статистика скоро появится</h2><p class="muted">Голы и передачи подтягиваются из телеграм-канала команды.</p><a class="btn" href="${CLUB.telegram}" target="_blank">Телеграм-канал</a></div>`;
    return;
  }
  const hasGames = all.some((s) => s.games), hasYc = PLAYER_STATS.some((s) => s.yc);
  const hasNum = PLAYERS.some((p) => p.num != null);
  const cols = [hasNum && ["num", "№"], ["name", "Игрок", "l"], hasGames && ["games", "И"], ["goals", "Голы"], ["assists", "Пасы"], ["ga", "Г+П"], hasYc && ["yc", "ЖК"]].filter(Boolean);
  let key = "ga", dir = -1, rows = [];
  const draw = () => {
    const sorted = [...rows].sort((a, b) => (typeof a[key] === "string" ? a[key].localeCompare(b[key]) : (a[key] || 0) - (b[key] || 0)) * dir || b.goals - a.goals || a.name.localeCompare(b.name));
    $("#stable").innerHTML = `<div class="table-wrap"><table>
      <thead><tr>${cols.map(([k, t, c]) => `<th class="sortable ${c || ""}" data-k="${k}">${t}${k === key ? (dir < 0 ? " ▼" : " ▲") : ""}</th>`).join("")}</tr></thead>
      <tbody>${sorted.map((r) => `<tr class="row-link" data-player="${esc(r.name)}">${cols.map(([k, , c]) => `<td class="${c || ""}">${esc(r[k] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    document.querySelectorAll("th.sortable").forEach((th) => (th.onclick = () => { dir = th.dataset.k === key ? -dir : -1; key = th.dataset.k; draw(); }));
  };
  const leader = (k, label) => { const t = [...rows].sort((a, b) => (b[k] || 0) - (a[k] || 0))[0]; return `<div class="card leader"><div class="leader__val">${t ? t[k] || 0 : "–"}</div><div><div class="leader__label">${label}</div><div><b>${t ? esc(t.name) : "—"}</b></div></div></div>`; };
  const career = typeof CAREER_BEFORE !== "undefined" ? CAREER_BEFORE : [];
  const render = (f) => {
    const agg = {};
    const src = f === "career" ? [...all, ...career] : all.filter((s) => f === "all" || s.t === f);
    for (const s of src) {
      const r = (agg[s.name] ||= { name: s.name, num: PLAYERS.find((p) => p.name === s.name)?.num ?? "", games: 0, goals: 0, assists: 0, yc: 0 });
      for (const k of ["games", "goals", "assists", "yc"]) r[k] += s[k] || 0;
    }
    rows = Object.values(agg).map((r) => ({ ...r, ga: r.goals + r.assists }));
    // «За всё время» — только текущий состав (ушедшие игроки остаются в архиве CAREER_BEFORE)
    if (f === "career") rows = rows.filter((r) => PLAYERS.some((p) => p.name === r.name));
    // травмированные — в таблице, даже если в сезоне ещё не играли
    if (f === "all" || f === "career") for (const p of PLAYERS.filter((p) => p.injured && !rows.some((r) => r.name === p.name)))
      rows.push({ name: p.name, num: p.num ?? "", games: 0, goals: 0, assists: 0, yc: 0, ga: 0 });
    const played = T.filter((t) => f === "all" || t.id === f).flatMap((t) => t.matches).filter((m) => m.goals);
    // забито/пропущено — по итоговому счёту матчей (официальному), а не по постам с голами
    const done = T.filter((t) => f === "all" || t.id === f).flatMap((t) => t.matches).filter((m) => m.score);
    const ours = (m) => (m.home === m.us ? m.score[0] : m.score[1]), theirs = (m) => (m.home === m.us ? m.score[1] : m.score[0]);
    const summary = f === "career"
      ? `<p class="muted">За всё время (игроки текущего состава): архив клуба до сезона ${esc(T[0].season)} + текущий сезон (обновляется автоматически)</p>`
      : `<p class="muted">Сыграно матчей: ${done.length} · забито ${done.reduce((s, m) => s + ours(m), 0)} · пропущено ${done.reduce((s, m) => s + theirs(m), 0)}
      · источник: <a href="https://t.me/${TELEGRAM.channel}" target="_blank">t.me/${TELEGRAM.channel}</a></p>`;
    $("#sbody").innerHTML = summary + `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">
      ${leader("goals", "Лучший бомбардир")}${leader("assists", "Лучший ассистент")}${leader("ga", "Гол + пас")}</div><h2>Все игроки</h2><div id="stable"></div>`;
    draw();
  };
  const tourTabs = () => tabs("stabs", [["all", "Все турниры"], ...T.map((t) => [t.id, t.short])], "all", render);
  if (!career.length) { $("#sseg").remove(); return tourTabs(); }
  tabs("sseg", [["season", "Сезон " + T[0].season], ["career", "За всё время"]], "season", (m) => {
    $("#stabs").hidden = m === "career";
    if (m === "career") render("career"); else tourTabs();
  }, "seg__btn");
}

const TYPE_ICON = { news: "📰", photo: "📷", video: "🎬", clip: "📱" };
const TYPE_NAME = { news: "Новости", photo: "Фото", video: "Видео", clip: "Клипы" };

// посты VK → единый формат контента
const VK_DATA = AUTO_DATA.vk || { posts: [], albums: [] };
const VK_ITEMS = VK_DATA.posts.map((p) => {
  const lines = p.text.split("\n").map((l) => l.trim()).filter(Boolean);
  const title = (lines[0] || "").replace(/[❗️💥🔥⚡️]+/g, "").trim();
  const type = p.video ? (p.video.clip ? "clip" : "video") : p.photos.length ? "photo" : "news";
  return {
    type, date: p.date.slice(0, 10), source: "vk",
    title: title.length > 90 ? title.slice(0, 88) + "…" : title || (p.video?.title ?? (p.photos.length ? `Фото (${p.photos.length})` : "")),
    text: lines.slice(1).join(" ").slice(0, 280) + (lines.slice(1).join(" ").length > 280 ? "…" : ""),
    image: p.video?.image || p.photos[0]?.small || "", photos: p.photos, link: p.video?.link || p.link,
  };
});
const ALL_CONTENT = [...CONTENT, ...VK_ITEMS];

function postCard(c, i) {
  const isVid = c.type === "video" || c.type === "clip";
  const media = c.image
    ? `<img src="${c.image}" alt="" loading="lazy">${isVid ? '<span class="post__play">▶</span>' : ""}${c.photos?.length > 1 ? `<span class="post__count">📷 ${c.photos.length}</span>` : ""}`
    : TYPE_ICON[c.type] || "⚽";
  const open = c.photos?.length ? `href="#" data-gallery="${i}"` : c.link ? `href="${c.link}" target="_blank"` : "";
  return `<article class="card post">
    <a class="post__img ${c.type === "clip" ? "post__img--clip" : ""}" ${open}>${media}</a>
    <div class="post__date">${fmtDate(c.date)} · ${TYPE_NAME[c.type] || ""}${c.source === "vk" ? " · VK" : ""}</div>
    ${c.title ? `<h3>${esc(c.title)}</h3>` : ""}${c.text ? `<p>${esc(c.text)}</p>` : ""}
    ${c.link ? `<a class="muted" href="${c.link}" target="_blank" style="font-size:14px">${isVid ? "Смотреть в VK →" : "Подробнее →"}</a>` : ""}</article>`;
}

function albumCard(a) {
  return `<a class="card album" href="${a.link}" target="_blank">
    <div class="album__cover">${a.cover ? `<img src="${a.cover}" alt="" loading="lazy">` : "📷"}</div>
    <div class="album__body"><b>${esc(a.title)}</b><span class="muted">${a.size} фото</span></div></a>`;
}

// простой просмотрщик фото
function openGallery(photos, start = 0) {
  let i = start;
  const box = document.createElement("div");
  box.className = "lightbox";
  const draw = () => (box.innerHTML = `<button class="lb-x" aria-label="Закрыть">✕</button>
    ${photos.length > 1 ? '<button class="lb-prev" aria-label="Назад">‹</button><button class="lb-next" aria-label="Вперёд">›</button>' : ""}
    <img src="${photos[i].big}" alt=""><div class="lb-n">${i + 1} / ${photos.length}</div>`);
  const go = (d) => { i = (i + d + photos.length) % photos.length; draw(); };
  const onKey = (e) => { if (e.key === "Escape") close(); if (e.key === "ArrowRight") go(1); if (e.key === "ArrowLeft") go(-1); };
  const close = () => { box.remove(); document.removeEventListener("keydown", onKey); };
  box.onclick = (e) => {
    if (e.target.classList.contains("lb-prev")) go(-1);
    else if (e.target.classList.contains("lb-next")) go(1);
    else if (e.target.tagName !== "IMG") close();
  };
  document.addEventListener("keydown", onKey);
  draw();
  document.body.appendChild(box);
}

function pageMedia() {
  const vkLink = typeof VK_PUBLIC !== "undefined" ? VK_PUBLIC.url : "";
  $("#app").innerHTML = `
    <h1>Контент</h1><p class="sub">Новости, фото, видео и клипы команды${vkLink ? ` · из <a href="${vkLink}" target="_blank">VK</a>` : ""}</p>
    ${vkLink && !VK_DATA.posts.length ? `<h2 style="margin-top:8px">Лента VK</h2><div class="card vkwidget"><div id="vk_groups"></div></div><h2>Материалы команды</h2>` : ""}
    <div class="filters" id="ctabs"></div>
    <div id="albums"></div>
    <div class="grid grid-3" id="posts"></div>
    <div class="note" style="margin-top:20px">Больше материалов — в ${vkLink ? `<a href="${vkLink}" target="_blank">VK-паблике</a> и ` : ""}<a href="${CLUB.telegram}" target="_blank">телеграм-канале</a> команды.</div>`;
  // официальный виджет сообщества VK (без ключа): лента постов паблика
  if (document.getElementById("vk_groups")) {
    const draw = () => {
      const el = document.getElementById("vk_groups");
      el.innerHTML = "";
      window.VK.Widgets.Group("vk_groups", { mode: 4, wide: 1, no_cover: 0, width: "auto", height: 900, color1: "FFFFFF", color3: "1F7A3A" }, VK_PUBLIC.groupId);
    };
    const sc = document.createElement("script");
    sc.src = "https://vk.com/js/api/openapi.js?169";
    sc.onload = draw;
    sc.onerror = () => (document.getElementById("vk_groups").innerHTML = `<p class="muted">Лента VK не загрузилась. <a href="${vkLink}" target="_blank">Открыть паблик →</a></p>`);
    document.head.appendChild(sc);
  }
  const types = Object.keys(TYPE_NAME).filter((k) => ALL_CONTENT.some((c) => c.type === k));
  const tabsList = [["all", "Всё"], ...types.map((k) => [k, TYPE_NAME[k]])];
  if (VK_DATA.albums.length) tabsList.push(["albums", "Альбомы"]);
  tabs("ctabs", tabsList, "all", (f) => {
    const list = f === "albums" ? [] : ALL_CONTENT.filter((c) => f === "all" || c.type === f).sort((a, b) => b.date.localeCompare(a.date));
    const showAlbums = f === "albums" || (f === "photo" && VK_DATA.albums.length);
    $("#albums").innerHTML = showAlbums ? `<h2 style="margin-top:0">Альбомы</h2><div class="grid grid-3">${VK_DATA.albums.map(albumCard).join("")}</div>${f === "photo" ? "<h2>Посты с фото</h2>" : ""}` : "";
    $("#posts").innerHTML = list.map((c) => postCard(c, ALL_CONTENT.indexOf(c))).join("") || (f === "albums" ? "" : '<p class="muted">Здесь пока пусто</p>');
  });
}

function pageShop() {
  $("#app").innerHTML = SHOP.length
    ? `<h1>Магазин</h1><div class="grid grid-cards">${SHOP.map((i) => `<div class="card">${i.image ? `<img src="${i.image}" alt="">` : ""}<h3>${esc(i.name)}</h3><b>${esc(i.price)} ₽</b></div>`).join("")}</div>`
    : `<h1>Магазин</h1><div class="card empty"><div class="empty__icon">🛒</div><h2>Магазин скоро откроется</h2>
       <p class="muted">Здесь появится фирменная форма, шарфы и атрибутика ${esc(CLUB.fullName)}.<br>Следите за новостями в телеграм-канале.</p>
       <a class="btn" href="${CLUB.telegram}" target="_blank">Телеграм-канал</a></div>`;
}

// ---------- личная карточка игрока ----------
function playerData(name) {
  const tours = {}, games = [];
  for (const t of T) for (const m of t.matches) {
    let g = 0, a = 0; const mins = [];
    for (const e of m.goals || []) {
      if (e.opp) continue;
      if (e.scorer === name) { g++; if (e.min) mins.push(e.min + "'"); }
      if (e.assist === name) a++;
    }
    const mvp = m.mvp === name;
    const played = !!m.score && playedIn(m).has(name);
    if (!g && !a && !mvp && !played) continue;
    const r = (tours[t.id] ||= { goals: 0, assists: 0, mvp: 0, matches: 0, games: 0 });
    r.goals += g; r.assists += a; r.mvp += mvp ? 1 : 0; r.matches++; r.games += played ? 1 : 0;
    games.push({ t, m, g, a, mvp, mins });
  }
  for (const s of PLAYER_STATS.filter((x) => x.name === name)) {
    const r = (tours[s.t] ||= { goals: 0, assists: 0, mvp: 0, matches: 0 });
    r.goals += s.goals || 0; r.assists += s.assists || 0; r.games = (r.games || 0) + (s.games || 0); r.yc = (r.yc || 0) + (s.yc || 0);
  }
  const sum = (k) => Object.values(tours).reduce((x, r) => x + (r[k] || 0), 0);
  return { tours, games: games.sort((x, y) => y.m.date.localeCompare(x.m.date)), total: { goals: sum("goals"), assists: sum("assists"), mvp: sum("mvp"), games: sum("games"), yc: sum("yc") } };
}

function openPlayer(name) {
  const p = PLAYERS.find((x) => x.name === name) || { name };
  const staff = STAFF.find((x) => x.name === name);
  const d = playerData(name);
  const c = (typeof CAREER_BEFORE !== "undefined" ? CAREER_BEFORE : []).find((x) => x.name === name);
  const tile = (v, l) => `<div class="pm__tile"><b>${v}</b><span>${l}</span></div>`;
  const rows = T.filter((t) => d.tours[t.id]).map((t) => { const r = d.tours[t.id];
    return `<tr><td class="l"><span class="tag tag-${t.id}">${esc(t.short)}</span></td><td>${r.games || "–"}</td><td>${r.goals}</td><td>${r.assists}</td><td><b>${r.goals + r.assists}</b></td><td>${r.mvp || "–"}</td></tr>`; }).join("");
  const games = d.games.map(({ t, m, g, a, mvp, mins }) => {
    const opp = m.home === m.us ? m.away : m.home;
    const r = result(m);
    return `<li class="pm__game">
      <div class="pm__gmeta"><span>${fmtDate(m.date)}</span><span class="tag tag-${t.id}">${esc(t.short)}</span></div>
      <div class="pm__gline">${r ? `<span class="badge ${r}">${m.score.join(":")}</span>` : ""} <span>${esc(opp)}</span> <span class="muted" style="font-weight:400;font-size:13px">${m.home === m.us ? "дома" : "в гостях"}</span></div>
      <div class="pm__gcontrib">${g ? `⚽ ${g}${mins.length ? ` <span class="muted">(${mins.join(", ")})</span>` : ""}` : ""} ${a ? `🅰️ ${a}` : ""} ${mvp ? "⭐ лучший игрок" : ""}${!g && !a && !mvp ? "<span class=\"muted\">в составе</span>" : ""}</div></li>`;
  }).join("");
  const box = document.createElement("div");
  box.className = "pmodal";
  box.innerHTML = `<div class="pm" role="dialog" aria-modal="true" aria-label="${esc(name)}">
    <button class="pm__x" aria-label="Закрыть">✕</button>
    <div class="pm__head">
      <div class="pm__photo">${p.photo ? `<img src="${p.photo}" alt="">` : initials(name)}</div>
      <div>
        <div class="pm__name">${esc(name)}${p.captain ? ' <span class="person__cap" style="position:static;display:inline-grid;width:24px;height:24px;font-size:13px">C</span>' : ""}</div>
        <div class="muted">${[p.num != null ? "№ " + p.num : "", POS_ONE[p.pos] || "", p.captain ? "капитан" : "", staff ? staff.role.toLowerCase() : ""].filter(Boolean).join(" · ")}</div>
      </div>
    </div>
    ${c ? `<div class="seg pm__seg"></div>` : ""}
    <div class="pm__season"><div class="pm__tiles">${tile(d.total.games, "игр")}${tile(d.total.goals, "голов")}${tile(d.total.assists, "передач")}${tile(d.total.goals + d.total.assists, "гол + пас")}${tile(d.total.mvp, "лучший игрок")}${d.total.yc ? tile(d.total.yc, "ЖК") : ""}</div>
    ${rows ? `<h3>По турнирам</h3><div class="table-wrap"><table><thead><tr><th class="l">Турнир</th><th>И</th><th>Голы</th><th>Пасы</th><th>Г+П</th><th>⭐</th></tr></thead><tbody>${rows}</tbody></table></div>` : `<p class="muted" style="margin-top:16px">В этом сезоне пока без голов и передач.</p>`}
    ${games ? `<h3>Сыгранные матчи</h3><ul class="pm__games">${games}</ul>` : ""}
    <p class="muted" style="font-size:12px;margin:14px 0 0">Сезон ${esc(T[0].season)} · голы и передачи по протоколам и телеграм-каналу команды</p></div>
    ${c ? (() => { const g = (c.games || 0) + d.total.games, gl = (c.goals || 0) + d.total.goals, a = (c.assists || 0) + d.total.assists;
      return `<div class="pm__career" hidden><div class="pm__tiles">${tile(g, "игр")}${tile(gl, "голов")}${tile(a, "передач")}${tile(gl + a, "гол + пас")}</div>
      <p class="muted" style="font-size:12px;margin:14px 0 0">Архив клуба до сезона ${esc(T[0].season)} + текущий сезон</p></div>`; })() : ""}
  </div>`;
  if (c) tabs(box.querySelector(".pm__seg"), [["season", "Сезон " + T[0].season], ["career", "За всё время"]], "season", (m) => {
    box.querySelector(".pm__season").hidden = m !== "season";
    box.querySelector(".pm__career").hidden = m !== "career";
  }, "seg__btn");
  const close = () => { box.remove(); document.removeEventListener("keydown", onKey); if (location.hash.startsWith("#player=")) history.replaceState(null, "", location.pathname + location.search); };
  const onKey = (e) => e.key === "Escape" && close();
  box.onclick = (e) => { if (e.target === box || e.target.closest(".pm__x")) close(); };
  document.addEventListener("keydown", onKey);
  document.body.appendChild(box);
  history.replaceState(null, "", "#player=" + encodeURIComponent(name));
}
document.addEventListener("click", (e) => { const el = e.target.closest("[data-player]"); if (el) openPlayer(el.dataset.player); });
document.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.matches?.("[data-player]")) { e.preventDefault(); openPlayer(e.target.dataset.player); } });

// ---------- окно матча: трансляция, голы, состав ----------
// ссылка на трансляцию → адрес встраиваемого плеера (VK видео / YouTube / Twitch)
function streamEmbed(url) {
  let m;
  if ((m = url.match(/(?:video|live|clip)(-?\d+)_(\d+)/))) return `https://vkvideo.ru/video_ext.php?oid=${m[1]}&id=${m[2]}&hd=2`;
  if ((m = url.match(/(?:youtu\.be\/|[?&]v=|\/live\/|\/embed\/|\/shorts\/)([\w-]{11})/))) return `https://www.youtube.com/embed/${m[1]}`;
  if ((m = url.match(/twitch\.tv\/(\w+)/))) return `https://player.twitch.tv/?channel=${m[1]}&parent=${location.hostname}`;
  return null;
}
const hhmm = (iso) => new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Krasnoyarsk" });

function matchBody(m) {
  const r = result(m), live = isLive(m), sc = m.score || m.liveScore, t = TBY[m.t];
  const usHome = m.home === m.us;
  // счёт в постах — «наши:соперник»; показываем как в шапке — «хозяева:гости»
  const hs = (s) => { const [a, b] = s.split(":"); return usHome ? `${a}:${b}` : `${b}:${a}`; };
  const who = (n) => (PLAYERS.some((p) => p.name === n) ? `<span class="mm__p" data-player="${esc(n)}" role="button" tabindex="0">${esc(n)}</span>` : esc(n));
  const goals = (m.goals || []).map((g) => {
    const time = g.min != null ? `${g.min}′` : g.at ? hhmm(g.at) : "";
    const body = g.opp ? `<span class="muted">гол соперника</span>`
      : /автогол/i.test(g.scorer || "") ? "автогол соперника" + (g.assist ? ` <span class="muted">(${who(g.assist)})</span>` : "")
      : `${g.scorer ? who(g.scorer) : "—"}${g.assist ? ` <span class="muted">(пас: ${who(g.assist)})</span>` : ""}`;
    return `<li class="mm__goal${g.opp ? " mm__goal--opp" : ""}"><span class="mm__gs">${hs(g.score)}</span><span class="mm__gw">${g.opp ? "" : "⚽ "}${body}</span><span class="mm__gt muted">${time}</span></li>`;
  }).join("");
  const squad = [...playedIn(m)];
  const status = r ? `<span class="badge ${r}">${RES_TXT[r]}</span>`
    : live ? `<span class="live-badge">● онлайн</span> <span class="muted">обновляется раз в минуту${liveAt ? " · " + hhmm(liveAt) : ""}</span>`
    : m.time ? `<span class="countdown" data-at="${m.date}T${m.time}"></span>` : "";
  return `
    <div class="match__meta"><span>${fmtDate(m.date)}${m.time ? " · " + esc(m.time) : ""}</span><span class="tag tag-${m.t}">${esc(t.short)}${m.round ? " · " + esc(m.round) : ""}</span></div>
    <div class="match__row mm__row">
      <div class="match__team ${isUs(m, m.home) ? "us" : ""}">${esc(m.home)}</div>
      ${sc ? `<div class="match__score">${sc[0]} : ${sc[1]}</div>` : `<div class="match__vs">${esc(m.time || "vs")}</div>`}
      <div class="match__team ${isUs(m, m.away) ? "us" : ""}">${esc(m.away)}</div>
    </div>
    <div class="mm__status">${status}</div>
    ${m.venue ? `<p class="muted" style="margin:10px 0 0">📍 ${esc(m.venue)}</p>` : ""}
    <h3>Голы</h3>
    ${goals ? `<ul class="mm__goals">${goals}</ul>` : `<p class="muted">${live || !m.score ? "Голов пока нет — здесь они появятся по ходу матча." : "Авторы голов не указаны."}</p>`}
    ${m.mvp ? `<p style="margin:12px 0 0">⭐ Лучший игрок: ${who(m.mvp)}</p>` : ""}
    ${squad.length ? `<h3>Состав</h3><div class="mm__squad">${squad.map((n) => `<span class="chip"${PLAYERS.some((p) => p.name === n) ? ` data-player="${esc(n)}" role="button" tabindex="0"` : ""}>${esc(n)}</span>`).join("")}</div>` : ""}
    ${m.link && !/t\.me\//.test(m.link) ? `<p style="margin:16px 0 0"><a class="muted" href="${m.link}" target="_blank">Протокол у организаторов →</a></p>` : ""}`;
}

function openMatch(key) {
  const m = ALL_MATCHES.find((x) => x.key === key);
  if (!m) return;
  document.querySelector(".pmodal--match")?.remove();
  const src = m.stream && streamEmbed(m.stream);
  const box = document.createElement("div");
  box.className = "pmodal pmodal--match";
  box.dataset.key = key;
  box.innerHTML = `<div class="pm mm" role="dialog" aria-modal="true" aria-label="${esc(m.home)} — ${esc(m.away)}">
    <button class="pm__x" aria-label="Закрыть">✕</button>
    ${src ? `<div class="mm__video"><iframe src="${src}" data-stream="${esc(m.stream)}" allow="autoplay; encrypted-media; fullscreen; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`
      : m.stream ? `<a class="btn mm__watch" href="${esc(m.stream)}" target="_blank">📺 Смотреть трансляцию</a>` : ""}
    <div class="mm__body">${matchBody(m)}</div>
  </div>`;
  const close = () => { box.remove(); document.removeEventListener("keydown", onKey); if (location.hash.startsWith("#match=")) history.replaceState(null, "", location.pathname + location.search); };
  const onKey = (e) => e.key === "Escape" && !document.querySelector(".pmodal:not(.pmodal--match)") && close();
  box.onclick = (e) => { if (e.target === box || e.target.closest(".pm__x")) close(); };
  document.addEventListener("keydown", onKey);
  document.body.appendChild(box);
  tickCountdowns();
  history.replaceState(null, "", "#match=" + encodeURIComponent(key));
}
document.addEventListener("click", (e) => {
  if (e.target.closest("a, button, [data-player]")) return;
  const el = e.target.closest("[data-match]"); if (el) openMatch(el.dataset.match);
});
document.addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.matches?.("[data-match]")) { e.preventDefault(); openMatch(e.target.dataset.match); } });

// ---------- онлайн во время матча: live.json из ветки «live» раз в минуту ----------
// (кладёт .github/workflows/live.yml; GitHub API отдаёт свежий файл без кэша страниц)
let liveAt = null;
async function pollLive() {
  if (typeof LIVE === "undefined" || !ALL_MATCHES.some(isLive)) return;
  try {
    const r = await fetch(`https://api.github.com/repos/${LIVE.repo}/contents/live.json?ref=${LIVE.branch}`, { headers: { Accept: "application/vnd.github.raw+json" }, cache: "no-cache" });
    if (!r.ok) return;
    const j = await r.json();
    if (!j.at || j.at === liveAt) return;
    liveAt = j.at;
    const sig = () => JSON.stringify(ALL_MATCHES.map((m) => [m.key, m.score, m.liveScore, m.goals, m.stream]));
    const before = sig();
    const byPost = new Map(TG_MATCHES.map((m) => [m.post, m]));
    for (const m of j.matches || []) byPost.set(m.post, { ...byPost.get(m.post), ...m, lineup: byPost.get(m.post)?.lineup || m.lineup });
    TG_MATCHES = [...byPost.values()];
    rebuild();
    if (sig() !== before && document.body.dataset.page === "home") PAGE_FN(); // карточки матчей — только на главной
    const open = document.querySelector(".pmodal--match");
    if (open) { const m = ALL_MATCHES.find((x) => x.key === open.dataset.key); if (m) { open.querySelector(".mm__body").innerHTML = matchBody(m); tickCountdowns(); } }
  } catch {}
}

// ---------- эфир из приложения FootballLive: stream.json из ветки APP_STREAM.branch раз в минуту ----------
// Читаем через raw.githubusercontent.com, а не через API: у API 60 запросов в час на зрителя, и их уже
// расходует pollLive во время матча. raw без лимита, но может отдавать файл с задержкой до ~5 минут.
let appStreamsAt = null;
async function pollAppStreams() {
  if (typeof APP_STREAM === "undefined" || document.hidden) return;
  try {
    const r = await fetch(`https://raw.githubusercontent.com/${APP_STREAM.repo}/${APP_STREAM.branch}/${APP_STREAM.file}?t=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return;
    const j = await r.json();
    if (!j.at || j.at === appStreamsAt) return;
    appStreamsAt = j.at;
    const sig = () => JSON.stringify(ALL_MATCHES.map((m) => [m.key, m.stream, m.time]));
    const before = sig();
    APP_STREAMS = Array.isArray(j.matches) ? j.matches : [];
    rebuild();
    if (sig() === before) return;
    if (document.body.dataset.page === "home") PAGE_FN();
    // открытое окно матча: плеер мог появиться — открываем заново (только если ссылка изменилась)
    const open = document.querySelector(".pmodal--match");
    if (open) { const m = ALL_MATCHES.find((x) => x.key === open.dataset.key); if (m && m.stream && !open.querySelector(`iframe[data-stream="${CSS.escape(m.stream)}"]`)) openMatch(m.key); }
    else if (location.hash.startsWith("#match=")) openMatch(decodeURIComponent(location.hash.slice(7)));
  } catch {}
}

// клик по посту с фото → просмотрщик (на любой странице)
document.addEventListener("click", (e) => { const a = e.target.closest("[data-gallery]"); if (a) { e.preventDefault(); openGallery(ALL_CONTENT[+a.dataset.gallery].photos); } });
layout();
const PAGE_FN = ({ home: pageHome, team: pageTeam, stats: pageStats, media: pageMedia, shop: pageShop })[document.body.dataset.page];
PAGE_FN();
// ссылка вида team.html#player=Имя Фамилия открывает карточку сразу, index.html#match=fbl:2026-11-15 — матч
if (location.hash.startsWith("#player=")) openPlayer(decodeURIComponent(location.hash.slice(8)));
if (location.hash.startsWith("#match=")) openMatch(decodeURIComponent(location.hash.slice(7)));
pollLive(); setInterval(pollLive, 60000);
pollAppStreams(); setInterval(pollAppStreams, 60000);
document.addEventListener("visibilitychange", () => { if (!document.hidden) pollAppStreams(); });

// ---------- тема «Пятница, 13-е» (по времени Красноярска; для проверки — ?f13 в адресе) ----------
(() => {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en", { timeZone: "Asia/Krasnoyarsk", day: "numeric", weekday: "short" }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  // превью: ?f13 включает тему до закрытия вкладки (на всех страницах), ?f13=0 — выключает
  const q = new URLSearchParams(location.search);
  try { if (q.has("f13")) q.get("f13") === "0" ? sessionStorage.removeItem("f13") : sessionStorage.setItem("f13", "1"); } catch {}
  let preview = q.has("f13") && q.get("f13") !== "0";
  try { preview = preview || sessionStorage.getItem("f13") === "1"; } catch {}
  if ((p.day === "13" && p.weekday === "Fri") || preview) {
    const s = document.createElement("script"); s.src = "friday13.js?v=9"; document.body.appendChild(s);
  }
})();
