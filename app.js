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
const TG_MATCHES = AUTO_DATA.telegram?.matches || [];
// «КОБРА» → «Кобра», «1/16 ФИНАЛА» → «1/16 финала»
const tidy = (s) => (s === s.toUpperCase() ? s.toLowerCase().replace(/(^|[\s-])(\S)/g, (m, a, b) => a + b.toUpperCase()) : s);
const tidyRound = (s) => (s || "").toLowerCase();
const T = TOURNAMENTS.map((t) => {
  const a = AUTO_DATA.tournaments[t.id] || { standings: [], matches: [] };
  const matches = new Map(a.matches.map((m) => [m.id, { ...m }]));
  for (const mm of MANUAL_MATCHES.filter((m) => m.t === t.id)) {
    const other = mm.home === t.team ? mm.away : mm.home;
    const hit = [...matches.values()].find((m) => m.date === mm.date && (m.home === other || m.away === other));
    if (hit) Object.assign(hit, mm); else matches.set(`manual-${mm.date}-${other}`, { ...mm });
  }
  // матчи из телеграма: прикрепляем голы к матчу из таблицы или добавляем как новый
  for (const tm of TG_MATCHES.filter((m) => m.t === t.id)) {
    const opp = tidy(tm.opponent);
    const same = (m) => m.date === tm.date || (m.home + m.away).toLowerCase().includes(opp.toLowerCase()) && Math.abs(new Date(m.date) - new Date(tm.date)) < 3 * 864e5;
    const hit = [...matches.values()].find(same);
    if (hit) { hit.goals = tm.goals; if (!hit.score && tm.score && tm.finished) hit.score = hit.home === t.team ? tm.score : [tm.score[1], tm.score[0]]; if (!hit.round) hit.round = tidyRound(tm.round); }
    else matches.set("tg" + tm.post, { date: tm.date, time: "", home: t.team, away: opp, score: tm.finished ? tm.score : null, venue: "", round: tidyRound(tm.round), goals: tm.goals, link: `https://t.me/${TELEGRAM.channel}/${tm.post}` });
  }
  return {
    ...t,
    standings: MANUAL_STANDINGS[t.id] || a.standings,
    matches: [...matches.values()].map((m) => ({ ...m, t: t.id, us: t.team })),
    updated: a.at, ok: a.ok !== false,
  };
});
const TBY = Object.fromEntries(T.map((t) => [t.id, t]));
const ALL_MATCHES = T.flatMap((t) => t.matches);
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

function matchCard(m) {
  const r = result(m);
  const center = m.score ? `<div class="match__score">${m.score[0]} : ${m.score[1]}</div>` : `<div class="match__vs">${esc(m.time || "vs")}</div>`;
  const tag = r ? `<span class="badge ${r}">${RES_TXT[r]}</span>` : m.time ? `<span class="countdown" data-at="${m.date}T${m.time}"></span>` : "";
  const t = TBY[m.t];
  return `<div class="card match">
    <div class="match__meta"><span>${fmtDate(m.date)}${m.time ? " · " + esc(m.time) : ""}</span><span class="tag tag-${m.t}">${esc(t.short)}${m.round ? " · " + esc(m.round) : ""}</span></div>
    <div class="match__row">
      <div class="match__team ${isUs(m, m.home) ? "us" : ""}">${esc(m.home)}</div>${center}
      <div class="match__team ${isUs(m, m.away) ? "us" : ""}">${esc(m.away)}</div>
    </div>
    <div class="match__foot"><span class="muted">${m.venue ? "📍 " + esc(m.venue) : ""}</span>${tag}</div>
    ${scorersLine(m)}
    ${m.link ? `<div class="match__foot"><a href="${m.link}" target="_blank" class="muted">Подробнее →</a></div>` : ""}
  </div>`;
}

