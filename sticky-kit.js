/* Sticky note on the home hero: total unique students who have logged in (accounts), swaying like paper in a breeze.
   Count comes from GET /api/schedule?stats=1 → { students }. Shown only when the live API answers with a number. */
(function () {
  "use strict";
  const API = "/api/schedule";
  const css = `
  .stk-note{position:absolute;z-index:6;width:178px;pointer-events:auto;user-select:none}
  .stk-note.out{left:calc(100% + 26px);top:0}
  .stk-note.corner{width:156px}.stk-note.corner .stk-paper{padding:34px 10px 12px}.stk-note.corner .stk-n{font-size:40px;margin:2px 0 0}.stk-note.corner .stk-s{font-size:16px}.stk-note.corner .stk-s br,.stk-note.corner .stk-s .x{display:none}
  .stk-note.inline{position:relative;margin:4px auto 18px;left:auto;top:auto}
  .stk-swing{transform-origin:50% 14px;animation:stkSway 5.2s ease-in-out infinite;will-change:transform}
  .stk-paper{position:relative;margin-top:14px;padding:40px 14px 22px;text-align:center;color:#3b2f05;
    background:linear-gradient(160deg,#fff7a8 0%,#ffef6e 45%,#fde047 100%);border-radius:2px 2px 4px 26px / 2px 2px 4px 20px;
    box-shadow:0 1px 0 rgba(0,0,0,.04),0 14px 22px -10px rgba(120,90,0,.45),0 26px 40px -24px rgba(0,0,0,.35);
    animation:stkFlutter 2.6s ease-in-out infinite;transform-origin:50% 0}
  .stk-paper:after{content:"";position:absolute;right:0;bottom:0;width:30px;height:24px;border-radius:0 0 4px 22px;
    background:linear-gradient(135deg,rgba(255,255,255,0) 50%,#f5d020 51%,#e9c10f 100%);box-shadow:-3px -3px 6px -3px rgba(120,90,0,.35)}
  .stk-pin{position:absolute;left:50%;top:0;transform:translateX(-50%);width:30px;height:38px;z-index:2;filter:drop-shadow(1px 3px 2px rgba(0,0,0,.35))}
  .stk-k{font:700 12px/1 system-ui,-apple-system,"Segoe UI",sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#7a5b00}
  .stk-n{font-family:"Caveat","Segoe Print","Bradley Hand","Comic Sans MS",cursive;font-weight:700;font-size:58px;line-height:1;margin:6px 0 2px;color:#1f2937;font-variant-numeric:tabular-nums}
  .stk-s{font-family:"Caveat","Segoe Print","Bradley Hand","Comic Sans MS",cursive;font-size:19px;line-height:1.15;color:#5b4500}
  .stk-new{position:absolute;right:-10px;top:-8px;background:#16a34a;color:#fff;font:700 11px system-ui,sans-serif;padding:3px 8px;border-radius:999px;transform:rotate(8deg);opacity:0;transition:opacity .3s}
  .stk-new.on{opacity:1;animation:stkPop .6s ease-out}
  .stk-note.bump .stk-n{animation:stkPop .6s ease-out}
  @keyframes stkSway{0%{transform:rotate(-4.5deg)}25%{transform:rotate(2deg)}50%{transform:rotate(4deg)}75%{transform:rotate(-1.5deg)}100%{transform:rotate(-4.5deg)}}
  @keyframes stkFlutter{0%,100%{transform:skewX(0) scaleY(1)}30%{transform:skewX(-1.6deg) scaleY(.99)}65%{transform:skewX(1.2deg) scaleY(1.005)}}
  @keyframes stkPop{0%{transform:scale(1)}40%{transform:scale(1.18)}100%{transform:scale(1)}}
  .stk-note:hover .stk-swing{animation-duration:2.2s}
  @media (prefers-reduced-motion:reduce){.stk-swing,.stk-paper{animation:none}.stk-swing{transform:rotate(-3deg)}}
  body.dark-mode .stk-paper{filter:saturate(.95) brightness(.97)}`;
  const pin = `<svg class="stk-pin" viewBox="0 0 30 38" aria-hidden="true"><defs><radialGradient id="stkPinG" cx="38%" cy="32%" r="70%"><stop offset="0" stop-color="#ff8a8a"/><stop offset=".45" stop-color="#e11d2e"/><stop offset="1" stop-color="#8f0c18"/></radialGradient></defs>
    <path d="M15 22 L15 37" stroke="#9aa3ad" stroke-width="2.2" stroke-linecap="round"/><ellipse cx="15" cy="21" rx="9" ry="3.4" fill="#b3101f"/><path d="M9 20 C9 13 11 9 15 9 C19 9 21 13 21 20 Z" fill="url(#stkPinG)"/>
    <ellipse cx="15" cy="8" rx="10" ry="7" fill="url(#stkPinG)"/><ellipse cx="11.5" cy="5.6" rx="3" ry="1.8" fill="#fff" opacity=".55"/></svg>`;
  let el = null, shown = 0, last = null, timer = 0;
  const fmt = (n) => Number(n || 0).toLocaleString("en-IN");
  function place() {
    if (!el) return; const hero = document.querySelector(".ds-hero"); if (!hero) return;
    const r = hero.getBoundingClientRect(), room = window.innerWidth - r.right, f2 = document.getElementById("hero-streak-card");
    el.classList.remove("out", "corner", "inline"); el.style.left = el.style.top = "";
    if (room >= 215 && window.innerWidth > 1100) { if (el.parentNode !== hero) hero.appendChild(el); el.classList.add("out"); }
    else if (window.innerWidth > 1100 && f2) { if (el.parentNode !== hero) hero.appendChild(el); el.classList.add("corner"); el.style.left = Math.max(0, Math.min(hero.clientWidth - 150, f2.offsetLeft + f2.offsetWidth - 120)) + "px"; el.style.top = Math.round(f2.offsetTop - el.offsetHeight + 6) + "px"; return; }
    else { const c = document.querySelector(".ds-center .ds-stats") || document.querySelector(".ds-center"); if (c && el.nextSibling !== c) c.parentNode.insertBefore(el, c); el.classList.add("inline"); }
  }
  function countTo(n) {
    const nEl = el.querySelector(".stk-n"), from = shown, t0 = performance.now(), dur = Math.min(1600, 400 + Math.abs(n - from) * 12);
    const step = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); shown = Math.round(from + (n - from) * e); nEl.textContent = fmt(shown); if (k < 1) requestAnimationFrame(step); };
    if (window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches) { shown = n; nEl.textContent = fmt(n); return; }
    requestAnimationFrame(step);
  }
  function update(n) {
    if (typeof n !== "number" || n < 0) return;
    if (!el) {
      if (!document.getElementById("stk-css")) { const s = document.createElement("style"); s.id = "stk-css"; s.textContent = css; document.head.appendChild(s);
        const f = document.createElement("link"); f.rel = "stylesheet"; f.href = "https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&display=swap"; document.head.appendChild(f); }
      el = document.createElement("div"); el.className = "stk-note"; el.setAttribute("role", "status"); el.setAttribute("aria-live", "polite");
      el.innerHTML = `<div class="stk-swing">${pin}<div class="stk-paper"><div class="stk-k">Total Students</div><div class="stk-n">0</div><div class="stk-s">joined this capstone<br><span class="x">&amp; still counting ✍️</span></div><span class="stk-new"></span></div></div>`;
      place(); window.addEventListener("resize", () => { clearTimeout(timer); timer = setTimeout(place, 150); });
    }
    if (last != null && n > last) { const b = el.querySelector(".stk-new"); b.textContent = "+" + (n - last) + " new"; b.classList.add("on"); el.classList.add("bump"); setTimeout(() => { b.classList.remove("on"); el.classList.remove("bump"); }, 6000); }
    el.setAttribute("aria-label", fmt(n) + " students have joined this capstone"); last = n; countTo(n);
  }
  function load() { fetch(API + "?stats=1", { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(s => { if (s && typeof s.students === "number") update(s.students); }).catch(() => {}); }
  function start() { if (!document.querySelector(".ds-hero")) return; load(); setInterval(() => { if (document.visibilityState === "visible") load(); }, 120000); window.addEventListener("vk-account", () => setTimeout(load, 1500)); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  window.STICKY_STUDENTS = { update, place };
})();
