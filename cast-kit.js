/* Cast kit — the kick-off characters show up around the site: KPI page, SQL lab, SQL practice, schedule,
   AI review feedback, the "database is down" message and Playbook cheers. Uses story-kit (KICKOFF_KIT) + story data. */
(function () {
  "use strict";
  const me = document.currentScript;
  const SITE = (me && me.dataset.site) || "";
  const BASE = (() => { try { return new URL("ko-cast/", me.src).href; } catch (e) { return "ko-cast/"; } })();
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const KIT = () => window.KICKOFF_KIT;
  const DATA = () => (window.KICKOFF_DATA || {})[SITE];
  const LEARN = () => (window.KICKOFF_LEARN || {})[SITE] || {};
  const img = (name, cls) => `<img class="${cls || ""}" src="${BASE}${name}.webp" alt="" loading="lazy" decoding="async">`;

  const STYLE = `
.cs{--acc:var(--teal,#0E86C9);--acc-t:var(--teal-tint,#E6F3FA);--acc-d:var(--teal-deep,#0A5A87);margin:4px 0 22px;background:var(--paper-raised,#fff);border:1px solid var(--line,#DDE2E0);border-radius:16px;padding:12px;box-shadow:0 8px 22px -18px rgba(15,23,42,.45);color:#1d2532}
.cs-h{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 2px 10px}
.cs-h .tg{font:700 10.5px/1 var(--body,inherit);letter-spacing:.07em;text-transform:uppercase;background:var(--acc-t);color:var(--acc-d);padding:5px 9px;border-radius:99px}
.cs-h b{font:700 14.5px/1.3 var(--display,inherit);color:var(--ink,#1d2532);flex:1;min-width:180px}
.cs-h button{border:1px solid var(--line,#d0d6de);background:var(--paper-raised,#fff);color:var(--ink,#1d2532);border-radius:99px;padding:7px 12px;font:600 12.5px/1 var(--body,inherit);cursor:pointer}
.cs-h button:hover{border-color:var(--acc)}
.cs-chips{display:flex;gap:6px;flex-wrap:wrap;margin:0 2px 10px}
.cs-chips button{border:1px solid var(--line,#d6dbe2);background:var(--paper,#f6f7f5);color:var(--ink,#1d2532);border-radius:99px;padding:6px 11px;font:600 12px/1.2 var(--body,inherit);cursor:pointer;max-width:100%;text-align:left}
.cs-chips button.on{background:var(--acc);border-color:var(--acc);color:#fff}
.cs-row{display:grid;grid-template-columns:repeat(var(--n,3),minmax(0,1fr));gap:10px}
.cs-p{position:relative;border:1px solid #e3e7ec;border-radius:14px;overflow:hidden;min-height:250px;display:flex;flex-direction:column;justify-content:space-between;background:#fff;transition:box-shadow .25s,border-color .25s}
.cs-p.now{border-color:var(--acc);box-shadow:0 0 0 3px var(--acc-t)}
.cs-p>svg.bg{position:absolute;inset:0;width:100%;height:100%;z-index:0}
.cs-b{position:relative;z-index:2;margin:10px 10px 0;background:#fff;border:1px solid #dde2e8;border-radius:13px;padding:8px 11px;font:500 13.2px/1.48 var(--body,inherit);color:#1d2532;box-shadow:0 3px 10px -5px rgba(16,24,38,.2)}
.cs-b:after{content:"";position:absolute;bottom:-6px;left:50%;width:10px;height:10px;background:#fff;border-right:1px solid #dde2e8;border-bottom:1px solid #dde2e8;transform:translateX(-50%) rotate(45deg)}
.cs-b .who{display:block;font:700 9.5px/1 var(--body,inherit);letter-spacing:.08em;text-transform:uppercase;color:var(--acc-d);margin-bottom:4px}
.cs-b code{font:600 11.5px/1.45 var(--mono,monospace);background:#f5f7f9;border:1px solid #e6e9ee;border-radius:5px;padding:1px 5px;white-space:normal}
.cs-c{position:relative;z-index:1;height:128px;display:flex;justify-content:center;align-items:flex-end}
.cs-c .ch{width:112px;height:128px;position:relative}
.cs-c .ch svg{width:112px;height:128px;display:block;overflow:visible}
.cs-c .nm{position:absolute;left:50%;bottom:5px;transform:translateX(-50%);background:#1d2532;color:#fff;font:600 10px/1 var(--body,inherit);padding:4px 8px;border-radius:99px;white-space:nowrap;z-index:3}
.cs-p.now .nm{background:var(--acc)}
.cs .ch .bd{transform-origin:50% 100%;transform-box:fill-box}
.cs .ch.talk .hd{transform-origin:50% 95%;transform-box:fill-box;animation:csBob 1.3s ease-in-out infinite alternate}
@keyframes csBob{from{transform:rotate(-1deg)}to{transform:rotate(1deg)}}
.cs-foot{margin:10px 2px 0;font-size:12.5px;color:var(--ink-muted,#5b6472)}
.cs-foot a,.cs-foot button.lnk{color:var(--acc-d);font-weight:700;background:none;border:0;padding:0;cursor:pointer;font-size:12.5px}
.cs.min .cs-row{display:none}.cs.min .cs-chips{display:none}.cs.min .cs-foot{display:none}
.cs-eps{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.cs-eps button{border:1px solid var(--line,#d6dbe2);background:var(--paper-raised,#fff);border-radius:10px;padding:7px 10px;font:600 12px/1.2 var(--body,inherit);cursor:pointer;color:var(--ink,#1d2532)}
.cs-eps button:hover{border-color:var(--acc)}
.vk-cast{display:flex;gap:10px;align-items:center;margin:0 0 8px;text-align:left}
.vk-cast img{width:64px;height:64px;object-fit:cover;object-position:50% 12%;border-radius:50%;background:#eef2f7;flex:none}
.vk-cast span{font-size:13px;line-height:1.45}
.kl-cheer{float:right;width:58px;height:58px;object-fit:cover;object-position:50% 10%;border-radius:50%;margin:-4px -2px 0 8px;background:#e3f6ea}
.rv-cast{margin:6px 0 16px}
body.dark-mode .cs{background:#f7f8fa;border-color:#2b3442}
body.dark-mode .cs-h b{color:#1d2532}
@media (max-width:860px){.cs-row{grid-template-columns:none;grid-auto-flow:column;grid-auto-columns:minmax(230px,82%);overflow-x:auto;scroll-snap-type:x mandatory;padding-bottom:4px}.cs-p{scroll-snap-align:start}}
@media (prefers-reduced-motion:reduce){.cs .ch.talk .hd{animation:none}}
`;
  function addCss() { if (document.getElementById("cs-css")) return; const s = document.createElement("style"); s.id = "cs-css"; s.textContent = STYLE; document.head.appendChild(s); }

  // one comic panel: [personKey, html line, mood, pose, background]
  function panel(P, D, b, i) {
    const p = P[b[0]] || {}; const K = KIT();
    return `<div class="cs-p" data-i="${i}" data-who="${esc(b[0])}"><svg class="bg" viewBox="0 0 400 260" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${K.scene(b[4] || "meeting", D)}</svg>
      <div class="cs-b"><span class="who">${esc(p.short || b[0])}</span>${b[1]}</div>
      <div class="cs-c"><div class="ch">${K.figure(p.look, b[2] || "smile", b[3] || "idle")}<span class="nm">${esc(p.short || "")}</span></div></div></div>`;
  }
  // a strip: {id, tag, title, chips:[label], pick(i) → beats[], foot}
  function strip(cfg) {
    const D = DATA(), K = KIT(); if (!D || !K) return null;
    const P = K.people(D);
    const el = document.createElement("div"); el.className = "cs"; el.dataset.cs = cfg.id;
    let cur = 0;
    const draw = () => {
      const beats = cfg.pick(cur, P, D);
      el.innerHTML = `<div class="cs-h"><span class="tg">🎬 ${esc(cfg.tag)}</span><b>${cfg.title}</b><button type="button" data-a="listen">🔊 Listen</button><button type="button" data-a="min">Hide</button></div>
        ${cfg.chips ? `<div class="cs-chips">${cfg.chips.map((c, i) => `<button type="button" data-c="${i}" class="${i === cur ? "on" : ""}">${esc(c)}</button>`).join("")}</div>` : ""}
        <div class="cs-row" style="--n:${beats.length}">${beats.map((b, i) => panel(P, D, b, i)).join("")}</div>${cfg.foot ? `<div class="cs-foot">${cfg.foot(cur, P, D)}</div>` : ""}`;
      el._beats = beats; el._P = P;
    };
    let run = 0;
    const stop = () => { run++; try { K.hush(); } catch (e) {} el.querySelectorAll(".cs-p").forEach(x => x.classList.remove("now")); el.querySelectorAll(".ch.talk").forEach(x => x.classList.remove("talk")); const b = el.querySelector('[data-a="listen"]'); if (b) b.textContent = "🔊 Listen"; };
    async function listen() {
      const my = ++run; const b = el.querySelector('[data-a="listen"]'); if (b) b.textContent = "⏹ Stop";
      for (let i = 0; i < el._beats.length; i++) {
        if (my !== run) return;
        const pe = el.querySelector(`.cs-p[data-i="${i}"]`); el.querySelectorAll(".cs-p").forEach(x => x.classList.toggle("now", x === pe));
        const ch = pe && pe.querySelector(".ch"); if (ch) ch.classList.add("talk");
        const txt = (pe.querySelector(".cs-b").textContent || "").replace(/^\s*\S+/, (m) => m === el._P[el._beats[i][0]].short ? "" : m);
        const line = el._beats[i][1].replace(/<[^>]+>/g, " ");
        await K.speak(line || txt, el._beats[i][0], el._P, "", () => my === run);
        if (ch) ch.classList.remove("talk");
        await new Promise(r => setTimeout(r, 250));
      }
      if (my === run) stop();
    }
    el.addEventListener("click", (e) => {
      const a = e.target.closest("[data-a],[data-c],[data-ep],[data-view]"); if (!a) return;
      if (a.dataset.a === "listen") { if (/Stop/.test(a.textContent)) stop(); else listen(); }
      else if (a.dataset.a === "min") { stop(); el.classList.toggle("min"); a.textContent = el.classList.contains("min") ? "Show" : "Hide"; try { localStorage.setItem("cs_min_" + cfg.id, el.classList.contains("min") ? "1" : ""); } catch (x) {} }
      else if (a.dataset.c != null) { stop(); cur = +a.dataset.c; const was = el.classList.contains("min"); draw(); if (was) el.classList.add("min"); }
      else if (a.dataset.ep) { stop(); K.openEpisode(+a.dataset.ep); }
      else if (a.dataset.view) { stop(); if (typeof window.switchView === "function") window.switchView(a.dataset.view); }
    });
    draw();
    try { if (localStorage.getItem("cs_min_" + cfg.id)) { el.classList.add("min"); el.querySelector('[data-a="min"]').textContent = "Show"; } } catch (x) {}
    el._stop = stop;
    return el;
  }

  /* ---------------- the strips ---------------- */
  const STRIPS = {
    kpis: {
      tag: "KPI in 30 seconds", title: "Pick a KPI: the sponsor asks, the team answers",
      chips: () => (DATA().kpis || []).map(k => k[0]),
      pick: (i, P, D) => {
        const k = D.kpis[i], m = (LEARN().kmeta || [])[i];
        return [["sp", `What does <b>${esc(k[0])}</b> tell me, and why should I care?`, "think", "chin", "cabin"],
          ["ba", `<b>${esc(k[0])}</b> = <code>${esc(k[1])}</code>. In plain words: ${esc(k[2])}.`, "smile", "point", "board"],
          ["qa", m ? `Grain: <b>${esc(m[0])}</b>. Filters: ${esc(m[1])}. Owner: ${esc(m[2])}. And it must match SQL before it ships. ✔` : `Same formula in Excel, Tableau and Power BI, and it must match SQL before it ships. ✔`, "happy", "note", "desk"]];
      },
      foot: () => `Every KPI below has the business question, the logic, the formula and the DAX. <button type="button" class="lnk" data-ep="1">See how these KPIs were agreed at the kick-off →</button>`
    },
    sql: {
      tag: "From question to query", title: "A business question, turned into SQL and checked",
      chips: () => (LEARN().bq || []).map(q => q[0]),
      pick: (i, P, D) => {
        const q = (LEARN().bq || [])[i] || ["What happened last month?", "The main KPI by month"], iss = (D.issues || [])[i % Math.max(1, (D.issues || []).length)];
        return [["us", esc(q[0]), "think", "chin", "meeting"],
          ["de", `In data terms: <b>${esc(q[1])}</b>.${iss ? ` Watch out: <i>${esc(iss[0])}</i>. ${esc(iss[1])}` : ""}`, "smile", "note", "board"],
          ["you", `So: start from the fact table, join only the dimensions I need, filter out blanks, then <code>GROUP BY</code>.`, "think", "chin", "desk"],
          ["qa", `Run it, then compare the total with the dashboard. Different? Check the joins for duplicates and the date filter first.`, "happy", "note", "desk"]];
      },
      foot: () => `Write the query yourself first, then compare with the SQL below.`
    },
    editor: {
      tag: "Practice story", title: "Which table answers it? Find it, query it, check it",
      chips: () => (LEARN().srcq || []).map(q => q[0]),
      pick: (i, P, D) => {
        const q = (LEARN().srcq || [])[i] || ["How many records came in last month?", 0], src = ((D.arch && D.arch.sources) || [])[q[1]] || ["the main source", ""];
        return [["us", esc(q[0]), "think", "chin", "meeting"],
          ["ow", `That comes from <b>${esc(src[0])}</b>${src[1] ? ` (${esc(src[1])})` : ""}. Find its table in the practice database.`, "smile", "idle", "cabin"],
          ["qa", `Write the query, run it, and check the row count makes sense before you trust the number.`, "happy", "note", "desk"]];
      },
      foot: () => `Tip: run <code>SELECT * … LIMIT 5</code> first, so you know the columns before you count anything.`
    },
    schedule: {
      tag: "This week", title: "How the weekly presentations work",
      pick: (i, P, D) => [["pm", `Every week your group presents. Your slot and status are below, and only the trainer can change them.`, "smile", "note", "desk"],
        ["lead", `Ten minutes: what you built, <b>three insights</b> and <b>one recommendation</b>. Start and finish on time.`, "smile", "present", "meeting"],
        ["you", `And the SQL QA goes in the Tableau week or the Power BI week. Got it.`, "think", "chin", "corridor"]],
      foot: () => `Watch what happens in each week before you present:<div class="cs-eps">${(KIT().episodes || []).map(e => `<button type="button" data-ep="${e.n}">${e.em} Ep ${e.n} · ${esc(e.wk)}</button>`).join("")}</div>`
    }
  };
  function placeAll() {
    const D = DATA(), K = KIT(); if (!D || !K) return;
    addCss();
    Object.keys(STRIPS).forEach(id => {
      const sec = document.getElementById("view-" + id); if (!sec || sec.querySelector(`.cs[data-cs="${id}"]`)) return;
      const cfg = Object.assign({ id }, STRIPS[id]); if (cfg.chips) { cfg.chips = cfg.chips(); if (!cfg.chips.length) return; }
      const el = strip(cfg); if (!el) return;
      const head = sec.querySelector(".wrap .section-head") || sec.querySelector(".section-head");
      if (head && head.parentNode) head.parentNode.insertBefore(el, head.nextSibling);
      else { const w = sec.querySelector(".wrap") || sec; w.insertBefore(el, w.firstChild); }
      // stop talking when the student leaves this page
      new MutationObserver(() => { if (!sec.classList.contains("active")) el._stop(); }).observe(sec, { attributes: true, attributeFilter: ["class"] });
    });
  }

  /* ---------------- AI review feedback, told by the team ---------------- */
  function reviewStrip(r) {
    const D = DATA(), K = KIT(); if (!D || !K || !r) return "";
    addCss();
    const P = K.people(D), first = (t) => String(t || "").split(/(?<=[.!?])\s/)[0];
    const band = r.overall >= 85 ? "Excellent work." : r.overall >= 70 ? "Good work." : r.overall >= 55 ? "A solid start, with work to do." : "This needs real changes before the demo.";
    const top = (r.issues || [])[0], miss = (r.missing || [])[0], good = (r.strengths || [])[0];
    const beats = [["lead", `<b>${r.overall}/100.</b> ${esc(band)} ${esc(first(r.summary))}`, r.overall >= 70 ? "happy" : "smile", "present", "desk"],
      ["qa", top ? `Fix this first: <b>${esc(top.title)}</b>.${top.fix ? " " + esc(first(top.fix)) : ""}` : `No big number problems found. Still, match every KPI with SQL before you present. ✔`, top ? "think" : "happy", "note", "desk"],
      ["sp", miss ? `As the client, I'm missing <b>${esc(miss)}</b>. That's the number I'd ask for first.` : good ? `What I like: ${esc(first(good))} Now tell me what to do with it.` : `Show me the insight and the action, not just the charts.`, miss ? "think" : "happy", miss ? "chin" : "present", "meeting"]];
    return `<div class="cs rv-cast" data-cs="review"><div class="cs-h"><span class="tg">🎬 Team feedback</span><b>What the team would say about this dashboard</b></div><div class="cs-row" style="--n:3">${beats.map((b, i) => panel(P, D, b, i)).join("")}</div></div>`;
  }

  /* ---------------- tiny touches ---------------- */
  const dbDown = () => { addCss(); const D = DATA(), K = KIT(); const n = D && K ? K.people(D).de.short : "Neha"; return `<div class="vk-cast">${img("neha")}<span><b>${esc(n)} (data engineer):</b> our database is taking a short break. Nothing is lost. You can still read the whole site and log in later.</span></div>`; };
  const cheer = () => { addCss(); return img("kabir-happy", "kl-cheer"); };

  window.KICKOFF_CAST = { img, strip, reviewStrip, dbDown, cheer, place: placeAll };
  const go = () => { try { placeAll(); } catch (e) { console.warn("cast-kit", e); } };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go); else go();
})();
