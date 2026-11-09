// Тема «Пятница, 13-е». Подключается из app.js, когда в Красноярске пятница 13-е
// (или для проверки — откройте любую страницу с ?f13 в адресе).
(function () {
  const css = `
  :root {
    --bg: #0b0606; --card: #160d0d; --text: #efe6e6; --muted: #a39191;
    --border: #3a1d1d; --green-dark: #120808; --green-light: #2a1414;
    --accent: #d81e1e; --green: #b71c1c;
  }
  body.f13 {
    background:
      radial-gradient(ellipse at 50% -10%, rgba(140,0,0,.35), transparent 60%),
      radial-gradient(ellipse at 50% 120%, rgba(60,70,60,.35), transparent 60%),
      var(--bg);
    background-attachment: fixed;
  }
  body.f13 .header { background: #0a0404; box-shadow: 0 2px 0 #5a0d0d, 0 6px 24px rgba(200,0,0,.25); }
  body.f13 .nav a.active { color: #fff; }
  body.f13 .hero { position: relative; overflow: hidden; background: linear-gradient(135deg, #1a0606, #050202) !important; }
  body.f13 .hero h1 { animation: f13-flicker 6s infinite; text-shadow: 0 0 14px rgba(255,0,0,.55); }
  body.f13 .card { box-shadow: inset 0 0 0 1px rgba(255,0,0,.04); }
  @keyframes f13-flicker { 0%,92%,100% { opacity: 1 } 93% { opacity: .3 } 94% { opacity: 1 } 96% { opacity: .5 } 97% { opacity: 1 } }

  .f13-banner { background: repeating-linear-gradient(-45deg, #2a0000 0 14px, #160000 14px 28px); color: #ffd9d9;
    text-align: center; font-weight: 800; letter-spacing: .5px; padding: 8px 16px; font-size: 14px; border-bottom: 1px solid #5a0d0d; }
  .f13-banner b { color: #ff3b3b; }

  .f13-claws { position: absolute; inset: 0; pointer-events: none; opacity: .85; }
  .f13-claws path { stroke: #b80000; stroke-width: 5; stroke-linecap: round; fill: none;
    stroke-dasharray: 400; stroke-dashoffset: 400; animation: f13-slash .5s ease-out forwards; filter: drop-shadow(0 0 4px #f00); }
  .f13-claws path:nth-child(2) { animation-delay: .06s } .f13-claws path:nth-child(3) { animation-delay: .12s } .f13-claws path:nth-child(4) { animation-delay: .18s }
  @keyframes f13-slash { to { stroke-dashoffset: 0 } }
  .f13-scratch { position: relative; max-width: 1100px; margin: 0 auto; height: 0; z-index: 1; pointer-events: none; }
  .f13-scratch .f13-claws { inset: auto; top: 14px; right: 16px; width: min(340px, 55vw); height: 150px; }

  .f13-peek { position: fixed; right: 0; bottom: 0; width: 300px; z-index: 50; cursor: pointer;
    transform: translateX(105%); transition: transform .9s cubic-bezier(.2,.8,.2,1); }
  .f13-peek.on { transform: translateX(22%); }
  .f13-peek img { width: 100%; filter: drop-shadow(0 0 18px rgba(255,0,0,.45)); }
  .f13-say { position: absolute; top: -10px; right: 45%; background: #000; color: #ff4a4a; border: 1px solid #5a0d0d;
    padding: 4px 10px; border-radius: 10px; font-weight: 800; font-size: 13px; white-space: nowrap; opacity: 0; transition: opacity .3s; }
  .f13-peek.on .f13-say { opacity: 1; transition-delay: .9s; }
  @media (max-width: 760px) { .f13-peek { width: 190px; } .f13-say { font-size: 11px; } }
  @media (prefers-reduced-motion: reduce) {
    body.f13 .hero h1 { animation: none; } .f13-claws path { animation: none; stroke-dashoffset: 0; }
    .f13-peek { transition: none; }
  }`;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
  document.body.classList.add("f13");

  // баннер под шапкой
  const header = document.querySelector(".header");
  const banner = document.createElement("div");
  banner.className = "f13-banner";
  banner.innerHTML = "🔪 Пятница, <b>13-е</b>. «Садовод» не боится — а вот соперникам стоит 🌙";
  if (header) header.after(banner); else document.body.prepend(banner);

  // следы когтей на главном блоке
  const hero = document.querySelector(".hero");
  const claws = `<svg class="f13-claws" viewBox="0 0 400 200" preserveAspectRatio="none" aria-hidden="true">
    <path d="M250 20 Q300 90 330 190"/><path d="M275 12 Q325 85 355 185"/><path d="M300 8 Q348 80 378 175"/><path d="M325 10 Q368 75 398 160"/></svg>`;
  if (hero) hero.insertAdjacentHTML("beforeend", claws);
  else {
    // на остальных страницах — следы когтей справа от заголовка (вне #app, чтобы не пропадали при перерисовке)
    const app = document.getElementById("app");
    if (app) app.insertAdjacentHTML("beforebegin", `<div class="f13-scratch">${claws}</div>`);
  }

  // маньяк-садовод выглядывает из-за края экрана
  const peek = document.createElement("div");
  peek.className = "f13-peek";
  peek.setAttribute("aria-hidden", "true");
  peek.innerHTML = `<div class="f13-say">Раз, два — Фредди заберёт тебя…</div><img src="img/event/krueger.png" alt="">`;
  document.body.appendChild(peek);

  // ---------- переход между страницами: стая летучих мышей ----------
  const BAT = `<svg viewBox="0 0 100 50"><path d="M50 22 L46 12 L44 18 C38 10 30 8 22 4 C25 12 18 17 4 14 C11 22 9 29 1 33 C17 29 29 33 37 44 C40 36 45 32 50 38 C55 32 60 36 63 44 C71 33 83 29 99 33 C91 29 89 22 96 14 C82 17 75 12 78 4 C70 8 62 10 56 18 L54 12 Z"/></svg>`;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const batStyle = document.createElement("style");
  batStyle.textContent = `
  .f13-veil { position: fixed; inset: 0; z-index: 200; pointer-events: none; overflow: hidden;
    background: radial-gradient(circle at 50% 45%, #ffe3c9 0 min(16vw, 120px), #e0503a calc(min(16vw, 120px) + 3px), #5a0707 calc(min(16vw, 120px) + 40px), #1a0202 45%, #000 80%); opacity: 0; transition: opacity .45s ease; }
  .f13-veil.dark { opacity: 1; pointer-events: all; }
  .f13-bat { position: absolute; left: 0; top: 0; width: var(--s); color: #000;
    animation: f13-fly var(--d) cubic-bezier(.4,.1,.6,1) var(--w) both; filter: drop-shadow(0 0 5px rgba(255,60,40,.9)); }
  .f13-bat svg { display: block; fill: #050000; animation: f13-flap .16s ease-in-out infinite alternate; transform-origin: 50% 45%; }
  @keyframes f13-flap { from { transform: scaleY(1) } to { transform: scaleY(.55) } }
  @keyframes f13-fly { from { transform: translate(var(--x0), var(--y0)) rotate(var(--r)) } to { transform: translate(var(--x1), var(--y1)) rotate(var(--r)) } }`;
  document.head.appendChild(batStyle);

  // out = true: мыши летят из-за края через экран; false: разлетаются из центра наружу
  function swarm(veil, out) {
    const W = innerWidth, H = innerHeight, n = W < 600 ? 22 : 38;
    for (let i = 0; i < n; i++) {
      const b = document.createElement("div");
      b.className = "f13-bat";
      b.innerHTML = BAT;
      const s = 45 + Math.random() * 75;
      let x0, y0, x1, y1;
      if (out) { x0 = -120 - Math.random() * 200; y0 = H * (0.2 + Math.random() * 0.9); x1 = W + 150; y1 = y0 - H * (0.4 + Math.random() * 0.6); }
      else { const a = Math.random() * Math.PI * 2, R = Math.max(W, H); x0 = W / 2 + (Math.random() - .5) * W * .5; y0 = H / 2 + (Math.random() - .5) * H * .5; x1 = x0 + Math.cos(a) * R; y1 = y0 + Math.sin(a) * R; }
      const r = Math.atan2(y1 - y0, x1 - x0) * 57 / 4;
      Object.entries({ "--s": s + "px", "--x0": x0 + "px", "--y0": y0 + "px", "--x1": x1 + "px", "--y1": y1 + "px", "--r": r + "deg",
        "--d": (0.7 + Math.random() * 0.6) + "s", "--w": (Math.random() * (out ? 0.35 : 0.2)) + "s" }).forEach(([k, v]) => b.style.setProperty(k, v));
      veil.appendChild(b);
    }
  }
  function makeVeil() { const v = document.createElement("div"); v.className = "f13-veil"; v.setAttribute("aria-hidden", "true"); document.body.appendChild(v); return v; }

  // прилёт на новую страницу
  let arrived = false;
  try { arrived = sessionStorage.getItem("f13bats") === "1"; sessionStorage.removeItem("f13bats"); } catch {}
  if (arrived && !reduce) {
    const v = makeVeil();
    v.style.transition = "none";
    v.classList.add("dark");
    void v.offsetWidth;
    v.style.transition = "opacity .6s ease";
    swarm(v, false);
    requestAnimationFrame(() => { document.documentElement.classList.remove("f13-pre"); setTimeout(() => v.classList.remove("dark"), 250); });
    setTimeout(() => v.remove(), 1800);
  }
  document.documentElement.classList.remove("f13-pre");

  // уход со страницы
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[href]");
    if (!a || reduce || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target && a.target !== "_self") return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || !/\.html$|\/$/.test(url.pathname) || (url.pathname === location.pathname && url.hash)) return;
    e.preventDefault();
    const v = makeVeil();
    swarm(v, true);
    requestAnimationFrame(() => v.classList.add("dark"));
    try { sessionStorage.setItem("f13bats", "1"); } catch {}
    setTimeout(() => { location.href = url.href; }, 700);
  });
  // возврат кнопкой «назад» из кэша — убрать завесу
  addEventListener("pageshow", (e) => { if (e.persisted) document.querySelectorAll(".f13-veil").forEach((v) => v.remove()); });

  const show = () => { peek.classList.add("on"); setTimeout(() => peek.classList.remove("on"), 4500); };
  peek.addEventListener("click", () => peek.classList.remove("on"));
  setTimeout(show, 1200);
  setInterval(show, 25000);
})();
