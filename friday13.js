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

  const show = () => { peek.classList.add("on"); setTimeout(() => peek.classList.remove("on"), 4500); };
  peek.addEventListener("click", () => peek.classList.remove("on"));
  setTimeout(show, 1200);
  setInterval(show, 25000);
})();
