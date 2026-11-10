// =====================================================================
//  Онлайн матча. Запускается из .github/workflows/live.yml раз в минуту во время игры.
//  Читает свежие посты телеграм-канала и пишет live.json (матчи за вчера/сегодня/завтра:
//  счёт, голы с авторами, ссылка на трансляцию). Сайт подтягивает его каждую минуту.
//
//  node live.js           — обновить live.json
//  node live.js --window  — есть ли сейчас матч: печатает «until=<unix-время конца окна>» или ничего
// =====================================================================
const fs = require("fs");
const path = require("path");
const { ctx, tgPosts, tgMatches, loadPrev } = require("./update.js");

const TZ = (ctx.TELEGRAM?.tz ?? 7) * 36e5;
const BEFORE = 40 * 6e4;   // окно открывается за 40 минут до начала
const AFTER = 3 * 36e5;    // и длится до 3 часов после начала (если матч не закончился раньше)
const AFTER_END = 10 * 6e4; // после «Матч окончен» ещё 10 минут (поправки в постах)

const kday = (ms) => new Date(ms + TZ).toISOString().slice(0, 10); // дата по Красноярску
const startOf = (m) => m.date && m.time ? Date.parse(`${m.date}T${m.time}:00Z`) - TZ : null;

async function liveMatches() {
  const posts = await tgPosts(ctx.TELEGRAM);
  const now = Date.now();
  const days = [kday(now - 864e5), kday(now), kday(now + 864e5)];
  const ms = tgMatches(posts, ctx.TELEGRAM).filter((m) => days.includes(m.date));
  // время окончания = пост «Матч окончен» (последний пост матча со счётом)
  for (const m of ms) if (m.finished) m.endedAt = m.goals.at(-1)?.at || null;
  return ms;
}

// все известные матчи с датой и временем: из data-auto.js + анонсы в телеграме
function scheduled(tg) {
  const prev = loadPrev();
  const list = [];
  for (const [t, d] of Object.entries(prev.tournaments || {})) for (const m of d.matches || []) if (!m.score) list.push({ t, date: m.date, time: m.time });
  for (const m of tg) list.push({ t: m.t, date: m.date, time: m.time, finished: m.finished, endedAt: m.endedAt });
  return list;
}

async function main() {
  const tg = await liveMatches();
  if (process.argv.includes("--window")) {
    const now = Date.now();
    let until = 0;
    for (const m of scheduled(tg)) {
      const s = startOf(m);
      if (!s || now < s - BEFORE || now > s + AFTER) continue;
      // матч из телеграма уже закончился — окно закрывается через 10 минут после финального поста
      const fin = tg.find((x) => x.t === m.t && x.date === m.date && x.finished);
      const end = fin ? (Date.parse(fin.endedAt) || now) + AFTER_END : s + AFTER;
      if (end > now) until = Math.max(until, Math.floor(end / 1000));
    }
    if (until) console.log(`until=${until}`);
    return;
  }
  const out = { at: new Date().toISOString(), matches: tg };
  fs.writeFileSync(path.join(__dirname, "live.json"), JSON.stringify(out));
  const n = tg.map((m) => `${m.t} ${m.opponent} ${m.score ? m.score.join(":") : "—"}${m.finished ? " (конец)" : ""}`).join("; ");
  console.log(`live.json: ${n || "матчей рядом нет"}`);
}
main().catch((e) => { console.error("live.js:", e.message); process.exit(1); });
