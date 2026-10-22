/* "Ask Mahendra" AI layer for the chat widget.
   When /api/ask is live (GROQ_API_KEY set in Vercel), typed questions get an AI answer grounded in this site's own
   text. Otherwise (file mode, no key, limit reached, error) the site's built-in search answers exactly as before. */
(function () {
  if (window.__askAI) return; window.__askAI = true;
  const API = "/api/ask";
  let ready = false, busy = false, bypass = false, chunks = null;
  const hist = [];
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------- site text → passages ---------- */
  const SKIP = "#view-schedule,#view-progress,#sch-root,.vk-overlay,.vk-report,#chat-panel,script,style,svg,noscript,.quiz-overlay,.cmdk-overlay";
  function buildChunks() {
    const out = [];
    const views = [...document.querySelectorAll("section.view, .view[id^='view-']")];
    (views.length ? views : [document.body]).forEach(v => {
      if (v.matches(SKIP)) return;
      const vid = (v.id || "").replace(/^view-/, "");
      const head = String((vid && LABEL(vid)) || (v.querySelector("h2,h1") || {}).textContent || document.title).replace(/\s+/g, " ");
      let cur = { h: head.trim(), v: vid, t: "" };
      const push = () => { if (cur.t.trim().length > 40) out.push(cur); };
      const seen = new Set();
      v.querySelectorAll("h2,h3,h4,p,li,tr,pre,dt,dd,blockquote,.kpi-formula,.chat-src").forEach(n => {
        if (n.closest(SKIP)) return;
        if (n.matches("p,li,dd") && n.parentElement && n.parentElement.closest("li,td,pre")) return;
        const tx = (n.matches("tr") ? [...n.children].map(c => c.textContent.trim()).join(" | ") : n.textContent).replace(/\s+/g, " ").trim();
        if (!tx || tx.length < 3 || seen.has(tx)) return; seen.add(tx);
        if (/^H[234]$/.test(n.tagName)) { push(); cur = { h: (head.trim() + " › " + tx).slice(0, 120), v: vid, t: "" }; return; }
        if (cur.t.length + tx.length > 1200) { push(); cur = { h: cur.h, v: vid, t: "" }; }
        cur.t += tx.slice(0, 1200) + "\n";
      });
      push();
    });
    return out;
  }
  const STOP = new Set("what is the a an of for how why does do in on to and or this that are was were be it its with me tell explain about show give can i you my we our kya hai h ka ki ke ko se me mein aur kaise kyu".split(" "));
  const toks = (s) => String(s).toLowerCase().replace(/[^a-z0-9%_\s]/g, " ").split(/\s+/).filter(w => w.length > 1 && !STOP.has(w));
  function topChunks(q, n) {
    if (!chunks || !chunks.length) chunks = buildChunks();
    const qt = [...new Set(toks(q))]; if (!qt.length) return [];
    const N = chunks.length, df = {};
    qt.forEach(t => { df[t] = chunks.reduce((a, c) => a + ((c.h + " " + c.t).toLowerCase().includes(t) ? 1 : 0), 0); });
    return chunks.map(c => {
      const h = c.h.toLowerCase(), x = c.t.toLowerCase(); let s = 0;
      qt.forEach(t => { if (!df[t]) return; const idf = Math.log(1 + N / df[t]); if (h.includes(t)) s += 2 * idf; if (x.includes(t)) s += idf * Math.min(3, x.split(t).length - 1); });
      return { c, s };
    }).filter(r => r.s > 0).sort((a, b) => b.s - a.s).slice(0, n).map(r => r.c);
  }

  /* ---------- rendering ---------- */
  function md(s) {
    const parts = String(s).split(/```[a-zA-Z]*\n?/);
    return parts.map((p, i) => {
      if (i % 2) return `<pre class="ai-code">${esc(p.replace(/\n$/, ""))}</pre>`;
      let h = esc(p).replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/`([^`]+)`/g, "<code>$1</code>");
      h = h.split(/\n/).map(l => /^\s*[-*•]\s+/.test(l) ? `<li>${l.replace(/^\s*[-*•]\s+/, "")}</li>` : (/^\s*#{1,4}\s+/.test(l) ? `<strong>${l.replace(/^\s*#{1,4}\s+/, "")}</strong>` : l)).join("\n");
      h = h.replace(/(?:<li>.*<\/li>\n?)+/g, m => `<ul class="ai-ul">${m.replace(/\n/g, "")}</ul>`);
      return h.replace(/\n{2,}/g, "<br><br>").replace(/\n/g, "<br>");
    }).join("");
  }
  function bubble(html, who, id) {
    const body = $("chat-panel-body"); const row = document.createElement("div");
    row.className = "chat-msg " + who; if (id) row.id = id;
    row.innerHTML = `<div class="chat-bubble">${html}</div>`; body.appendChild(row); body.scrollTop = body.scrollHeight; return row;
  }
  const LABEL = (v) => (typeof VIEW_LABELS !== "undefined" && VIEW_LABELS[v]) || (document.querySelector(`[data-view="${v}"]`) || {}).textContent || v;
  function openView(v) {
    try { if (typeof switchView === "function") return switchView(v); } catch (e) {}
    const b = document.querySelector(`[data-view="${v}"]`); if (b) b.click();
  }

  /* ---------- ask ---------- */
  async function ask(q, form) {
    busy = true;
    const user = bubble(esc(q), "user");
    const typing = bubble(`<span></span><span></span><span></span>`, "bot", "ai-typing"); typing.firstChild.classList.add("chat-typing");
    const ctxs = topChunks(q, 7);
    let r = null, j = {};
    try {
      r = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q, site: document.title, ctx: ctxs.map(c => ({ h: c.h, t: c.t })), hist }) });
      j = await r.json().catch(() => ({}));
    } catch (e) { r = null; }
    typing.remove(); busy = false;
    if (!r || !r.ok || !j.answer) {
      const why = r && r.status === 429 ? (j.message || "Too many questions right now. Please try again in a few minutes.")
        : r && r.status === 503 ? "" : (j.message || ("AI couldn't answer right now" + (r ? " (" + (j.error || r.status) + ")" : " (network)") + "."));
      if (why) bubble(`<small>⚠️ ${esc(why)} Showing the site's own answer:</small>`, "bot");
      if (r && (r.status === 503 || r.status === 404)) ready = false;
      user.remove(); bypass = true;               // let the built-in search answer
      const inp = $("chat-input"); inp.value = q;
      try { form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event("submit", { cancelable: true })); } finally { bypass = false; }
      return;
    }
    hist.push({ r: "user", c: q }, { r: "assistant", c: j.answer }); while (hist.length > 6) hist.shift();
    const views = [...new Set(ctxs.map(c => c.v).filter(Boolean))].slice(0, 3);
    const row = bubble(`<div class="ai-ans">${md(j.answer)}</div><div class="ai-foot"><span class="ai-tag">✨ AI answer · check with the site</span>${views.map(v => `<button type="button" class="chat-link-btn" data-v="${esc(v)}">Open ${esc(String(LABEL(v)).replace(/^[^A-Za-z0-9]+/, "").trim().slice(0, 28))} →</button>`).join("")}<button type="button" class="chat-copy-btn">Copy</button></div>`, "bot");
    row.querySelectorAll("[data-v]").forEach(b => b.addEventListener("click", () => openView(b.dataset.v)));
    const cb = row.querySelector(".chat-copy-btn");
    cb.addEventListener("click", () => { try { navigator.clipboard.writeText(row.querySelector(".ai-ans").innerText); cb.textContent = "Copied ✓"; setTimeout(() => cb.textContent = "Copy", 1400); } catch (e) {} });
  }

  function hook() {
    if (document.__ai) return; document.__ai = true;
    document.addEventListener("submit", (e) => {   // capture on document runs before the site's own handler
      const form = e.target; if (!form || form.id !== "chat-panel-form" || bypass || !ready) return;
      e.preventDefault(); e.stopImmediatePropagation();
      const inp = $("chat-input"); const q = (inp.value || "").trim(); if (!q || busy) return;
      inp.value = ""; ask(q, form);
    }, true);
    document.addEventListener("click", (e) => {    // suggestion chips also go to the AI (except "Open …" navigation chips)
      const b = e.target.closest && e.target.closest("#chat-quick-replies button, .chat-followup-chip");
      if (!b || !ready || bypass) return;
      const q = (b.dataset.quick || b.textContent || "").trim(); if (!q || /^open\b/i.test(q)) return;
      e.preventDefault(); e.stopImmediatePropagation(); if (busy) return;
      ask(q, $("chat-panel-form"));
    }, true);
  }
  function probe() {
    if (location.protocol === "file:") return;
    fetch(API, { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(j => {
      ready = !!(j && j.configured);
      if (ready) { document.documentElement.classList.add("ai-on"); const s = document.querySelector(".chat-panel-sub, .chat-panel-title span"); if (s) s.textContent = "AI assistant · answers from this project's content"; }
    }).catch(() => {});
  }
  const css = document.createElement("style");
  css.textContent = `.ai-ans pre.ai-code{white-space:pre-wrap;font-size:11.5px;background:rgba(15,23,42,.06);border-radius:6px;padding:8px 10px;margin:6px 0}
  .ai-ans code{font-size:11.5px;background:rgba(15,23,42,.06);padding:1px 4px;border-radius:4px}.ai-ans ul.ai-ul{margin:4px 0 4px 18px;padding:0}
  #ai-typing .chat-typing span{display:inline-block;width:6px;height:6px;margin:0 2px;border-radius:50%;background:#94A3B8;animation:aiDot 1s infinite}
  #ai-typing .chat-typing span:nth-child(2){animation-delay:.15s}#ai-typing .chat-typing span:nth-child(3){animation-delay:.3s}
  @keyframes aiDot{0%,80%,100%{opacity:.3}40%{opacity:1}}
  .ai-foot{margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;align-items:center}.ai-tag{font-size:10.5px;color:#64748B;width:100%}.ai-foot .chat-link-btn,.ai-foot .chat-copy-btn{margin:0!important;width:auto!important}.ai-foot .chat-copy-btn{font:inherit;font-size:11.5px;padding:4px 10px;border-radius:6px;border:1px solid rgba(100,116,139,.35);background:transparent;color:inherit;cursor:pointer}
  `;
  document.head.appendChild(css);
  const start = () => { hook(); probe(); };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
