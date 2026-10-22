/* ============================================================
   Student check-in + real visitor counter + trainer visit report.
   Works only when the live API (/api/schedule + Upstash) is connected;
   otherwise it stays completely hidden (no fake numbers).
   Config: window.VISIT_KEY = "<site prefix>" (same prefix as the schedule keys).
   ============================================================ */
(function () {
  const KEY = String(window.VISIT_KEY || "hub");
  const API = "api/schedule";
  const ME_KEY = KEY + "_student_v1", UNLOCK = KEY + "_schedule_unlocked", PINK = KEY + "_schedule_pin";
  if (!/^https?:$/.test(location.protocol)) return;
  const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
  const ss = (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } };
  const fmtN = (n) => Number(n || 0).toLocaleString("en-IN");
  const post = (b) => fetch(API, { method: "POST", body: JSON.stringify(b) }).then(r => r.json());

  function me() { try { const m = JSON.parse(ls.get(ME_KEY)); if (m && m.vid) return m; } catch (e) {} const m = { vid: "v_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36) }; ls.set(ME_KEY, JSON.stringify(m)); return m; }
  function saveMe(m) { ls.set(ME_KEY, JSON.stringify(m)); }

  /* ---------- styles ---------- */
  const css = `
  .vk-overlay{position:fixed;inset:0;background:rgba(10,15,30,.55);backdrop-filter:blur(3px);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px}
  .vk-modal{background:var(--paper-raised,#fff);color:var(--ink,#111);border-radius:18px;max-width:420px;width:100%;padding:26px 24px;box-shadow:0 24px 60px rgba(0,0,0,.25);border:1px solid var(--line,#e6e6e2)}
  .vk-modal h3{margin:0 0 6px;font-size:22px} .vk-modal p{margin:0 0 16px;color:var(--ink-muted,#5f6368);font-size:13.5px;line-height:1.5}
  .vk-modal label{display:block;font-size:12.5px;font-weight:600;margin:10px 0 5px;color:var(--ink-muted,#5f6368)}
  .vk-modal input,.vk-modal select{width:100%;box-sizing:border-box;padding:11px 12px;border-radius:10px;border:1px solid var(--line,#ddd);background:var(--paper,#fafafa);color:var(--ink,#111);font-size:15px}
  .vk-modal button{margin-top:18px;width:100%;padding:12px;border:0;border-radius:10px;background:#1F9E8B;color:#fff;font-weight:700;font-size:15px;cursor:pointer}
  .vk-modal .vk-err{color:#DC2626;font-size:12.5px;min-height:16px;margin-top:6px}
  .vk-modal small{display:block;margin-top:12px;font-size:11.5px;color:var(--ink-muted,#888)}
  .vk-chip{margin:10px 20px 0;font-size:12.5px;color:var(--sidebar-text,#2b2f33);display:flex;gap:6px;align-items:center;flex-wrap:wrap}
  .vk-chip b{font-weight:700} .vk-chip button{border:0;background:none;color:#1F9E8B;cursor:pointer;font-size:12px;text-decoration:underline;padding:0}
  .vk-count{font-weight:600} .vk-count b{color:#137A6A}
  .vk-report{margin:8px 0 24px;padding:20px;border:2px dashed #93C5FD!important}
  .vk-head{display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap}
  .vk-head h3{margin:0;font-size:20px} .vk-head span{font-size:12.5px;color:var(--ink-muted,#666)}
  .vk-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:14px 0}
  .vk-tile{border:1px solid var(--line,#e6e6e2);border-radius:12px;padding:12px 14px;background:var(--paper,#fafafa)}
  .vk-tile b{display:block;font-size:24px;font-family:var(--mono,monospace);color:#137A6A} .vk-tile span{font-size:12px;color:var(--ink-muted,#666)}
  .vk-chart{display:flex;align-items:flex-end;gap:3px;height:120px;padding:8px 4px 0;border-bottom:1px solid var(--line,#ddd);margin:6px 0 4px}
  .vk-bar{flex:1;background:#BFE6DD;border-radius:4px 4px 0 0;position:relative;min-height:2px;cursor:default}
  .vk-bar.today{background:#1F9E8B} .vk-bar:hover{background:#137A6A}
  .vk-bar i{position:absolute;bottom:100%;left:50%;transform:translateX(-50%);font-style:normal;font-size:10px;color:var(--ink-muted,#666);white-space:nowrap}
  .vk-axis{display:flex;justify-content:space-between;font-size:11px;color:var(--ink-muted,#888);margin-bottom:14px}
  .vk-tools{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:10px 0}
  .vk-tools input,.vk-tools select{padding:8px 10px;border-radius:8px;border:1px solid var(--line,#ddd);background:var(--paper-raised,#fff);color:var(--ink,#111);font-size:13px}
  .vk-tools input[type=text]{flex:1;min-width:180px}
  .vk-tools button{padding:8px 12px;border-radius:8px;border:1px solid var(--line,#ddd);background:var(--paper-raised,#fff);color:var(--ink,#111);cursor:pointer;font-size:13px}
  .vk-table{width:100%;border-collapse:collapse;font-size:13px} .vk-table th{text-align:left;font-size:11.5px;text-transform:uppercase;letter-spacing:.04em;color:var(--ink-muted,#666);padding:8px;border-bottom:1px solid var(--line,#ddd);white-space:nowrap}
  .vk-table td{padding:8px;border-bottom:1px solid var(--line-soft,#eee);vertical-align:top} .vk-table td.n{font-family:var(--mono,monospace);text-align:right}
  .vk-yes{color:#15803D;font-weight:700} .vk-no{color:#9CA3AF} .vk-pages{font-size:11.5px;color:var(--ink-muted,#666)}
  .vk-wrap{overflow-x:auto}
  .vk-btile{cursor:pointer} .vk-btile.on{border-color:#1F9E8B;background:rgba(31,158,139,.08)}
  `;
  const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  /* ---------- project groups for the check-in form ---------- */
  function allProjects(sched) {
    const d = sched && sched.projects && sched.projects.length ? sched : window.PROJECT_SCHEDULE; return d && d.projects ? d.projects : [];
  }
  const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const normCode = (c) => String(c || "").trim().toUpperCase().replace(/\s+/g, "");
  function findProject(projects, code) { const c = normCode(code); return projects.find(p => normCode(p.code) === c) || null; }

  window.addEventListener("hub-trainer", () => setTimeout(() => { try { trainerWatch(); } catch (e) {} }, 100));
  /* ---------- check-in modal ---------- */
  /* ---------- one-time login: mobile number → saved profile (any device), else first-time details ---------- */
  // cb(name, group, code) is called once the student is identified. `current` = profile being edited (from "change").
  function askName(projects, cb, current, notice) {
    const ov = document.createElement("div"); ov.className = "vk-overlay";
    const many = projects.length > 0;
    document.body.appendChild(ov);
    const $ = (id) => ov.querySelector("#" + id);
    const close = () => ov.remove();
    const trainerLink = `<a href="#" id="vk-trainer">I'm the trainer →</a>`;
    const bindTrainer = () => { const t = $("vk-trainer"); if (t) t.addEventListener("click", (e) => { e.preventDefault(); close(); try { sessionStorage.setItem(KEY + "_trainer_skip", "1"); } catch (x) {}
      try { if (typeof window.switchView === "function") window.switchView("schedule"); } catch (x) {} setTimeout(() => { if (typeof window.schTrainerLogin === "function") window.schTrainerLogin(); else { const b = document.getElementById("sch-unlock"); if (b) b.click(); } }, 300); }); };
    const done = (id, prof) => { profile.uid = id.uid; profile.last4 = id.last4; profile.mobile = id.mobile; close(); cb(prof.name, prof.group, prof.batch); };
    // ---- step 1: mobile number
    function stepMobile() {
      ov.innerHTML = `<div class="vk-modal" role="dialog" aria-modal="true" aria-labelledby="vk-t">
        <h3 id="vk-t">👋 Welcome! Log in once</h3>
        <p>Enter your mobile number. First time? We'll ask your name, project code and group once. Already registered on another phone or laptop? Your details come back automatically.</p>
        <label for="vk-mob">Mobile number</label><input id="vk-mob" type="tel" inputmode="numeric" maxlength="14" autocomplete="tel" placeholder="10-digit mobile number" value="${esc(current && current.mobile || "")}">
        <div class="vk-err" id="vk-err"></div>
        <button id="vk-go">Continue →</button>
        <small>Your number is only used as your login id: the site keeps a coded id and the last 4 digits, never the full number. ${trainerLink}</small></div>`;
      bindTrainer(); const inp = $("vk-mob"); setTimeout(() => inp.focus(), 50);
      const go = () => {
        const mob = inp.value.replace(/\D/g, "").replace(/^(?:91|0)(?=\d{10}$)/, "");
        if (!/^[6-9]\d{9}$/.test(mob)) { $("vk-err").textContent = "Please enter a valid 10-digit mobile number."; return; }
        $("vk-go").disabled = true; $("vk-go").textContent = "Checking…";
        post({ action: "lookup", mobile: mob }).then(j => {
          if (!j || !j.ok) throw new Error(j && j.error || "error");
          const id = { uid: j.uid, last4: j.last4, mobile: mob };
          const pr = j.profile;
          if (pr && (!many || findProject(projects, pr.batch))) { const p = findProject(projects, pr.batch); return done(id, { name: pr.name, group: pr.group, batch: p ? p.code : pr.batch }); }
          stepDetails(id, pr || current, pr ? "Your saved project code is no longer active. Please pick your current project code." : "");
        }).catch(() => { $("vk-go").disabled = false; $("vk-go").textContent = "Continue →"; $("vk-err").textContent = "Could not reach the server. Check your internet and try again."; });
      };
      $("vk-go").addEventListener("click", go); inp.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    }
    // ---- step 2: first-time details (or editing)
    function stepDetails(id, cur, note) {
      const curP = (cur && findProject(projects, cur.batch)) || (projects.length === 1 ? projects[0] : null);
      const codeField = many
        ? `<select id="vk-code"><option value="">Select your project code…</option>${projects.map(p => `<option value="${esc(p.code)}" ${curP && curP.code === p.code ? "selected" : ""}>${esc(p.code)}${p.time ? ` · ${esc(DAYS[p.presDay] ? DAYS[p.presDay].slice(0, 3) + " " : "")}${esc(p.time)}` : ""}</option>`).join("")}</select>`
        : `<input id="vk-code" type="text" maxlength="20" placeholder="e.g. P1426" value="${esc(cur && cur.batch || "")}" style="text-transform:uppercase">`;
      ov.innerHTML = `<div class="vk-modal" role="dialog" aria-modal="true" aria-labelledby="vk-t">
        <h3 id="vk-t">${cur && cur.name ? "Update your details" : "First time here? Tell us who you are"}</h3>
        <p>${note ? `<b>${esc(note)}</b> ` : ""}You fill this only once. After this, the site remembers you on this device, and on any other device after you enter your mobile number.</p>
        <label for="vk-name">Your full name</label><input id="vk-name" type="text" maxlength="48" autocomplete="name" placeholder="e.g. Ajay Sharma" value="${esc(cur && cur.name || "")}">
        <label for="vk-code">Project code <span style="font-weight:400">(given by your trainer, e.g. P1426)</span></label>${codeField}
        <label for="vk-group">Your group</label><div id="vk-gwrap"></div>
        <div class="vk-err" id="vk-err"></div>
        <button id="vk-go">Save & continue →</button>
        <small>Mobile ending ${esc(id.last4 || "")} · only your trainer can see your name. ${trainerLink}</small></div>`;
      bindTrainer();
      const fillGroups = () => {
        const p = findProject(projects, $("vk-code").value);
        const groups = (p ? p.groups || [] : []).map(g => g.name).filter(Boolean);
        const prev = $("vk-group") ? $("vk-group").value : "";
        const keep = prev || (cur && cur.group) || "";
        $("vk-gwrap").innerHTML = groups.length
          ? `<select id="vk-group"><option value="">Select your group…</option>${groups.map(g => `<option ${keep === g ? "selected" : ""}>${esc(g)}</option>`).join("")}</select>`
          : `<input id="vk-group" type="text" maxlength="40" placeholder="${many && !p ? "Select your project code first" : "e.g. Group 3"}" value="${esc(keep === "Not in a group yet" ? "" : keep)}" ${many && !p ? "disabled" : ""}>`;
      };
      fillGroups(); $("vk-code").addEventListener(many ? "change" : "input", fillGroups);
      const inp = $("vk-name"); setTimeout(() => (cur && cur.name ? $("vk-code") : inp).focus(), 50);
      const go = () => {
        const err = (t) => { $("vk-err").textContent = t; };
        const n = inp.value.replace(/\s+/g, " ").trim();
        const nn = n === n.toLowerCase() || n === n.toUpperCase() ? n.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase()) : n;
        if (n.length < 2 || !/[a-zA-Zऀ-ॿ]/.test(n)) return err("Please enter your real name (at least 2 letters).");
        const codeRaw = $("vk-code").value.trim(); const p = findProject(projects, codeRaw);
        if (many && !p) return err("Please select your project code.");
        if (!many && !/^[A-Za-z0-9-]{2,20}$/.test(codeRaw)) return err("Please enter your project code, like P1426.");
        const g = $("vk-group").value.replace(/\s+/g, " ").trim(); if (!g || g === "Not in a group yet") return err("Please select your group. Group is required.");
        const code = p ? p.code : normCode(codeRaw);
        $("vk-go").disabled = true; $("vk-go").textContent = "Saving…";
        post({ action: "register", mobile: id.mobile, name: nn, group: g, batch: code }).then(j => {
          if (!j || !j.ok) { $("vk-go").disabled = false; $("vk-go").textContent = "Save & continue →"; return err((j && j.error) || "Could not save. Try again."); }
          done({ uid: j.uid, last4: j.last4, mobile: id.mobile }, { name: nn, group: g, batch: code });
        }).catch(() => { $("vk-go").disabled = false; $("vk-go").textContent = "Save & continue →"; err("Could not reach the server. Check your internet and try again."); });
      };
      $("vk-go").addEventListener("click", go); inp.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    }
    if (current && current.mobile && current.uid) stepDetails({ uid: current.uid, last4: current.last4, mobile: current.mobile }, current, notice || "");
    else stepMobile();
  }

  /* ---------- greeting chip in the sidebar ---------- */
  function renderChip(m, projects) {
    let c = document.getElementById("vk-chip");
    const host = document.querySelector(".sidebar-progress"); if (!host) return;
    if (!c) { c = document.createElement("div"); c.id = "vk-chip"; c.className = "vk-chip"; host.parentNode.insertBefore(c, host); }
    c.innerHTML = `👋 <b>${esc(m.name)}</b>${m.group && m.group !== "Not in a group yet" ? ` · ${esc(m.group)}` : ""}${m.batch ? ` · <b>${esc(m.batch)}</b>` : ""} <button type="button">change</button>`;
    c.querySelector("button").onclick = () => askName(projects, (n, g, code) => { m.name = n; m.group = g; setBatch(m, code); saveMe(m); renderChip(m, projects); ping(curView(), true); lastPush = ""; progressSync(); }, m);
  }

  function setBatch(m, code) {
    m.batch = code || ""; m.codeOk = !!code;
    if (code) ls.set(KEY + "_schedule_view", code);
    saveMe(m);
    setTimeout(() => { try { window.dispatchEvent(new Event("hub-student")); } catch (e) {} }, 0);
  }

  /* ---------- visit pings ---------- */
  let lastPing = {}, profile = null;
  function curView() { const v = document.querySelector("section.view.active"); return v ? v.id.replace(/^view-/, "") : "home"; }
  function ping(page, force) {
    if (!profile) return; const now = Date.now(); page = page || "home";
    if (!force && lastPing[page] && now - lastPing[page] < 600000) return;   // one visit per page per 10 minutes (saves database requests) lastPing[page] = now;
    post({ action: "visit", vid: profile.vid, uid: profile.uid || "", last4: profile.last4 || "", name: profile.name || "", group: profile.group || "", batch: profile.batch || "", page }).catch(() => {});
  }
  function hookViews() {
    const orig = window.switchView;
    if (typeof orig === "function" && !orig._vk) { const w = function (v) { const r = orig.apply(this, arguments); setTimeout(() => ping(v), 50); return r; }; w._vk = true; window.switchView = w; }
    document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("[data-view],[data-goto]"); if (b) setTimeout(() => ping(curView()), 120); });
  }

  /* ---------- cloud progress (site provides window.HUB_PROGRESS) ---------- */
  const normKey = (n, g) => (String(n || "").toLowerCase() + "|" + String(g || "").toLowerCase()).replace(/\s+/g, " ").trim();
  let pushTimer = null, lastPush = "";
  function progressSync() {
    const H = window.HUB_PROGRESS; if (!H || !profile || !profile.name) return;
    try { if (H.welcome) H.welcome(profile); } catch (e) {}
    const flag = KEY + "_restored_" + normKey(profile.name, profile.group);
    post({ action: "restore", name: profile.name, group: profile.group || "" }).then(j => {
      let changed = false; try { changed = !!(j && j.ok && j.data && H.apply(j.data)); } catch (e) {}
      if (changed && !ss(flag)) { try { sessionStorage.setItem(flag, "1"); } catch (e) {} location.reload(); return; }
      startPush();
    }).catch(startPush);
  }
  function pushNow() {
    const H = window.HUB_PROGRESS; if (!H || !profile || !profile.name) return;
    let c; try { c = H.collect(); } catch (e) { return; }
    const sig = JSON.stringify(c.data) + "|" + profile.name + "|" + (profile.group || ""); if (sig === lastPush) return; lastPush = sig;
    fetch(API, { method: "POST", keepalive: true, body: JSON.stringify({ action: "progress", name: profile.name, group: profile.group || "", data: c.data, summary: c.summary }) }).catch(() => { lastPush = ""; });
  }
  function startPush() {
    if (pushTimer) return; pushNow(); pushTimer = setInterval(() => { if (document.visibilityState === "visible") pushNow(); }, 60000);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") pushNow(); });
    window.addEventListener("hub-progress", () => setTimeout(pushNow, 300));
  }

  /* ---------- real counter in the hero ---------- */
  function renderCounter(s) {
    const host = document.querySelector(".ds-stats"); if (!host || !s) return;
    let el = document.getElementById("vk-count");
    if (!el) { el = document.createElement("span"); el.id = "vk-count"; el.className = "vk-count"; host.insertBefore(el, host.firstChild); }
    el.innerHTML = `👥 <b>${fmtN(s.unique)}</b> ${s.unique === 1 ? "student" : "students"} visited · <b>${fmtN(s.today)}</b> today`;
  }

  /* ---------- trainer report ---------- */
  let report = null, rState = { q: "", batch: "All", group: "All", today: false, sort: "last", days: 30 };
  const pl = (p) => { try { if (typeof VIEW_LABELS === "object" && VIEW_LABELS[p]) return VIEW_LABELS[p]; } catch (e) {} return p === "overview" ? "Home" : p; };
  const dt = (t) => t ? new Date(t).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—";
  function merged() {
    const by = {};
    (report.students || []).forEach(s => {
      const k = s.uid ? s.uid : (s.name || "").toLowerCase().replace(/\s+/g, " ").trim() + "|" + (s.group || "").toLowerCase() + "|" + normCode(s.batch);
      const m = by[k] || (by[k] = { name: s.name, group: s.group, batch: s.batch, last4: s.last4 || "", first: s.first, last: 0, views: 0, days: new Set(), pages: {}, devices: 0, lastPage: "" });
      m.devices++; m.views += s.views; m.first = Math.min(m.first || s.first, s.first); if (s.last > m.last) { m.last = s.last; m.lastPage = s.lastPage; if (s.name) { m.name = s.name; m.group = s.group; m.batch = s.batch; } if (s.last4) m.last4 = s.last4; }
      (s.days || []).forEach(d => m.days.add(d)); (s.pages || []).forEach(([p, n]) => m.pages[p] = (m.pages[p] || 0) + n);
      if (!m.batch && s.batch) m.batch = s.batch;
    });
    const P = report.progress || {};
    Object.values(by).forEach(m => { m.prog = P[normKey(m.name, m.group)] || null; });
    return Object.values(by);
  }
  function renderReport() {
    const box = document.getElementById("vk-report"); if (!box || !report) return;
    const all = merged(); const today = report.today;
    const bOf = (s) => normCode(s.batch) || "—";
    const batches = ["All", ...[...new Set(all.map(bOf))].sort()];
    if (!batches.includes(rState.batch)) rState.batch = "All";
    const inB = all.filter(s => rState.batch === "All" || bOf(s) === rState.batch);
    const groups = ["All", ...[...new Set(inB.map(s => s.group || "—"))].sort()];
    if (!groups.includes(rState.group)) rState.group = "All";
    let rows = inB.filter(s => (!rState.q || s.name.toLowerCase().includes(rState.q.toLowerCase())) && (rState.group === "All" || (s.group || "—") === rState.group) && (!rState.today || s.days.has(today)));
    const bTiles = batches.slice(1).map(b => { const xs = all.filter(s => bOf(s) === b); return `<div class="vk-tile vk-btile ${rState.batch === b ? "on" : ""}" data-vb="${esc(b)}"><b>${fmtN(xs.length)}</b><span>${esc(b)} · ${fmtN(xs.filter(s => s.days.has(today)).length)} today · ${(n => n + (n === 1 ? " group" : " groups"))(new Set(xs.map(s => s.group)).size)}</span></div>`; }).join("");
    rows.sort(rState.sort === "name" ? (a, b) => a.name.localeCompare(b.name) : rState.sort === "views" ? (a, b) => b.views - a.views : rState.sort === "days" ? (a, b) => b.days.size - a.days.size : rState.sort === "prog" ? (a, b) => ((b.prog && b.prog.pct) || 0) - ((a.prog && a.prog.pct) || 0) : (a, b) => b.last - a.last);
    const daily = report.daily || []; const mx = Math.max(1, ...daily.map(d => d.unique));
    const todayN = all.filter(s => s.days.has(today)).length;
    const hasProg = all.some(s => s.prog);
    const pc = (s) => s.prog ? (window.HUB_PROGRESS && window.HUB_PROGRESS.reportCells ? window.HUB_PROGRESS.reportCells(s.prog) : [`${s.prog.pct || 0}%`]) : (window.HUB_PROGRESS && window.HUB_PROGRESS.reportHead ? window.HUB_PROGRESS.reportHead().map(() => "—") : ["—"]);
    const ph = hasProg ? (window.HUB_PROGRESS && window.HUB_PROGRESS.reportHead ? window.HUB_PROGRESS.reportHead() : ["Progress"]) : [];
    box.innerHTML = `<div class="vk-head"><h3>👥 Student visits</h3><span>Only you can see this (trainer login). Updated ${new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span></div>
      <div class="vk-tiles">
        <div class="vk-tile"><b>${fmtN(all.length)}</b><span>Students checked in by name</span></div>
        <div class="vk-tile"><b>${fmtN(todayN)}</b><span>Of them visited today</span></div>
        <div class="vk-tile"><b>${fmtN(report.unique)}</b><span>Unique visitors (all devices)</span></div>
        <div class="vk-tile"><b>${fmtN(report.views)}</b><span>Page views in total</span></div>
      </div>
      ${bTiles ? `<div style="font-size:13px;font-weight:600;">Students checked in, by project code (click to filter)</div><div class="vk-tiles">${bTiles}</div>` : ""}
      <div style="font-size:13px;font-weight:600;">Unique visitors per day · last ${daily.length} days</div>
      <div class="vk-chart">${daily.map(d => `<div class="vk-bar ${d.day === today ? "today" : ""}" style="height:${Math.round(d.unique / mx * 100)}%" title="${d.day}: ${d.unique} visitors · ${d.named} named · ${d.views} page views">${d.unique ? `<i>${d.unique}</i>` : ""}</div>`).join("")}</div>
      <div class="vk-axis"><span>${daily[0] ? daily[0].day : ""}</span><span>today</span></div>
      <div class="vk-tools">
        <input type="text" id="vk-q" placeholder="Search a student by name…" value="${esc(rState.q)}">
        <select id="vk-b">${batches.map(b => `<option value="${esc(b)}" ${b === rState.batch ? "selected" : ""}>${b === "All" ? "All project codes" : esc(b)}</option>`).join("")}</select>
        <select id="vk-g">${groups.map(g => `<option ${g === rState.group ? "selected" : ""}>${esc(g)}</option>`).join("")}</select>
        <select id="vk-s"><option value="last" ${rState.sort === "last" ? "selected" : ""}>Sort: last visit</option><option value="views" ${rState.sort === "views" ? "selected" : ""}>Sort: most page views</option><option value="days" ${rState.sort === "days" ? "selected" : ""}>Sort: most active days</option><option value="name" ${rState.sort === "name" ? "selected" : ""}>Sort: name</option>${hasProg ? `<option value="prog" ${rState.sort === "prog" ? "selected" : ""}>Sort: progress</option>` : ""}</select>
        <label style="font-size:13px;display:flex;gap:6px;align-items:center;"><input type="checkbox" id="vk-t" ${rState.today ? "checked" : ""}> Visited today only</label>
        <button id="vk-csv">⬇ Download CSV</button><button id="vk-ref">⟳ Refresh</button>
      </div>
      <div class="vk-wrap"><table class="vk-table"><thead><tr><th>Student</th><th>Project code</th><th>Group</th><th>First visit</th><th>Last visit</th><th>Today</th><th>Active days</th><th>Page views</th>${ph.map(h => `<th>${esc(h)}</th>`).join("")}<th>Most opened pages</th></tr></thead>
      <tbody>${rows.length ? rows.map(s => `<tr><td><b>${esc(s.name)}</b>${s.last4 ? `<div class="vk-pages">📱 ••${esc(s.last4)}</div>` : ""}${s.devices > 1 ? `<div class="vk-pages">${s.devices} devices</div>` : ""}</td><td>${esc(bOf(s))}</td><td>${esc(s.group || "—")}</td><td>${dt(s.first)}</td><td>${dt(s.last)}<div class="vk-pages">on ${esc(pl(s.lastPage))}</div></td>
        <td>${s.days.has(today) ? '<span class="vk-yes">✓</span>' : '<span class="vk-no">—</span>'}</td><td class="n">${s.days.size}</td><td class="n">${fmtN(s.views)}</td>${hasProg ? pc(s).map(v => `<td class="n">${v}</td>`).join("") : ""}
        <td class="vk-pages">${Object.entries(s.pages).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([p, n]) => `${esc(pl(p))} (${n})`).join(", ")}</td></tr>`).join("")
        : `<tr><td colspan="${9 + ph.length}" style="color:var(--ink-muted,#888);padding:16px;">No students match. Students appear here after they open the site and enter their name.</td></tr>`}</tbody></table></div>`;
    const re = () => renderReport();
    box.querySelector("#vk-q").addEventListener("input", (e) => { rState.q = e.target.value; const pos = e.target.selectionStart; re(); const n = document.getElementById("vk-q"); n.focus(); n.setSelectionRange(pos, pos); });
    box.querySelector("#vk-g").addEventListener("change", (e) => { rState.group = e.target.value; re(); });
    box.querySelector("#vk-b").addEventListener("change", (e) => { rState.batch = e.target.value; rState.group = "All"; re(); });
    box.querySelectorAll("[data-vb]").forEach(t => t.addEventListener("click", () => { rState.batch = rState.batch === t.dataset.vb ? "All" : t.dataset.vb; rState.group = "All"; re(); }));
    box.querySelector("#vk-s").addEventListener("change", (e) => { rState.sort = e.target.value; re(); });
    box.querySelector("#vk-t").addEventListener("change", (e) => { rState.today = e.target.checked; re(); });
    box.querySelector("#vk-ref").addEventListener("click", () => loadReport(true));
    box.querySelector("#vk-csv").addEventListener("click", () => {
      const q = (v) => `"${String(v == null ? "" : v).replace(/"/g, '""')}"`;
      const strip = (v) => String(v).replace(/<[^>]*>/g, "");
      const lines = [["Name", "Mobile (last 4)", "Group", "Project code", "First visit", "Last visit", "Visited today", "Active days", "Page views", ...ph, "Days visited"].map(q).join(",")]
        .concat(rows.map(s => [s.name, s.last4 ? "••" + s.last4 : "", s.group, bOf(s), dt(s.first), dt(s.last), s.days.has(today) ? "Yes" : "No", s.days.size, s.views, ...(hasProg ? pc(s).map(strip) : []), [...s.days].sort().join(" ")].map(q).join(",")));
      const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\n")], { type: "text/csv" }));
      a.download = `student-visits-${KEY}-${today}.csv`; document.body.appendChild(a); a.click(); a.remove();
    });
  }
  function loadReport(fresh) {
    const box = document.getElementById("vk-report"); if (!box) return;
    if (!report) box.innerHTML = `<div class="vk-head"><h3>👥 Student visits</h3><span>Loading…</span></div>`;
    post({ action: "report", pin: ss(PINK) || "", days: rState.days, fresh: fresh === true }).then(j => {
      if (!j.ok) { box.innerHTML = `<div class="vk-head"><h3>👥 Student visits</h3><span>${esc(j.error || "Could not load")}</span></div>`; return; }
      report = j; renderReport();
      try { const by = {}; merged().forEach(s => { const b = normCode(s.batch) || "—"; const x = by[b] || (by[b] = { n: 0, today: 0 }); x.n++; if (s.days.has(j.today)) x.today++; });
        window.VK_SUMMARY = { byBatch: by }; window.dispatchEvent(new Event("vk-summary")); } catch (e) {}
    }).catch(() => { box.innerHTML = `<div class="vk-head"><h3>👥 Student visits</h3><span>Could not reach the server.</span></div>`; });
  }
  function trainerWatch() {
    const isTr = ss(UNLOCK) === "1" && !!ss(PINK);
    const root = document.getElementById("sch-root"); let box = document.getElementById("vk-report");
    if (isTr && root && !box) { box = document.createElement("div"); box.id = "vk-report"; box.className = "card vk-report"; root.parentNode.insertBefore(box, root.nextSibling); report = null; loadReport(); }
    if (!isTr && box) { box.remove(); report = null; }
  }

  /* ---------- start ---------- */
  function start() {
    fetch(API + "?stats=1&t=" + Date.now(), { cache: "no-store" }).then(r => r.ok ? r.json() : null).then(s => {
      if (!s || typeof s.unique !== "number") return;          // live API not connected → stay hidden
      renderCounter(s);
      fetch(API + "?t=" + Date.now(), { cache: "no-store" }).then(r => r.json()).catch(() => null).then(sched => {
        const projects = allProjects(sched);
        profile = me();
        // one batch only: assign it silently; several batches: the student must pick (once), and again if their code was removed
        const known = findProject(projects, profile.batch);
        if (projects.length === 1 && !known) { profile.batch = projects[0].code; saveMe(profile); }
        const isTrainer = ss(UNLOCK) === "1" || ss(KEY + "_trainer_skip") === "1";
        // ask only when we really don't know the student: never again once they've logged in on this device
        const knownStudent = !!profile.name && (profile.uid || profile.codeOk) && !!profile.group && profile.group !== "Not in a group yet";
        let needCode = !knownStudent;
        if (knownStudent && projects.length > 0 && !known) {
          if (projects.length === 1) { setBatch(profile, projects[0].code); saveMe(profile); if (profile.uid && profile.mobile) post({ action: "register", mobile: profile.mobile, name: profile.name, group: profile.group, batch: profile.batch }).catch(() => {}); }
          else needCode = "moved";
        }
        const begin = () => { renderChip(profile, projects); hookViews(); ping(curView(), true); progressSync(); setTimeout(() => fetch(API + "?stats=1&t=" + Date.now()).then(r => r.json()).then(renderCounter).catch(() => {}), 1500); };
        if (isTrainer) return;
        if (profile.name && !needCode) begin();
        else askName(projects, (n, g, code) => { profile.name = n; profile.group = g; setBatch(profile, code); saveMe(profile); begin(); }, profile.name ? profile : null,
          needCode === "moved" ? "Your project code is no longer active. Please pick your current project code." : "");
      });
      setInterval(trainerWatch, 1500); trainerWatch();
    }).catch(() => {});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
