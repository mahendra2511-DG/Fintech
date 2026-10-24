/* Dexa Coach — AI practice for Data Analyst students (uses /api/ask with the free Groq key, same as Ask Dexa).
   - Mock Viva: Dexa asks project questions, the student answers (typing or 🎤), Dexa scores each answer /10 with tips
   - Insight Coach: turns "Sales fell in Q3" into What → Why → So what → Now what
   - SQL Tutor: under a wrong answer in the SQL Practice Editor, "Ask Dexa why" gives hints step by step (never the full query)
   - My Certificate: unlocks when SQL practice, Dashboard Evaluation score and the Final presentation are done
   Scores are saved in this browser and, when the student is checked in, in the site's cloud progress so the trainer
   sees them in the site report and in ProjectVault. Settings (optional): window.COACH_CONFIG = {sqlPct, reviewMin, finalStage} */
(function () {
  if (window.__coachKit) return; window.__coachKit = true;
  const RC = window.REVIEW_CONFIG || {};
  const CFG = Object.assign({ sqlPct: 50, reviewMin: 70, finalStage: "final" }, window.COACH_CONFIG || {});
  const SITE_KEY = RC.siteKey || String(window.VISIT_KEY || document.title.toLowerCase().replace(/[^a-z]+/g, "_").slice(0, 30));
  const CKEY = SITE_KEY + "_coach_v1", RKEY = SITE_KEY + "_reviews_v1";
  const API = "api/ask";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const cut = (s, n) => { s = String(s || ""); return s.length > n ? s.slice(0, n) + "…" : s; };
  const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  const g = (n) => { try { return eval("typeof " + n + " !== 'undefined' ? " + n + " : null"); } catch (e) { return null; } };   // site constants/functions (not on window)
  // the SQL editor and schedule are global on the hub sites and wrapped (window.__ED / window.__SCH) on the older sites
  const ED = () => { const E = window.__ED || {}; return { problems: g("PRACTICE_PROBLEMS") || E.problems || null, state: g("edState") || E.state || null, cur: g("edCur") || (E.cur ? E.cur() : null), run: g("edRun") || E.run || null }; };
  const SCH = () => { const H = window.__SCH || {}; return { data: g("schData") || H.data || null, myGroup: g("schMyGroup") || H.myGroup || null, norm: g("schNorm") || H.norm || null }; };
  const go = (v) => { const b = document.querySelector(`#nav button[data-view="${v}"], button[data-view="${v}"]`); if (b) b.click(); else if (typeof window.switchView === "function") window.switchView(v); setTimeout(() => window.scrollTo({ top: 0, behavior: "auto" }), 30); };
  const ping = () => { try { window.dispatchEvent(new Event("hub-progress")); } catch (e) {} };
  const today = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  const fmtDay = (s) => { try { return new Date(s + "T12:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }); } catch (e) { return s; } };

  /* ================= saved state ================= */
  function load() { let s = null; try { s = JSON.parse(ls.get(CKEY)); } catch (e) {} s = s && typeof s === "object" ? s : {};
    return { viva: Object.assign({ best: null, runs: [] }, s.viva || {}), ins: Object.assign({ n: 0, best: null }, s.ins || {}), rv: s.rv || null, cert: s.cert || null, hints: +s.hints || 0 }; }
  function save(s) { s.viva.runs = (s.viva.runs || []).slice(0, 10); ls.set(CKEY, JSON.stringify(s)); }
  function reviews() { try { return JSON.parse(ls.get(RKEY)) || []; } catch (e) { return []; } }
  function reviewBest(s) {   // best Dashboard Evaluation score (kept even if the student deletes the review later)
    let best = s.rv && typeof s.rv.score === "number" ? s.rv : null;
    reviews().forEach(h => { const v = h && h.review && +h.review.overall; if (v >= 0 && (!best || v > best.score)) best = { score: Math.round(v), ts: h.ts || Date.now(), kind: h.kind || "", file: cut(h.file || "", 40) }; });
    return best;
  }
  function me() {
    const vk = window.VISIT_KEY ? String(window.VISIT_KEY) + "_student_v1" : null;
    const read = (k) => { try { const m = JSON.parse(ls.get(k)); return m && m.name ? m : null; } catch (e) { return null; } };
    if (vk && read(vk)) return read(vk);
    try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/_student_v1$/.test(k)) { const m = read(k); if (m) return m; } } } catch (e) {}
    return null;
  }

  /* ================= this project's facts ================= */
  function projectInfo() {
    const K = g("KPIS") || [];
    const kpis = (Array.isArray(K) ? K : []).filter(k => k && k.name).map(k => ({ name: String(k.name), formula: String(k.formula || k.dax || "") }));
    let ctx = "";
    const ps = g("PROBLEM_STATEMENT"); if (ps) ctx += "Problem: " + cut(typeof ps === "string" ? ps : JSON.stringify(ps), 900) + "\n";
    const rq = g("REQUIREMENTS"); if (Array.isArray(rq) && rq.length) ctx += "Required dashboards/views:\n" + rq.slice(0, 12).map(r => "- " + (Array.isArray(r) ? r.filter(x => typeof x === "string").join(" · ") : JSON.stringify(r))).join("\n").slice(0, 1500) + "\n";
    if (kpis.length) ctx += `KPI list (${kpis.length}):\n` + kpis.slice(0, 40).map(k => `- ${k.name}: ${cut(k.formula, 110)}`).join("\n") + "\n";
    const GT = g("GOTCHAS"); if (Array.isArray(GT) && GT.length) ctx += "Known data traps:\n" + GT.slice(0, 8).map(x => "- " + cut((x.t || x.title || "") + ": " + (x.d || x.desc || ""), 200)).join("\n") + "\n";
    if (!kpis.length) { const v = $("view-kpis"); if (v) ctx += "KPI page: " + cut(v.textContent.replace(/\s+/g, " "), 2500) + "\n"; }
    const DB = window.PRACTICE_DB; if (DB && typeof DB === "object") ctx += "Tables: " + Object.entries(DB).slice(0, 14).map(([n, t]) => `${n}(${(t.cols || []).slice(0, 12).join(", ")})`).join("; ").slice(0, 1500) + "\n";
    return { name: document.title.split(/\s[—|-]\s/)[0].replace(/&amp;/g, "&").trim(), context: ctx.slice(0, 6500), kpis };
  }
  function sqlStats() {
    const E = ED(), P = E.problems, st = typeof E.state === "function" ? E.state() : null;
    if (!Array.isArray(P) || !P.length) return null;
    const solved = st && st.solved ? P.filter(p => st.solved[p.id]).length : 0;
    return { solved, total: P.length, need: Math.max(1, Math.ceil(P.length * CFG.sqlPct / 100)) };
  }
  function finalStatus() {   // the student's group status for the Final presentation, from the live schedule
    const m = me(); const H = SCH(), sd = H.data, mg = H.myGroup, norm = H.norm || ((x) => String(x || "").trim().toUpperCase());
    if (!m || typeof sd !== "function" || typeof mg !== "function") return { state: "unknown" };
    let d = null; try { d = sd(); } catch (e) {}
    const p = d && (d.projects || []).find(x => norm(x.code) === norm(m.batch));
    if (!p) return { state: "nocode", code: m.batch || "" };
    let grp = null; try { grp = mg(p); } catch (e) {}
    if (!grp) return { state: "nogroup", code: p.code, group: m.group || "" };
    const st = ((p.status || {})[grp.id] || {})[CFG.finalStage] || "pending";
    return { state: st === "done" ? "done" : "pending", code: p.code, group: grp.name };
  }

  /* ================= AI call ================= */
  let aiOn = null;
  async function ai(mode, body) {
    let r, j = null;
    try { r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ mode, site: projectInfo().name }, body)) }); j = await r.json().catch(() => null); }
    catch (e) { throw new Error("No internet connection, or the site's AI service is not reachable."); }
    if (r.ok && j && j.ok && j.data) return j.data;
    if (j && j.error === "not_configured") { aiOn = false; throw new Error("AI is not switched on for this site yet (the trainer adds the free GROQ_API_KEY in Vercel)."); }
    throw new Error((j && j.message) || (r.status === 404 ? "The AI service (api/ask) is not deployed on this site yet." : "Dexa could not answer right now. Please try again."));
  }
  function checkAi() { if (!/^https?:$/.test(location.protocol)) { aiOn = false; return; } fetch(API, { cache: "no-store" }).then(r => r.json()).then(j => { aiOn = !!(j && j.configured); render(); }).catch(() => { aiOn = false; render(); }); }

  /* ================= UI state ================= */
  const S = { tab: "viva", viva: null, vivaSetup: { stage: "general", n: 5, level: "medium" }, busy: "", err: "", ins: null, insIn: { kpi: "", chart: "", text: "" }, certShow: false };
  try { const t = sessionStorage.getItem(CKEY + "_tab"); if (t) S.tab = t; } catch (e) {}
  const STAGES = [["general", "Whole project"], ["excel", "Excel"], ["tableau", "Tableau"], ["powerbi", "Power BI"], ["sql", "SQL"], ["final", "Final presentation"]];

  function render() {
    const root = $("coach-root"); if (!root) return;
    const s = load();
    const tabs = [["viva", "🎤 Mock Viva"], ["insight", "💡 Insight Coach"], ["cert", "🎓 My Certificate"]];
    root.innerHTML = `
      <div class="section-head"><div class="eyebrow">AI coach · practice before you present</div><h2>Dexa Coach 🦉</h2>
        <p>Practise your viva, sharpen your insights, get SQL hints and download your capstone certificate. Dexa is an AI assistant: use it to practise and learn, then do your own work.</p></div>
      ${aiOn === false ? `<div class="ck-note warn">⚠️ AI is not switched on for this site yet. Your trainer needs to add the free Groq key in Vercel (GROQ_API_KEY). The certificate tab still works.</div>` : ""}
      <div class="ck-tabs" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" aria-selected="${S.tab === k}" class="${S.tab === k ? "on" : ""}" data-tab="${k}">${l}</button>`).join("")}
        <button type="button" class="ck-link" data-go="editor" ${$("view-editor") ? "" : "hidden"}>⌨️ SQL Tutor: open the SQL editor →</button></div>
      <div id="ck-body">${S.tab === "viva" ? vivaHtml(s) : S.tab === "insight" ? insHtml(s) : certHtml(s)}</div>`;
    bind();
  }

  /* ---------- Mock Viva ---------- */
  function vivaHtml(s) {
    const V = S.viva, st = S.vivaSetup;
    if (!V) {
      const runs = s.viva.runs || [];
      return `<div class="ck-grid"><div class="card ck-card">
        <h3>Start a mock viva</h3><p class="ck-sub">Dexa asks questions about <b>this project's</b> KPIs, data and dashboards, like your trainer or an interviewer would. Answer in your own words (type, or press 🎤 and speak). You get a score out of 10 for every answer.</p>
        <div class="ck-form">
          <label>Topic<select id="ck-stage">${STAGES.map(([k, l]) => `<option value="${k}" ${st.stage === k ? "selected" : ""}>${l}</option>`).join("")}</select></label>
          <label>Questions<select id="ck-n">${[3, 5, 8].map(n => `<option ${st.n === n ? "selected" : ""}>${n}</option>`).join("")}</select></label>
          <label>Level<select id="ck-level">${["easy", "medium", "hard"].map(l => `<option value="${l}" ${st.level === l ? "selected" : ""}>${l[0].toUpperCase() + l.slice(1)}</option>`).join("")}</select></label>
        </div>
        <button type="button" class="btn-blue" id="ck-start" ${S.busy ? "disabled" : ""}>${S.busy === "q" ? "⏳ Dexa is preparing questions…" : "Start mock viva →"}</button>
        ${S.err ? `<div class="ck-note err">⚠ ${esc(S.err)}</div>` : ""}
      </div>
      <div class="card ck-card"><h3>Your viva scores</h3>
        ${s.viva.best != null ? `<div class="ck-big">${s.viva.best}%<span>best score</span></div>` : `<p class="ck-sub">No viva yet. Do one before every presentation.</p>`}
        ${runs.length ? `<ul class="ck-runs">${runs.map(r => `<li><b>${r.score}%</b> · ${esc((STAGES.find(x => x[0] === r.stage) || ["", "Project"])[1])} · ${r.n} Q · ${esc(new Date(r.ts).toLocaleDateString("en-IN", { day: "numeric", month: "short" }))}</li>`).join("")}</ul>` : ""}
        <p class="ck-tip">Tip: aim for 70%+ before the presentation. Each run gives new questions.</p></div></div>`;
    }
    if (V.result) return vivaResult(V);
    const i = V.i, q = V.qs[i];
    return `<div class="card ck-card ck-viva">
      <div class="ck-vh"><span>Question ${i + 1} of ${V.qs.length}${q.topic ? ` · ${esc(q.topic)}` : ""}</span><span class="ck-dots">${V.qs.map((x, k) => `<i class="${k === i ? "now" : (V.ans[k] || "").trim() ? "done" : ""}"></i>`).join("")}</span></div>
      <p class="ck-q">${esc(q.q)}</p>
      <div class="ck-qacts"><button type="button" class="btn-outline ck-sm" id="ck-say">🔊 Read aloud</button>${SR ? `<button type="button" class="btn-outline ck-sm ${listening ? "rec" : ""}" id="ck-mic">${listening ? "⏹ Stop" : "🎤 Speak answer"}</button>` : ""}</div>
      <textarea id="ck-ans" rows="6" placeholder="Answer as you would in the viva: what, how you calculated it, and why it matters for the business.">${esc(V.ans[i] || "")}</textarea>
      <div class="ck-row"><button type="button" class="btn-outline" id="ck-prev" ${i ? "" : "disabled"}>← Previous</button>
        ${i < V.qs.length - 1 ? `<button type="button" class="btn-blue" id="ck-next">Next question →</button>` : `<button type="button" class="btn-blue" id="ck-grade" ${S.busy ? "disabled" : ""}>${S.busy === "g" ? "⏳ Dexa is checking your answers…" : "Finish & get my score"}</button>`}
        <button type="button" class="ck-x" id="ck-quit">Quit</button></div>
      ${S.err ? `<div class="ck-note err">⚠ ${esc(S.err)}</div>` : ""}</div>`;
  }
  function band(p) { return p >= 75 ? "g" : p >= 50 ? "a" : "r"; }
  function vivaResult(V) {
    const R = V.result, p = R.pct;
    return `<div class="card ck-card"><div class="ck-score"><div class="ck-dial ${band(p)}"><b>${p}%</b><span>viva score</span></div>
      <div><div class="ck-band ${band(p)}">${p >= 75 ? "Presentation ready 👏" : p >= 50 ? "Good base, practise the weak answers" : "Needs more practice"}</div><p>${esc(R.summary || "")}</p></div></div>
      ${V.qs.map((q, k) => { const it = R.items[k] || { score: 0 }; return `<div class="ck-item ${band(it.score * 10)}"><div class="ck-ih"><b>Q${k + 1}.</b> ${esc(q.q)} <span class="ck-pill ${band(it.score * 10)}">${it.score}/10</span></div>
        <div class="ck-yours"><span>Your answer:</span> ${esc(cut(V.ans[k] || "(no answer)", 600))}</div>
        ${it.good ? `<div>✅ ${esc(it.good)}</div>` : ""}${it.improve ? `<div>🔧 ${esc(it.improve)}</div>` : ""}
        ${it.points && it.points.length ? `<div class="ck-pts"><span>A strong answer covers:</span><ul>${it.points.map(x => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}</div>`; }).join("")}
      <div class="ck-row"><button type="button" class="btn-blue" id="ck-again">New questions, same topic →</button><button type="button" class="btn-outline" id="ck-back">Back to viva home</button></div></div>`;
  }

  /* ---------- Insight Coach ---------- */
  function insHtml(s) {
    const K = projectInfo().kpis, I = S.insIn, R = S.ins;
    const kinds = [["observation", "Observation", "What happened"], ["insight", "Insight", "+ why it happened"], ["recommendation", "Recommendation", "+ what to do"]];
    return `<div class="ck-grid"><div class="card ck-card">
      <h3>Write one finding from your dashboard</h3><p class="ck-sub">Dexa tells you if it is an observation, an insight or a recommendation, and how to make it stronger with <b>What → Why → So what → Now what</b>.</p>
      <div class="ck-form">
        <label>KPI (optional)<select id="ck-kpi"><option value="">Choose a KPI</option>${K.map(k => `<option ${I.kpi === k.name ? "selected" : ""}>${esc(k.name)}</option>`).join("")}</select></label>
        <label>Chart / page (optional)<input id="ck-chart" maxlength="120" placeholder="e.g. Monthly trend, Region map" value="${esc(I.chart)}"></label>
      </div>
      <textarea id="ck-text" rows="4" maxlength="900" placeholder="e.g. Sales dropped in Q3.">${esc(I.text)}</textarea>
      <div class="ck-row"><button type="button" class="btn-blue" id="ck-coach" ${S.busy ? "disabled" : ""}>${S.busy === "i" ? "⏳ Dexa is reading…" : "Coach me →"}</button>
        <span class="ck-sub">Coached so far: <b>${s.ins.n}</b>${s.ins.best != null ? ` · best ${s.ins.best}/20` : ""}</span></div>
      ${S.err ? `<div class="ck-note err">⚠ ${esc(S.err)}</div>` : ""}
    </div>
    <div class="card ck-card">${R ? `
      <div class="ck-ladder">${kinds.map(([k, l, d]) => `<div class="${R.kind === k ? "on" : kinds.findIndex(x => x[0] === R.kind) > kinds.findIndex(x => x[0] === k) ? "past" : ""}"><b>${l}</b><span>${d}</span></div>`).join("")}</div>
      <div class="ck-bars">${[["what", "What (metric, number, period)"], ["why", "Why (driver backed by data)"], ["so_what", "So what (business impact)"], ["now_what", "Now what (action)"]].map(([k, l]) => `<div><div class="ck-bl"><span>${l}</span><b>${R.scores[k]}/5</b></div><div class="ck-bt"><i style="width:${R.scores[k] * 20}%"></i></div></div>`).join("")}</div>
      ${R.feedback ? `<p>${esc(R.feedback)}</p>` : ""}
      ${R.ask && R.ask.length ? `<h4>Dig deeper in your data</h4><ul class="ck-list">${R.ask.map(x => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
      ${R.example ? `<h4>A stronger version (fill in your own numbers)</h4><div class="ck-ex">${esc(R.example)}</div>` : ""}
      <p class="ck-tip">Edit your finding on the left and press <b>Coach me</b> again to improve the score.</p>` : `
      <h3>How a finding grows</h3>
      <div class="ck-ladder">${kinds.map(([, l, d]) => `<div><b>${l}</b><span>${d}</span></div>`).join("")}</div>
      <ul class="ck-list"><li><b>Observation:</b> "Sales dropped in Q3."</li><li><b>Insight:</b> "Q3 sales fell [X%] vs Q2, mostly in [region], because repeat orders from [segment] fell."</li><li><b>Recommendation:</b> "Run a win-back offer for [segment] in [region]; recovering half the drop adds about [₹ amount] a quarter."</li></ul>`}</div></div>`;
  }

  /* ---------- Certificate ---------- */
  // the certificate is issued by the trainer ("Send certificates" when the project is complete) to every enrolled student
  function certState() { const m = me(); return { m, cert: m && m.cert && m.cert.id ? m.cert : null, auth: !!(m && m.token) }; }
  function certHtml(s) {
    const C = certState(), m = C.m || {};
    const prep = [["review", "🧪", "Get your dashboard evaluated"], ["editor", "⌨️", "Practise SQL problems"]].filter(([v]) => $("view-" + v)).concat([["", "🎤", "Do a mock viva (tab above)"]]);
    return `<div class="ck-grid"><div class="card ck-card">
      ${C.cert ? `<h3>🎉 Your certificate is ready</h3><p class="ck-sub">Congratulations, <b>${esc(m.name)}</b>! Your trainer issued your Data Analyst Capstone certificate on ${esc(fmtDay(C.cert.date))}.</p>
        <ul class="ck-crit"><li class="ok"><span class="ck-ic">🎓</span><div><b>Certificate ID ${esc(C.cert.id)}</b><div class="ck-sub">Project ${esc(C.cert.code || m.batch || "")}</div></div></li></ul>
        <p class="ck-tip">Download it as PNG, or print / save it as PDF. Add it to your LinkedIn profile under Licenses & certifications.</p>`
      : !C.auth ? `<h3>Log in to see your certificate</h3><p class="ck-sub">Certificates are linked to your account.</p><button type="button" class="btn-blue" id="ck-login">Log in / Create account</button>`
      : `<h3>Your certificate is on its way</h3><p class="ck-sub">When your project is complete (after the Final presentation), your trainer sends the <b>Data Analyst Capstone certificate</b> to everyone enrolled in <b>${esc(m.batch || "your project")}</b>. It appears here and is emailed to <b>${esc(m.email || "your email")}</b>.</p>
        <ul class="ck-crit"><li class="ok"><span class="ck-ic">✅</span><div><b>Enrolled</b><div class="ck-sub">${esc(m.name || "")} · ${esc(m.batch || "")}</div></div></li><li><span class="ck-ic">⏳</span><div><b>Certificate sent by your trainer</b><div class="ck-sub">Not yet. <a href="#" id="ck-recheck">Check again</a></div></div></li></ul>
        <h4>Get presentation-ready meanwhile</h4><ul class="ck-list">${prep.map(([v, ic, t]) => `<li>${ic} ${v ? `<a href="#" data-go="${v}">${t}</a>` : t}</li>`).join("")}</ul>
        <p class="ck-tip">Name spelled wrong? Fix it from <b>account</b> (your name in the sidebar) before your trainer sends the certificates.</p>`}
    </div>
    <div class="card ck-card ck-cprev">${C.cert ? `<canvas id="ck-canvas" width="2400" height="1697" aria-label="Your certificate"></canvas>
      <div class="ck-row"><button type="button" class="btn-blue" id="ck-png">⬇ Download PNG</button><button type="button" class="btn-outline" id="ck-pdf">🖨 Print / Save as PDF</button></div>` :
      `<div class="ck-lock"><div class="ck-lockic">🔒</div><b>Data Analyst Capstone certificate</b><span>with your name, project and certificate ID</span></div>`}</div></div>`;
  }
  /* certificate: white sheet, purple V header, gold rosette + ribbons, bold title, script name, two signature lines with a gold seal */
  let fontsReady = null;
  function certFonts() {
    if (fontsReady) return fontsReady;
    const want = ["800 40px Montserrat", "600 40px Montserrat", "500 40px Montserrat", "40px 'Great Vibes'"];
    const sheet = new Promise(res => { let l = document.getElementById("ck-fonts"); if (l) return res();
      l = document.createElement("link"); l.id = "ck-fonts"; l.rel = "stylesheet"; l.onload = l.onerror = () => res();
      l.href = "https://fonts.googleapis.com/css2?family=Great+Vibes&family=Montserrat:wght@500;600;700;800&display=swap"; document.head.appendChild(l); });
    // the font faces exist only after the stylesheet has loaded, so wait for it before asking for the fonts
    fontsReady = Promise.race([sheet.then(() => Promise.all(want.map(f => document.fonts && document.fonts.load ? document.fonts.load(f) : null))), new Promise(r => setTimeout(r, 4000))]).catch(() => {});
    return fontsReady;
  }
  const F = { sans: "Montserrat, 'Segoe UI', Arial, sans-serif", script: "'Great Vibes', 'Segoe Script', 'Brush Script MT', cursive" };
  async function drawCert(cv, s, C) {
    await certFonts();
    const x = cv.getContext("2d"), K = cv.width / 2000, W = 2000, H = 1414, P = projectInfo();
    x.setTransform(K, 0, 0, K, 0, 0); x.textAlign = "center"; x.textBaseline = "alphabetic";
    const INK = "#1F1B2E", MUTE = "#5D5873", PURPLE = "#4C1D95";
    const gold = (x0, y0, x1, y1) => { const g = x.createLinearGradient(x0, y0, x1, y1); [["#8A6516", 0], ["#D4A72C", .22], ["#FCE9A4", .42], ["#C9971F", .6], ["#F4D778", .8], ["#A87A18", 1]].forEach(([c, o]) => g.addColorStop(o, c)); return g; };
    const fit = (txt, font, size, max) => { let z = size; do { x.font = font.replace("#", z); z -= 2; } while (x.measureText(txt).width > max && z > 12); };
    const spaced = (txt, cx, y, sp) => { const w = [...txt].reduce((a, ch) => a + x.measureText(ch).width + sp, -sp); let px = cx - w / 2; x.textAlign = "left"; [...txt].forEach(ch => { x.fillText(ch, px, y); px += x.measureText(ch).width + sp; }); x.textAlign = "center"; };
    const wrap = (txt, cx, y, max, lh) => { const words = txt.split(" "); let line = "", n = 0; words.forEach(w => { const t = line ? line + " " + w : w; if (x.measureText(t).width > max && line) { x.fillText(line, cx, y + n++ * lh); line = w; } else line = t; }); if (line) x.fillText(line, cx, y + n * lh); };
    // sheet
    x.fillStyle = "#FFFFFF"; x.fillRect(0, 0, W, H);
    // purple V header (two tones) with a thin gold edge
    const VY = 470, VT = 150;
    let g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, "#3B0F7A"); g.addColorStop(1, "#5B21B6"); x.fillStyle = g; x.fillRect(0, 0, W, VY + 10);
    g = x.createLinearGradient(0, 0, 900, 470); g.addColorStop(0, "#1E0A45"); g.addColorStop(1, "#2E1065"); x.fillStyle = g; x.beginPath(); x.moveTo(0, 0); x.lineTo(880, 0); x.lineTo(W / 2, VT + 40); x.lineTo(0, VY); x.closePath(); x.fill();
    x.fillStyle = "rgba(255,255,255,.05)"; x.beginPath(); x.moveTo(W, 0); x.lineTo(W - 560, 0); x.lineTo(W, 300); x.closePath(); x.fill();
    x.fillStyle = "#FFFFFF"; x.beginPath(); x.moveTo(0, VY); x.lineTo(W / 2, VT); x.lineTo(W, VY); x.lineTo(W, H); x.lineTo(0, H); x.closePath(); x.fill();
    x.strokeStyle = gold(0, VY, W, VY); x.lineWidth = 5; x.beginPath(); x.moveTo(0, VY); x.lineTo(W / 2, VT); x.lineTo(W, VY); x.stroke();
    // thin inner frame on the white part
    x.strokeStyle = "rgba(76,29,149,.14)"; x.lineWidth = 2; x.beginPath(); x.moveTo(40, VY + 26); x.lineTo(40, H - 40); x.lineTo(W - 40, H - 40); x.lineTo(W - 40, VY + 26); x.stroke();
    // gold rosette with ribbons
    const rx = W / 2, ry = 150;
    const tail = (dx, ang, len) => { x.save(); x.translate(rx + dx, ry + 40); x.rotate(ang); x.fillStyle = gold(-30, 0, 30, len); x.beginPath(); x.moveTo(-30, 0); x.lineTo(30, 0); x.lineTo(30, len); x.lineTo(0, len - 30); x.lineTo(-30, len); x.closePath(); x.shadowColor = "rgba(0,0,0,.25)"; x.shadowBlur = 8; x.fill(); x.restore(); };
    tail(-38, .32, 210); tail(38, -.32, 210); tail(-14, .1, 240); tail(14, -.1, 240);
    x.save(); x.shadowColor = "rgba(0,0,0,.35)"; x.shadowBlur = 18; x.shadowOffsetY = 6; x.fillStyle = gold(rx - 115, ry - 115, rx + 115, ry + 115); x.beginPath();
    for (let k = 0; k <= 96; k++) { const a = k / 96 * Math.PI * 2, r = k % 2 ? 104 : 114; x.lineTo(rx + Math.cos(a) * r, ry + Math.sin(a) * r); } x.closePath(); x.fill(); x.restore();
    for (let k = 0; k < 40; k++) { const a = k / 40 * Math.PI * 2; x.strokeStyle = k % 2 ? "rgba(255,240,190,.55)" : "rgba(120,85,15,.45)"; x.lineWidth = 3; x.beginPath(); x.moveTo(rx + Math.cos(a) * 74, ry + Math.sin(a) * 74); x.lineTo(rx + Math.cos(a) * 100, ry + Math.sin(a) * 100); x.stroke(); }
    x.fillStyle = gold(rx + 70, ry - 70, rx - 70, ry + 70); x.beginPath(); x.arc(rx, ry, 70, 0, 7); x.fill();
    x.strokeStyle = "rgba(120,85,15,.55)"; x.lineWidth = 2; x.beginPath(); x.arc(rx, ry, 62, 0, 7); x.stroke();
    x.fillStyle = "rgba(255,248,215,.9)"; x.font = `800 46px ${F.sans}`; x.fillText("DA", rx, ry + 10); x.fillStyle = "rgba(110,78,12,.85)"; x.font = `700 13px ${F.sans}`; spaced("CAPSTONE", rx, ry + 36, 2.5);
    // title
    x.fillStyle = INK; fit("CERTIFICATE OF COMPLETION", `800 #px ${F.sans}`, 86, W - 360); spaced("CERTIFICATE OF COMPLETION", W / 2, 580, 3);
    x.fillStyle = PURPLE; x.font = `600 22px ${F.sans}`; spaced("DATA ANALYST CAPSTONE PROGRAM  ·  MAHENDRA SINGH", W / 2, 636, 6);
    x.fillStyle = MUTE; x.font = `500 32px ${F.sans}`; x.fillText("This certificate is presented to", W / 2, 726);
    // name
    x.fillStyle = INK; fit(C.m.name, `400 #px ${F.script}`, 150, W - 560); x.fillText(C.m.name, W / 2, 880);
    x.strokeStyle = gold(W / 2 - 380, 0, W / 2 + 380, 0); x.lineWidth = 2; x.beginPath(); x.moveTo(W / 2 - 380, 912); x.lineTo(W / 2 + 380, 912); x.stroke();
    // body
    x.fillStyle = "#4A4560"; x.font = `500 30px ${F.sans}`;
    const proj = C.cert.project || P.name;
    wrap(`For successfully completing the ${proj} Data Analyst capstone project${C.cert.code ? ` (${C.cert.code})` : ""}, applying SQL, data modelling, dashboard design and business storytelling to a real-world business problem.`, W / 2, 978, 1220, 46);
    // signatures + seal
    const L = 520, R = W - 520, LY = 1222;
    x.fillStyle = INK; x.font = `400 76px ${F.script}`; x.fillText("Mahendra Singh", L, LY - 22);
    x.font = `600 38px ${F.sans}`; x.fillText(fmtDay(C.cert.date), R, LY - 26);
    [L, R].forEach(cx => { x.strokeStyle = "#3A3550"; x.lineWidth = 2; x.beginPath(); x.moveTo(cx - 230, LY); x.lineTo(cx + 230, LY); x.stroke(); });
    x.fillStyle = INK; x.font = `700 28px ${F.sans}`; x.fillText("Mahendra Singh", L, LY + 46); x.fillText("Date of Issue", R, LY + 46);
    x.fillStyle = MUTE; x.font = `500 24px ${F.sans}`; x.fillText("Data Analyst Trainer", L, LY + 82); x.fillText(`Certificate ID ${C.cert.id}`, R, LY + 82);
    const sx = W / 2, sy = LY - 10;
    x.save(); x.shadowColor = "rgba(0,0,0,.2)"; x.shadowBlur = 10; x.shadowOffsetY = 3; x.fillStyle = gold(sx - 80, sy - 80, sx + 80, sy + 80); x.beginPath();
    for (let k = 0; k <= 64; k++) { const a = k / 64 * Math.PI * 2, r = k % 2 ? 70 : 78; x.lineTo(sx + Math.cos(a) * r, sy + Math.sin(a) * r); } x.closePath(); x.fill(); x.restore();
    x.strokeStyle = "rgba(255,245,200,.7)"; x.lineWidth = 2; x.beginPath(); x.arc(sx, sy, 56, 0, 7); x.stroke();
    x.fillStyle = "rgba(110,78,12,.9)"; x.font = `800 22px ${F.sans}`; x.fillText("✓", sx, sy - 8); x.font = `700 13px ${F.sans}`; spaced("VERIFIED", sx, sy + 16, 2); spaced(String(new Date(C.cert.date + "T12:00:00").getFullYear()), sx, sy + 34, 2);
    // footer
    x.fillStyle = "#9A96AA"; x.font = `500 18px ${F.sans}`; x.fillText(`${P.name}  ·  ${location.host || "capstone project site"}`, W / 2, H - 62);
    x.setTransform(1, 0, 0, 1, 0, 0);
  }

  /* ---------- events ---------- */
  let SR = window.SpeechRecognition || window.webkitSpeechRecognition, rec = null, listening = false;
  function stopMic() { if (rec) { try { rec.stop(); } catch (e) {} } listening = false; }
  function bind() {
    const root = $("coach-root"); if (!root) return;
    root.querySelectorAll("[data-tab]").forEach(b => b.addEventListener("click", () => { stopMic(); S.tab = b.dataset.tab; S.err = ""; try { sessionStorage.setItem(CKEY + "_tab", S.tab); } catch (e) {} render(); if (tabCheck0) tabCheck0(); }));
    root.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => go(b.dataset.go)));
    const on = (id, f) => { const e = $(id); if (e) e.addEventListener("click", f); };
    const keepAns = () => { const t = $("ck-ans"); if (t && S.viva) S.viva.ans[S.viva.i] = t.value; };
    ["ck-stage", "ck-n", "ck-level"].forEach(id => { const e = $(id); if (e) e.addEventListener("change", () => { S.vivaSetup = { stage: $("ck-stage").value, n: +$("ck-n").value, level: $("ck-level").value }; }); });
    on("ck-start", () => startViva([]));
    on("ck-next", () => { keepAns(); stopMic(); S.viva.i++; S.err = ""; render(); focusAns(); });
    on("ck-prev", () => { keepAns(); stopMic(); S.viva.i--; S.err = ""; render(); focusAns(); });
    on("ck-quit", () => { if (S.viva.ans.some(a => (a || "").trim()) && !confirm("Quit this viva? Your answers are not scored.")) return; stopMic(); S.viva = null; S.err = ""; render(); });
    on("ck-grade", () => { keepAns(); stopMic(); gradeViva(); });
    on("ck-again", () => { const old = S.viva.qs.map(q => q.q); S.viva = null; startViva(old); });
    on("ck-back", () => { S.viva = null; render(); });
    on("ck-say", () => { try { const u = new SpeechSynthesisUtterance(S.viva.qs[S.viva.i].q); u.lang = "en-IN"; u.rate = 0.95; speechSynthesis.cancel(); speechSynthesis.speak(u); } catch (e) {} });
    on("ck-mic", toggleMic);
    const ta = $("ck-ans"); if (ta) ta.addEventListener("input", () => { S.viva.ans[S.viva.i] = ta.value; });
    ["ck-kpi", "ck-chart", "ck-text"].forEach(id => { const e = $(id); if (e) e.addEventListener("input", () => { S.insIn = { kpi: $("ck-kpi").value, chart: $("ck-chart").value, text: $("ck-text").value }; }); if (e && e.tagName === "SELECT") e.addEventListener("change", () => { S.insIn.kpi = e.value; }); });
    on("ck-coach", coachInsight);
    on("ck-login", () => { if (window.VK_AUTH && window.VK_AUTH.login) window.VK_AUTH.login(); });
    const rc = $("ck-recheck"); if (rc) rc.addEventListener("click", (e) => { e.preventDefault(); rc.textContent = "Checking…"; if (window.VK_AUTH) window.VK_AUTH.refresh().then(render); });
    let drawn = Promise.resolve(); const cv = $("ck-canvas"); if (cv) { const C = certState(); if (C.cert) drawn = drawCert(cv, null, C); }
    on("ck-png", async () => { await drawn; const c = $("ck-canvas"); const a = document.createElement("a"); a.download = `Certificate-${(me() || {}).name || "student"}.png`.replace(/\s+/g, "_"); a.href = c.toDataURL("image/png"); document.body.appendChild(a); a.click(); a.remove(); });
    on("ck-pdf", () => { const c = $("ck-canvas"); const w = window.open("", "_blank"); if (!w) { alert("Allow pop-ups to print the certificate, or use Download PNG."); return; }
      w.document.write(`<!doctype html><title>Certificate</title><style>@page{size:A4 landscape;margin:0}html,body{margin:0;height:100%}img{width:100%;height:auto;display:block}</style><img src="${c.toDataURL("image/png")}" onload="setTimeout(()=>{print()},200)">`); w.document.close(); });
  }
  function focusAns() { const t = $("ck-ans"); if (t) t.focus(); }
  function toggleMic() {
    if (listening) { stopMic(); render(); return; }
    try {
      rec = new SR(); rec.lang = "en-IN"; rec.continuous = true; rec.interimResults = false;
      const base = (S.viva.ans[S.viva.i] || "").trim();
      let said = "";
      rec.onresult = (e) => { for (let k = e.resultIndex; k < e.results.length; k++) if (e.results[k].isFinal) said += (said ? " " : "") + e.results[k][0].transcript.trim(); S.viva.ans[S.viva.i] = (base ? base + " " : "") + said; const t = $("ck-ans"); if (t) t.value = S.viva.ans[S.viva.i]; };
      rec.onend = () => { if (listening) { listening = false; render(); } };
      rec.onerror = (e) => { listening = false; S.err = e.error === "not-allowed" ? "Microphone permission was blocked. Allow the mic for this site, or type your answer." : "Voice input stopped. You can type your answer."; render(); };
      rec.start(); listening = true; S.err = ""; render();
    } catch (e) { listening = false; S.err = "Voice input is not supported in this browser. Please type your answer."; render(); }
  }
  async function startViva(avoid) {
    S.busy = "q"; S.err = ""; render();
    try {
      const P = projectInfo(), st = S.vivaSetup;
      const d = await ai("viva_q", { ctx: P.context, stage: st.stage, n: st.n, level: st.level, avoid });
      S.viva = { stage: st.stage, qs: d.questions.slice(0, st.n), ans: [], i: 0, result: null };
    } catch (e) { S.err = e.message; }
    S.busy = ""; render(); focusAns();
  }
  async function gradeViva() {
    const V = S.viva; if (!V.ans.some(a => (a || "").trim().length > 2)) { S.err = "Write at least one answer first."; render(); return; }
    S.busy = "g"; S.err = ""; render();
    try {
      const d = await ai("viva_grade", { ctx: projectInfo().context, stage: V.stage, items: V.qs.map((q, k) => ({ q: q.q, tests: q.tests, a: V.ans[k] || "" })) });
      const items = V.qs.map((q, k) => (V.ans[k] || "").trim().length > 2 ? (d.items[k] || { score: 0 }) : { score: 0, good: "", improve: "No answer given. Practise this one.", points: (d.items[k] || {}).points || [] });
      const pct = Math.round(items.reduce((a, x) => a + x.score, 0) / (V.qs.length * 10) * 100);
      V.result = { items, pct, summary: d.summary };
      const s = load(); s.viva.runs = [{ ts: Date.now(), stage: V.stage, n: V.qs.length, score: pct }].concat(s.viva.runs || []); s.viva.best = Math.max(s.viva.best == null ? 0 : s.viva.best, pct); s.viva.last = pct; save(s); ping();
    } catch (e) { S.err = e.message; }
    S.busy = ""; render(); const r = $("coach-root"); if (r && V.result) r.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  async function coachInsight() {
    S.insIn = { kpi: $("ck-kpi").value, chart: $("ck-chart").value, text: $("ck-text").value };
    if (S.insIn.text.trim().length < 8) { S.err = "Write your finding in one or two sentences first."; render(); return; }
    S.busy = "i"; S.err = ""; render();
    try {
      const d = await ai("insight", { ctx: projectInfo().context, kpi: S.insIn.kpi, chart: S.insIn.chart, text: S.insIn.text });
      S.ins = d; const tot = d.scores.what + d.scores.why + d.scores.so_what + d.scores.now_what;
      const s = load(); s.ins.n = (s.ins.n || 0) + 1; s.ins.best = Math.max(s.ins.best == null ? 0 : s.ins.best, tot); save(s); ping();
    } catch (e) { S.err = e.message; }
    S.busy = ""; render();
  }

  /* ================= SQL Tutor (inside the existing SQL Practice Editor) ================= */
  const tut = { id: null, level: 0, prev: [] };
  function rowsPreview(r) { try { if (!r || !r.columns) return ""; return r.columns.join(" | ") + "\n" + (r.values || []).slice(0, 3).map(v => v.map(c => c == null ? "NULL" : String(c).slice(0, 24)).join(" | ")).join("\n") + `\n(${(r.values || []).length} rows)`; } catch (e) { return ""; } }
  function hookEditor() {
    const box = $("ed-msg"); if (!box || box._ck) return; box._ck = true;
    new MutationObserver(() => {
      const bad = box.querySelector(".ed-msg.bad"); if (!bad || box.querySelector(".ck-tut") || bad.dataset.ck) return;
      const cur = ED().cur; if (!cur) return;
      if (tut.id !== cur.id) { tut.id = cur.id; tut.level = 0; tut.prev = []; }
      bad.dataset.ck = "1";
      const w = document.createElement("div"); w.className = "ck-tut";
      w.innerHTML = `<button type="button" class="ck-tbtn">🦉 Ask Dexa why${tut.level ? ` · hint ${Math.min(tut.level + 1, 3)} of 3` : ""}</button><span class="ck-tsub">Dexa points you to the mistake. It won't write the query for you.</span>`;
      box.appendChild(w);
      w.querySelector("button").addEventListener("click", () => askTutor(w, bad.textContent));
    }).observe(box, { childList: true, subtree: true });
  }
  async function askTutor(w, outcome) {
    const cur = ED().cur; const ta = $("ed-sql"); if (!cur || !ta) return;
    const level = Math.min(tut.level + 1, 3);
    w.innerHTML = `<div class="ck-tbox">⏳ Dexa is looking at your query…</div>`;
    const run = ED().run, DB = window.PRACTICE_DB || {};
    let mine = "", exp = "";
    if (typeof run === "function") { try { mine = rowsPreview(run(ta.value)); } catch (e) { mine = "Error: " + e.message; } try { exp = rowsPreview(run(cur.sol)); } catch (e) {} }
    const schema = (cur.tables || []).map(t => `${t}(${((DB[t] || {}).cols || []).join(", ")})`).join("\n");
    try {
      const d = await ai("sql_hint", { task: cur.task || cur.t, schema, sql: ta.value, outcome: String(outcome || "").replace(/\s+/g, " ").slice(0, 400), mine, expected: exp, ref: cur.sol, level, prev: tut.prev });
      tut.level = level; tut.prev.push(d.hint || d.mistake);
      const s = load(); s.hints = (s.hints || 0) + 1; save(s);
      w.innerHTML = `<div class="ck-tbox"><div class="ck-th">🦉 Dexa · hint ${level} of 3</div>
        ${d.mistake ? `<div><b>What's wrong:</b> ${esc(d.mistake)}</div>` : ""}${d.why ? `<div><b>Why:</b> ${esc(d.why)}</div>` : ""}
        ${d.hint ? `<div><b>Hint:</b> ${esc(d.hint)}</div>` : ""}${d.fragment && level === 3 ? `<pre class="ck-frag">${esc(d.fragment)}</pre>` : ""}
        ${d.check ? `<div class="ck-tsub">✔ After fixing, check: ${esc(d.check)}</div>` : ""}
        ${level < 3 ? `<button type="button" class="ck-tbtn">Still stuck? Next hint (${level + 1} of 3)</button>` : `<div class="ck-tsub">That was the last hint. Try once more; if needed, use <b>Solution</b> and compare it with your query.</div>`}</div>`;
      const nb = w.querySelector(".ck-tbtn"); if (nb) nb.addEventListener("click", () => askTutor(w, outcome));
    } catch (e) {
      w.innerHTML = `<div class="ck-tbox">⚠ ${esc(e.message)}${cur.hint ? `<div><b>Built-in hint:</b> ${esc(cur.hint)}</div>` : ""}</div>`;
    }
  }

  /* ================= cloud progress + trainer report columns ================= */
  function coachSummary() { const s = load(); const rv = reviewBest(s); if (rv && (!s.rv || rv.score !== s.rv.score)) { s.rv = rv; save(s); } const pc = certState().cert; if (pc && (!s.cert || s.cert.id !== pc.id)) { s.cert = { id: pc.id, date: pc.date }; save(s); } return { s, rv }; }
  function wrapProgress() {
    const H = window.HUB_PROGRESS; if (!H || H._ck) return !!H; H._ck = true;
    const oc = H.collect, oa = H.apply, oh = H.reportHead, orc = H.reportCells;
    H.collect = function () {
      const c = oc.apply(this, arguments) || { data: {}, summary: {} }; const { s, rv } = coachSummary();
      c.data = Object.assign({}, c.data, { coach: { viva: { best: s.viva.best, runs: (s.viva.runs || []).slice(0, 5) }, ins: s.ins, rv, cert: s.cert, hints: s.hints } });
      c.summary = Object.assign({}, c.summary, { rv: rv ? rv.score : null, viva: s.viva.best, ins: s.ins.n || 0, cert: s.cert ? s.cert.id + " · " + s.cert.date : null });
      return c;
    };
    H.apply = function (r) {
      let ch = false; const R = r && r.coach;
      if (R) { const s = load();
        if (R.viva && R.viva.best != null && (s.viva.best == null || R.viva.best > s.viva.best)) { s.viva.best = R.viva.best; if (!s.viva.runs.length) s.viva.runs = R.viva.runs || []; ch = true; }
        if (R.ins && (R.ins.n || 0) > (s.ins.n || 0)) { s.ins = R.ins; ch = true; }
        if (R.rv && (!s.rv || R.rv.score > s.rv.score)) { s.rv = R.rv; ch = true; }
        if (R.cert && !s.cert) { s.cert = R.cert; ch = true; }
        if ((R.hints || 0) > (s.hints || 0)) { s.hints = R.hints; }
        save(s); }
      const o = oa ? oa.apply(this, arguments) : false;
      if (ch && !o) render();
      return o;   // coach scores alone never force a page reload
    };
    if (oh && orc) {
      H.reportHead = function () { return oh.apply(this, arguments).concat(["Dashboard score", "Mock viva", "Certificate"]); };
      H.reportCells = function (p) { return orc.apply(this, arguments).concat([p.rv != null ? p.rv + "/100" : "—", p.viva != null ? p.viva + "%" : "—", p.cert ? "🎓 " + String(p.cert).split(" · ")[0] : "—"]); };
    }
    return true;
  }

  /* ================= styles ================= */
  const css = document.createElement("style"); css.id = "coach-css";
  css.textContent = `#coach-root .ck-tabs{display:flex;flex-wrap:wrap;gap:8px;margin:4px 0 18px;align-items:center}
  #coach-root .ck-tabs button{border:1px solid var(--line,#CBD5E1);background:transparent;border-radius:22px;padding:8px 16px;cursor:pointer;color:inherit;font:inherit;font-size:14px;font-weight:600}
  #coach-root .ck-tabs button.on{background:#7C3AED;color:#fff;border-color:#7C3AED}#coach-root .ck-tabs .ck-link{margin-left:auto;border-style:dashed;font-weight:500}
  #coach-root .ck-grid{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:18px;align-items:start}
  #coach-root .ck-card{padding:20px 22px}#coach-root .ck-card h3{margin:0 0 6px;font-size:17px}#coach-root .ck-card h4{margin:16px 0 6px;font-size:14.5px}
  #coach-root .ck-sub{font-size:13.5px;color:var(--ink-muted,#64748B);line-height:1.5;margin:4px 0 10px}#coach-root .ck-tip{font-size:12.5px;color:var(--ink-muted,#64748B);margin:12px 0 0}
  #coach-root .ck-form{display:flex;flex-wrap:wrap;gap:10px;margin:12px 0}#coach-root .ck-form label{display:flex;flex-direction:column;gap:4px;font-size:12.5px;font-weight:600;flex:1;min-width:130px}
  #coach-root select,#coach-root input,#coach-root textarea{font:inherit;font-size:14px;padding:8px 10px;border:1px solid var(--line,#CBD5E1);border-radius:8px;background:var(--paper-raised,#fff);color:inherit;width:100%;box-sizing:border-box}
  #coach-root textarea{resize:vertical;line-height:1.5;margin:6px 0 0}
  #coach-root .ck-row{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:12px}#coach-root .ck-sm{padding:5px 12px;font-size:13px}
  #coach-root .ck-x{border:0;background:none;color:var(--ink-muted,#64748B);cursor:pointer;font:inherit;font-size:13px;margin-left:auto;text-decoration:underline}
  #coach-root button[disabled]{opacity:.6;cursor:wait}
  #coach-root .ck-note{margin-top:12px;padding:10px 12px;border-radius:8px;font-size:13.5px}#coach-root .ck-note.err{background:#FEF2F2;color:#991B1B;border:1px solid #FECACA}#coach-root .ck-note.warn{background:#FFFBEB;color:#92400E;border:1px solid #FDE68A;margin-bottom:14px}
  #coach-root .ck-big{font-size:40px;font-weight:800;color:#7C3AED;line-height:1;margin:8px 0}#coach-root .ck-big span{display:block;font-size:12px;font-weight:500;color:var(--ink-muted,#64748B);margin-top:4px}
  #coach-root .ck-runs,#coach-root .ck-list{margin:8px 0 0;padding-left:18px;font-size:13.5px;line-height:1.6}
  #coach-root .ck-vh{display:flex;justify-content:space-between;gap:10px;font-size:13px;color:var(--ink-muted,#64748B);font-weight:600}
  #coach-root .ck-dots{display:flex;gap:5px}#coach-root .ck-dots i{width:10px;height:10px;border-radius:50%;background:rgba(100,116,139,.25)}#coach-root .ck-dots i.done{background:#A78BFA}#coach-root .ck-dots i.now{background:#7C3AED}
  #coach-root .ck-q{font-size:19px;font-weight:700;line-height:1.4;margin:12px 0 10px}#coach-root .ck-qacts{display:flex;gap:8px;flex-wrap:wrap}
  #coach-root .rec{background:#FEE2E2!important;color:#991B1B!important;border-color:#FCA5A5!important}
  #coach-root .ck-score{display:flex;gap:20px;align-items:center;margin-bottom:10px}#coach-root .ck-score p{margin:6px 0;font-size:14px}
  #coach-root .ck-dial{flex:none;width:104px;height:104px;border-radius:50%;border:7px solid #16A34A;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1}#coach-root .ck-dial.a{border-color:#D97706}#coach-root .ck-dial.r{border-color:#DC2626}#coach-root .ck-dial b{font-size:28px}#coach-root .ck-dial span{font-size:11.5px;color:var(--ink-muted,#64748B);margin-top:4px}
  #coach-root .ck-band{font-weight:700;font-size:16px}#coach-root .g{color:#15803D}#coach-root .a{color:#B45309}#coach-root .r{color:#B91C1C}
  #coach-root .ck-item{border:1px solid var(--line,#E2E8F0);border-left:4px solid #16A34A;border-radius:10px;padding:12px 14px;margin:10px 0;font-size:13.5px;line-height:1.55;color:inherit}#coach-root .ck-item.a{border-left-color:#D97706}#coach-root .ck-item.r{border-left-color:#DC2626}
  #coach-root .ck-item>div{margin-top:4px;color:var(--ink,inherit)}#coach-root .ck-ih{font-size:14.5px}#coach-root .ck-yours{color:var(--ink-muted,#64748B)!important}#coach-root .ck-yours span,#coach-root .ck-pts span{font-weight:600}#coach-root .ck-pts ul{margin:4px 0 0;padding-left:18px}
  #coach-root .ck-pill{display:inline-block;font-size:12px;font-weight:700;padding:1px 9px;border-radius:20px;margin-left:6px;background:#DCFCE7;color:#166534}#coach-root .ck-pill.a{background:#FEF3C7;color:#92400E}#coach-root .ck-pill.r{background:#FEE2E2;color:#991B1B}
  #coach-root .ck-ladder{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:6px 0 14px}#coach-root .ck-ladder div{border:1px solid var(--line,#E2E8F0);border-radius:8px;padding:8px;text-align:center;font-size:13px}#coach-root .ck-ladder span{display:block;font-size:11.5px;color:var(--ink-muted,#64748B)}#coach-root .ck-ladder .past{background:rgba(124,58,237,.08)}#coach-root .ck-ladder .on{background:#7C3AED;color:#fff;border-color:#7C3AED}#coach-root .ck-ladder .on span{color:#EDE9FE}
  #coach-root .ck-bars>div{margin:8px 0}#coach-root .ck-bl{display:flex;justify-content:space-between;font-size:13px}#coach-root .ck-bt{height:8px;background:rgba(100,116,139,.15);border-radius:4px;margin-top:4px}#coach-root .ck-bt i{display:block;height:100%;background:#7C3AED;border-radius:4px}
  #coach-root .ck-ex{background:rgba(124,58,237,.07);border-left:3px solid #7C3AED;border-radius:6px;padding:10px 12px;font-size:13.5px;line-height:1.55}
  #coach-root .ck-crit{list-style:none;padding:0;margin:8px 0 14px}#coach-root .ck-crit li{display:flex;gap:10px;padding:10px 0;border-bottom:1px solid var(--line,#E2E8F0);font-size:14px}#coach-root .ck-crit .ck-sub{margin:2px 0 6px}#coach-root .ck-ic{font-size:18px;line-height:1.2}
  #coach-root .ck-cprev canvas{width:100%;height:auto;border:1px solid var(--line,#E2E8F0);border-radius:8px;display:block}
  #coach-root .ck-lock{aspect-ratio:2000/1414;border:2px dashed var(--line,#CBD5E1);border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;text-align:center;padding:16px;color:var(--ink-muted,#64748B);font-size:13px}#coach-root .ck-lock b{color:var(--ink,inherit);font-size:16px}#coach-root .ck-lockic{font-size:36px}
  .ck-tut{margin-top:8px;display:flex;flex-wrap:wrap;gap:8px;align-items:center}.ck-tbtn{border:1px solid #7C3AED;background:#7C3AED;color:#fff;border-radius:20px;padding:6px 14px;font:inherit;font-size:13px;font-weight:600;cursor:pointer}.ck-tbox .ck-tbtn{margin-top:8px;background:transparent;color:#7C3AED}
  .ck-tsub{font-size:12.5px;color:var(--ink-muted,#64748B)}.ck-tbox{width:100%;border:1px solid #DDD6FE;background:rgba(124,58,237,.06);border-radius:10px;padding:10px 12px;font-size:13.5px;line-height:1.55;color:var(--ink,inherit)}.ck-tbox>div{margin-top:3px}.ck-th{font-weight:700;color:#6D28D9}.ck-frag{background:rgba(15,23,42,.07);padding:6px 10px;border-radius:6px;font-size:12.5px;margin:6px 0 0;white-space:pre-wrap}
  @media(max-width:860px){#coach-root .ck-grid{grid-template-columns:1fr}#coach-root .ck-tabs .ck-link{margin-left:0}}
  @media(max-width:600px){#coach-root .ck-score{flex-direction:column;align-items:flex-start}#coach-root .ck-card{padding:16px}#coach-root .ck-ladder{grid-template-columns:1fr}}`;
  document.head.appendChild(css);

  let root0 = null, tabCheck0 = null;
  function init() {
    let n = 0; (function w() { if (!wrapProgress() && n++ < 40) setTimeout(w, 250); })();
    hookEditor(); document.addEventListener("click", (e) => { if (e.target && e.target.closest && e.target.closest('[data-view="editor"],.ps-row,[data-open],#ps-random,#ps-today-go')) setTimeout(hookEditor, 50); }, true);
    if (!$("coach-root")) return;
    const VL = g("VIEW_LABELS"); if (VL && typeof VL === "object") VL.coach = "Dexa Coach";
    checkAi(); render();
    // keep the certificate checklist fresh when the student comes back to the page
    const sec = $("view-coach"); if (sec) new MutationObserver(() => { if (sec.classList.contains("active") && !S.viva && !S.busy && S.tab === "cert") { render(); if (tabCheck0) tabCheck0(); } }).observe(sec, { attributes: true, attributeFilter: ["class"] });
    window.addEventListener("storage", (e) => { if (e.key === RKEY || e.key === CKEY) render(); });
    window.addEventListener("vk-account", () => { if (!S.viva && !S.busy) render(); ping(); });
    let lastCheck = 0; const tabCheck = () => { if (S.tab === "cert" && !certState().cert && window.VK_AUTH && Date.now() - lastCheck > 120000) { lastCheck = Date.now(); window.VK_AUTH.refresh(); } };
    root0 = sec; tabCheck0 = tabCheck;
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