// «⚽ Мустафин ×7, Андриевич ×3 …»
function scorersLine(m) {
  const ours = (m.goals || []).filter((g) => !g.opp && g.scorer);
  if (!ours.length) return "";
  const cnt = new Map();
  for (const g of ours) { const n = /автогол/i.test(g.scorer) ? "автогол" : g.scorer.split(" ").slice(-1)[0]; cnt.set(n, (cnt.get(n) || 0) + 1); }
  return `<div class="match__goals">⚽ ${[...cnt].map(([n, c]) => esc(n) + (c > 1 ? ` ×${c}` : "")).join(", ")}</div>`;
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

function tabs(id, items, active, onPick) {
  const el = document.getElementById(id);
  el.innerHTML = items.map(([k, v]) => `<button class="chip ${k === active ? "active" : ""}" data-k="${k}">${esc(v)}</button>`).join("");
  el.querySelectorAll(".chip").forEach((b) => (b.onclick = () => {
    el.querySelectorAll(".chip").forEach((x) => x.classList.toggle("active", x === b));
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
    .map((m) => `<span class="badge ${result(m)}" title="${esc(m.home)} ${m.score.join(":")} ${esc(m.away)}">${result(m)}</span>`).join(" ");
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
  tickCountdowns(); setInterval(tickCountdowns, 30000);
}

const POS_NAMES = { ВРТ: "Вратари", ЗАЩ: "Защитники", ПЗ: "Полузащитники", НАП: "Нападающие" };
const POS_ONE = { ВРТ: "Вратарь", ЗАЩ: "Защитник", ПЗ: "Полузащитник", НАП: "Нападающий" };
function personCard(p, sub, num) {
  return `<div class="card person">
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
  $("#app").innerHTML = `<h1>Статистика</h1><p class="sub">Голы и передачи игроков в сезоне ${esc(T[0].season)}</p>
    <div class="filters" id="stabs"></div><div id="sbody"></div>`;
  // голы и передачи из телеграма → строки {t, name, goals, assists}
  const auto = [];
  for (const t of T) for (const m of t.matches) for (const g of m.goals || []) {
    if (g.opp) continue;
    if (g.scorer && !/автогол/i.test(g.scorer)) auto.push({ t: t.id, name: g.scorer, goals: 1 });
    if (g.assist) auto.push({ t: t.id, name: g.assist, assists: 1 });
  }
  const all = [...auto, ...PLAYER_STATS];
  if (!all.length) {
    $("#sbody").innerHTML = `<div class="card empty"><div class="empty__icon">📊</div><h2>Статистика скоро появится</h2><p class="muted">Голы и передачи подтягиваются из телеграм-канала команды.</p><a class="btn" href="${CLUB.telegram}" target="_blank">Телеграм-канал</a></div>`;
    return;
  }
  const hasGames = PLAYER_STATS.some((s) => s.games), hasYc = PLAYER_STATS.some((s) => s.yc);
  const hasNum = PLAYERS.some((p) => p.num != null);
  const cols = [hasNum && ["num", "№"], ["name", "Игрок", "l"], hasGames && ["games", "И"], ["goals", "Голы"], ["assists", "Пасы"], ["ga", "Г+П"], hasYc && ["yc", "ЖК"]].filter(Boolean);
  let key = "ga", dir = -1, rows = [];
  const draw = () => {
    const sorted = [...rows].sort((a, b) => (typeof a[key] === "string" ? a[key].localeCompare(b[key]) : (a[key] || 0) - (b[key] || 0)) * dir || b.goals - a.goals || a.name.localeCompare(b.name));
    $("#stable").innerHTML = `<div class="table-wrap"><table>
      <thead><tr>${cols.map(([k, t, c]) => `<th class="sortable ${c || ""}" data-k="${k}">${t}${k === key ? (dir < 0 ? " ▼" : " ▲") : ""}</th>`).join("")}</tr></thead>
      <tbody>${sorted.map((r) => `<tr>${cols.map(([k, , c]) => `<td class="${c || ""}">${esc(r[k] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
    document.querySelectorAll("th.sortable").forEach((th) => (th.onclick = () => { dir = th.dataset.k === key ? -dir : -1; key = th.dataset.k; draw(); }));
  };
  const leader = (k, label) => { const t = [...rows].sort((a, b) => (b[k] || 0) - (a[k] || 0))[0]; return `<div class="card leader"><div class="leader__val">${t ? t[k] || 0 : "–"}</div><div><div class="leader__label">${label}</div><div><b>${t ? esc(t.name) : "—"}</b></div></div></div>`; };
  tabs("stabs", [["all", "Все турниры"], ...T.map((t) => [t.id, t.short])], "all", (f) => {
    const agg = {};
    for (const s of all.filter((s) => f === "all" || s.t === f)) {
      const r = (agg[s.name] ||= { name: s.name, num: PLAYERS.find((p) => p.name === s.name)?.num ?? "", games: 0, goals: 0, assists: 0, yc: 0 });
      for (const k of ["games", "goals", "assists", "yc"]) r[k] += s[k] || 0;
    }
    rows = Object.values(agg).map((r) => ({ ...r, ga: r.goals + r.assists }));
    const played = T.filter((t) => f === "all" || t.id === f).flatMap((t) => t.matches).filter((m) => m.goals);
    const gf = played.reduce((s, m) => s + m.goals.filter((g) => !g.opp).length, 0);
    const summary = `<p class="muted">Матчей с трансляцией: ${played.length} · забито ${gf} · пропущено ${played.reduce((s, m) => s + m.goals.filter((g) => g.opp).length, 0)}
      · источник: <a href="https://t.me/${TELEGRAM.channel}" target="_blank">t.me/${TELEGRAM.channel}</a></p>`;
    $("#sbody").innerHTML = summary + `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">
      ${leader("goals", "Лучший бомбардир")}${leader("assists", "Лучший ассистент")}${leader("ga", "Гол + пас")}</div><h2>Все игроки</h2><div id="stable"></div>`;
    draw();
  });
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

// клик по посту с фото → просмотрщик (на любой странице)
document.addEventListener("click", (e) => { const a = e.target.closest("[data-gallery]"); if (a) { e.preventDefault(); openGallery(ALL_CONTENT[+a.dataset.gallery].photos); } });
layout();
({ home: pageHome, team: pageTeam, stats: pageStats, media: pageMedia, shop: pageShop })[document.body.dataset.page]();
