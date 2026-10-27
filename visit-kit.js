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
  .vk-modal{max-height:calc(100vh - 32px);overflow-y:auto;position:relative}
  .vk-modal .vk-tabs{display:flex;gap:4px;background:var(--paper,#f3f4f6);border-radius:12px;padding:4px;margin:0 0 16px}
  .vk-modal .vk-tabs button{margin:0;flex:1;width:auto;padding:9px 10px;border-radius:9px;background:transparent;color:var(--ink-muted,#5f6368);font-size:14px;font-weight:700}
  .vk-modal .vk-tabs button.on{background:var(--paper-raised,#fff);color:var(--ink,#111);box-shadow:0 1px 3px rgba(0,0,0,.12)}
  .vk-modal .vk-light{font-weight:400;color:var(--ink-muted,#888)} .vk-modal .vk-hint{font-size:12px;margin-top:5px}
  .vk-modal .vk-pw{position:relative} .vk-modal .vk-pw input{padding-right:44px}
  .vk-modal .vk-pw .vk-eye{position:absolute;right:6px;top:50%;transform:translateY(-50%);margin:0;width:34px;height:34px;padding:0;background:transparent;color:inherit;font-size:16px;border-radius:8px}
  .vk-modal .vk-row{display:flex;justify-content:flex-end;margin-top:8px;font-size:13px}
  .vk-modal a{color:#137A6A;font-weight:600}
  .vk-modal .vk-x{position:absolute;right:12px;top:12px;margin:0;width:34px;height:34px;padding:0;background:transparent;color:var(--ink-muted,#666);font-size:16px}
  .vk-modal .vk-sec{background:transparent;color:#B91C1C;border:1px solid #FCA5A5;margin-top:10px}
  .vk-acc{margin:8px 0 24px;padding:20px;border:2px dashed #C4B5FD!important}
  .vk-acc .vk-cert{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px;margin:12px 0 18px}
  .vk-acc .vk-cc{border:1px solid var(--line,#e6e6e2);border-radius:12px;padding:12px 14px;background:var(--paper,#fafafa);font-size:13px}
  .vk-acc .vk-cc b{font-size:15px} .vk-acc .vk-cc .st{margin:4px 0 10px;color:var(--ink-muted,#666)} .vk-acc .vk-cc .st.ok{color:#15803D;font-weight:600}
  .vk-acc .vk-cc button{width:100%;padding:9px;border-radius:9px;border:0;background:#5B21B6;color:#fff;font-weight:700;cursor:pointer;font-size:13.5px}
  .vk-acc .vk-cc button[disabled]{background:#CBD5E1;color:#475569;cursor:not-allowed}
  .vk-acc .vk-mini{padding:4px 9px;border-radius:7px;border:1px solid var(--line,#ddd);background:var(--paper-raised,#fff);color:var(--ink,#111);cursor:pointer;font-size:12px}
  .vk-acc .vk-note{font-size:13px;padding:10px 12px;border-radius:9px;margin:8px 0;background:#F5F3FF;border:1px solid #DDD6FE}
  .vk-acc .vk-note.err{background:#FEF2F2;border-color:#FECACA;color:#991B1B}
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
  /* ---------- accounts: create account / log in / forgot password / mandatory group ---------- */
  const NOG = "";                                    // group not assigned yet
  const todayIST = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
  const kickOf = (p) => String((p && ((p.overrides && p.overrides.kickoff) || p.kickoff)) || "").slice(0, 10);
  const groupRequired = (p) => !!(p && kickOf(p) && todayIST() > kickOf(p));
  const siteName = () => document.title.split(/\s[—|-]\s/)[0].trim();
  function trainerJump(close) { close(); try { sessionStorage.setItem(KEY + "_trainer_skip", "1"); } catch (x) {}
    try { if (typeof window.switchView === "function") window.switchView("schedule"); } catch (x) {} setTimeout(() => { if (typeof window.schTrainerLogin === "function") window.schTrainerLogin(); else { const b = document.getElementById("sch-unlock"); if (b) b.click(); } }, 300); }
  function codeSelect(projects, cur) {
    return projects.length
      ? `<select id="vk-code"><option value="">Select your project code…</option>${projects.map(p => `<option value="${esc(p.code)}" ${cur && normCode(cur) === normCode(p.code) ? "selected" : ""}>${esc(p.code)}${p.time ? ` · ${esc(DAYS[p.presDay] ? DAYS[p.presDay].slice(0, 3) + " " : "")}${esc(p.time)}` : ""}</option>`).join("")}</select>`
      : `<input id="vk-code" type="text" maxlength="20" placeholder="e.g. P1426" value="${esc(cur || "")}" style="text-transform:uppercase">`;
  }
  // group list for the chosen code; "Group not assigned yet" is offered only until the day after kick-off
  function groupField(ov, projects, keep) {
    const $ = (id) => ov.querySelector("#" + id); const p = findProject(projects, $("vk-code") ? $("vk-code").value : "");
    const groups = (p ? p.groups || [] : []).map(g => g.name).filter(Boolean); const req = groupRequired(p);
    const prev = $("vk-group") ? $("vk-group").value : keep || "";
    $("vk-gwrap").innerHTML = groups.length
      ? `<select id="vk-group">${req ? `<option value="__pick">Select your group…</option>` : `<option value="">Group not assigned yet</option>`}${groups.map(g => `<option ${prev === g ? "selected" : ""}>${esc(g)}</option>`).join("")}</select>`
      : `<input id="vk-group" type="text" maxlength="40" placeholder="${projects.length && !p ? "Select your project code first" : req ? "e.g. Group 3 (required)" : "e.g. Group 3, or leave empty if not assigned yet"}" value="${esc(prev)}" ${projects.length && !p ? "disabled" : ""}>`;
    const hint = $("vk-ghint"); if (hint) hint.textContent = req ? "Your project has started, so your group is required." : "Not in a group yet? Keep 'Group not assigned yet'. You'll pick it after the first meeting.";
  }
  const readGroup = (ov) => { const g = ov.querySelector("#vk-group"); const v = g ? g.value.replace(/\s+/g, " ").trim() : ""; return v === "__pick" ? null : v; };
  const pwField = (id, ph, ac) => `<div class="vk-pw"><input id="${id}" type="password" maxlength="72" autocomplete="${ac}" placeholder="${ph}"><button type="button" class="vk-eye" data-eye="${id}" aria-label="Show password">👁</button></div>`;
  function modal(dismissible) {
    const ov = document.createElement("div"); ov.className = "vk-overlay"; document.body.appendChild(ov);
    const close = () => { ov.remove(); document.removeEventListener("keydown", esc_); };
    const esc_ = (e) => { if (e.key === "Escape" && dismissible) close(); };
    document.addEventListener("keydown", esc_);
    if (dismissible) ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
    return { ov, close, $: (id) => ov.querySelector("#" + id) };
  }
  function wire(M, onSubmit) {
    M.ov.querySelectorAll("[data-eye]").forEach(b => b.addEventListener("click", () => { const i = M.$(b.dataset.eye); i.type = i.type === "password" ? "text" : "password"; b.setAttribute("aria-label", i.type === "password" ? "Show password" : "Hide password"); }));
    const t = M.$("vk-trainer"); if (t) t.addEventListener("click", (e) => { e.preventDefault(); trainerJump(M.close); });
    const go = M.$("vk-go"); if (go) go.addEventListener("click", onSubmit);
    M.ov.querySelectorAll("input").forEach(i => i.addEventListener("keydown", (e) => { if (e.key === "Enter" && go && !go.disabled) onSubmit(); }));
  }
  const busy = (M, on, label) => { const b = M.$("vk-go"); if (!b) return; b.disabled = on; if (label) b.textContent = label; };
  // if the database is down, students can still open and read the whole site (nothing is ever locked behind the login)
  const DB_DOWN = /database|server error|reach the server|not reachable/i;   // only real server problems, never a wrong password
  const errOut = (M, t) => {
    const e = M.$("vk-err"); if (!e) return; e.textContent = t || "";
    if (t && DB_DOWN.test(t)) {
      const b = document.createElement("button"); b.type = "button"; b.className = "vk-guest"; b.textContent = "Continue without login → (open the site)";
      b.style.cssText = "display:block;width:100%;margin-top:10px;background:transparent;color:inherit;border:1.5px solid currentColor;border-radius:10px;padding:10px;font-weight:700;cursor:pointer";
      b.addEventListener("click", () => { try { sessionStorage.setItem(KEY + "_guest", "1"); } catch (x) {} M.close(); });
      e.appendChild(document.createElement("br")); e.appendChild(b);
    }
  };
  // mode: "signup" | "login" | "forgot" ; onDone(profileFromServer, token)
  function authModal(projects, mode, onDone, opts) {
    opts = opts || {}; const M = modal(false);
    const trainer = `<a href="#" id="vk-trainer">I'm the trainer →</a>`;
    const tabs = (on) => `<div class="vk-tabs" role="tablist"><button type="button" role="tab" data-mode="signup" class="${on === "signup" ? "on" : ""}">Create account</button><button type="button" role="tab" data-mode="login" class="${on === "login" ? "on" : ""}">Log in</button></div>`;
    const swap = (m) => { M.close(); authModal(projects, m, onDone, Object.assign({}, opts, { note: "" })); };
    const bindTabs = () => M.ov.querySelectorAll("[data-mode]").forEach(b => b.addEventListener("click", () => { if (b.dataset.mode !== mode) swap(b.dataset.mode); }));
    const ok = (j) => { M.close(); onDone(j.profile, j.token); };
    if (mode === "signup") {
      const c = opts.prefill || {};
      M.ov.innerHTML = `<div class="vk-modal" role="dialog" aria-modal="true" aria-labelledby="vk-t">${tabs("signup")}
        <h3 id="vk-t">${c.name ? "Set your password" : "Enroll in this project"}</h3>
        <p>${opts.note ? `<b>${esc(opts.note)}</b> ` : ""}${c.name ? "Your saved details are filled in. Add your email and a password so you can log in on any device and get your certificate." : "Create your account once. You'll use it to log in on any device, and your certificate is sent to this email."}</p>
        <label for="vk-name">Full name <span class="vk-light">(as it should appear on your certificate)</span></label><input id="vk-name" type="text" maxlength="48" autocomplete="name" placeholder="e.g. Ajay Sharma" value="${esc(c.name || "")}">
        <label for="vk-email">Email</label><input id="vk-email" type="email" maxlength="254" autocomplete="email" placeholder="you@example.com" value="${esc(c.email || "")}">
        <label for="vk-mob">Mobile number</label><input id="vk-mob" type="tel" inputmode="numeric" maxlength="14" autocomplete="tel" placeholder="10-digit mobile number" value="${esc(c.mobile || "")}">
        <label for="vk-pass">Password <span class="vk-light">(at least 6 characters)</span></label>${pwField("vk-pass", "Create a password", "new-password")}
        <label for="vk-code">Project code <span class="vk-light">(given by your trainer, e.g. P1426)</span></label>${codeSelect(projects, c.batch || (projects.length === 1 ? projects[0].code : ""))}
        <label for="vk-group">Your group</label><div id="vk-gwrap"></div><div class="vk-light vk-hint" id="vk-ghint"></div>
        <div class="vk-err" id="vk-err" role="alert"></div>
        <button id="vk-go">Create account →</button>
        <small>Already enrolled? <a href="#" data-mode2="login">Log in</a> · Only your trainer sees your details; the full mobile number is never stored. ${trainer}</small></div>`;
      groupField(M.ov, projects, c.group || ""); M.$("vk-code").addEventListener(projects.length ? "change" : "input", () => groupField(M.ov, projects, ""));
      setTimeout(() => (c.name ? M.$("vk-email") : M.$("vk-name")).focus(), 50);
      wire(M, () => {
        const n = M.$("vk-name").value.replace(/\s+/g, " ").trim(); const nn = n === n.toLowerCase() || n === n.toUpperCase() ? n.toLowerCase().replace(/(^|\s)\S/g, (x) => x.toUpperCase()) : n;
        const email = M.$("vk-email").value.trim(), mob = M.$("vk-mob").value.replace(/\D/g, "").replace(/^(?:91|0)(?=\d{10}$)/, ""), pw = M.$("vk-pass").value;
        const codeRaw = M.$("vk-code").value.trim(), p = findProject(projects, codeRaw), g = readGroup(M.ov);
        if (n.length < 2 || !/[a-zA-Zऀ-ॿ]/.test(n)) return errOut(M, "Please enter your full name.");
        if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return errOut(M, "Please enter a valid email address.");
        if (!/^[6-9]\d{9}$/.test(mob)) return errOut(M, "Please enter a valid 10-digit mobile number.");
        if (pw.length < 6) return errOut(M, "Password must be at least 6 characters.");
        if (projects.length && !p) return errOut(M, "Please select your project code.");
        if (!projects.length && !/^[A-Za-z0-9-]{2,20}$/.test(codeRaw)) return errOut(M, "Please enter your project code, like P1426.");
        if (g === null || (!g && groupRequired(p))) return errOut(M, "Your project has started, so please select your group.");
        errOut(M, ""); busy(M, true, "Creating your account…");
        post({ action: "signup", name: nn, email, mobile: mob, password: pw, batch: p ? p.code : normCode(codeRaw), group: g }).then(j => {
          if (!j || !j.ok) { busy(M, false, "Create account →"); return errOut(M, (j && j.error) || "Could not create the account. Try again."); }
          profile.mobile = mob; ok(j);
        }).catch(() => { busy(M, false, "Create account →"); errOut(M, "Could not reach the server. Check your internet and try again."); });
      });
    } else if (mode === "login") {
      const lastCode = profile.batch || ls.get(KEY + "_schedule_view") || (projects.length === 1 ? projects[0].code : "");
      M.ov.innerHTML = `<div class="vk-modal" role="dialog" aria-modal="true" aria-labelledby="vk-t">${tabs("login")}
        <h3 id="vk-t">Welcome back 👋</h3><p>${opts.note ? `<b>${esc(opts.note)}</b> ` : ""}Log in with your email or mobile number. Old students: use the mobile number you checked in with — no new account needed.</p>
        <label for="vk-login">Email or mobile number</label><input id="vk-login" type="text" maxlength="254" autocomplete="username" placeholder="you@example.com or 98xxxxxxxx" value="${esc(opts.login || "")}">
        <label for="vk-pass">Password</label>${pwField("vk-pass", "Your password", "current-password")}
        <div class="vk-row"><a href="#" id="vk-forgot">Forgot password?</a></div>
        <label for="vk-code">Project code <span class="vk-light">(the project you are attending now)</span></label>${codeSelect(projects, lastCode)}
        <label for="vk-group">Your group</label><div id="vk-gwrap"></div><div class="vk-light vk-hint" id="vk-ghint"></div>
        <div class="vk-err" id="vk-err" role="alert"></div>
        <button id="vk-go">Log in →</button>
        <small>New here? <a href="#" data-mode2="signup">Create an account</a>. ${trainer}</small></div>`;
      groupField(M.ov, projects, profile.group || ""); M.$("vk-code").addEventListener(projects.length ? "change" : "input", () => groupField(M.ov, projects, ""));
      setTimeout(() => M.$("vk-login").focus(), 50);
      M.$("vk-forgot").addEventListener("click", (e) => { e.preventDefault(); M.close(); authModal(projects, "forgot", onDone, { email: M.$("vk-login").value.includes("@") ? M.$("vk-login").value.trim() : "" }); });
      wire(M, () => {
        const id = M.$("vk-login").value.trim(), pw = M.$("vk-pass").value;
        const codeRaw = M.$("vk-code").value.trim(), p = findProject(projects, codeRaw), g = readGroup(M.ov);
        if (!id) return errOut(M, "Enter your email or mobile number.");
        // an old (mobile-only) account has no password yet: try the mobile number first
        if (!pw && /^\D*[6-9](\D*\d){9}\D*$/.test(id)) { busy(M, true, "Checking…"); return post({ action: "login", login: id, password: "-" }).then(j => { busy(M, false, "Log in →"); if (j && j.legacy) { M.close(); return claimModal(projects, onDone, { mobile: id.replace(/\D/g, "").slice(-10), batch: codeRaw || j.batch, group: g || j.group }); } errOut(M, "Enter your password."); }).catch(() => { busy(M, false, "Log in →"); errOut(M, "Could not reach the server."); }); }
        if (!pw) return errOut(M, "Enter your password.");
        if (projects.length && codeRaw && !p) return errOut(M, "Please select your project code.");
        if (g === null) return errOut(M, "Please select your group.");
        errOut(M, ""); busy(M, true, "Logging in…");
        const body = { action: "login", login: id, password: pw }; if (codeRaw) { body.batch = p ? p.code : normCode(codeRaw); body.group = g || ""; }
        post(body).then(j => {
          if (!j || !j.ok) { busy(M, false, "Log in →"); if (j && j.legacy) { M.close(); return claimModal(projects, onDone, { mobile: id.replace(/\D/g, "").slice(-10), batch: codeRaw || j.batch, group: g || j.group }); } return errOut(M, (j && j.error) || "Could not log in."); }
          if (!id.includes("@")) profile.mobile = id.replace(/\D/g, "").slice(-10);
          ok(j);
        }).catch(() => { busy(M, false, "Log in →"); errOut(M, "Could not reach the server. Check your internet and try again."); });
      });
    } else {                                     // forgot → code → new password
      let sent = false, email = opts.email || "";
      const draw = (msg) => {
        M.ov.innerHTML = `<div class="vk-modal" role="dialog" aria-modal="true" aria-labelledby="vk-t">
          <h3 id="vk-t">Reset your password</h3>
          <p>${sent ? esc(msg || "We sent a 6-digit code to your email. Enter it with your new password.") : "Enter the email you enrolled with. We'll email you a 6-digit code."}</p>
          <label for="vk-email">Email</label><input id="vk-email" type="email" maxlength="254" autocomplete="email" value="${esc(email)}" ${sent ? "readonly" : ""}>
          ${sent ? `<label for="vk-code6">6-digit code</label><input id="vk-code6" type="text" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="123456">
          <label for="vk-pass">New password</label>${pwField("vk-pass", "At least 6 characters", "new-password")}` : ""}
          <div class="vk-err" id="vk-err" role="alert"></div>
          <button id="vk-go">${sent ? "Reset password & log in →" : "Send code →"}</button>
          <small>${sent ? `<a href="#" id="vk-resend">Send a new code</a> · ` : ""}<a href="#" data-mode2="login">Back to log in</a> · No email? Your trainer can reset your password.</small></div>`;
        bindMode2();
        setTimeout(() => (sent ? M.$("vk-code6") : M.$("vk-email")).focus(), 50);
        const rs = M.$("vk-resend"); if (rs) rs.addEventListener("click", (e) => { e.preventDefault(); sent = false; draw(); });
        wire(M, () => {
          email = M.$("vk-email").value.trim();
          if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return errOut(M, "Please enter a valid email address.");
          if (!sent) { busy(M, true, "Sending…");
            return post({ action: "forgot", email, site: siteName() }).then(j => { if (!j || !j.ok) { busy(M, false, "Send code →"); return errOut(M, (j && j.error) || "Could not send the code."); } sent = true; draw(j.message); })
              .catch(() => { busy(M, false, "Send code →"); errOut(M, "Could not reach the server."); }); }
          const code = M.$("vk-code6").value.replace(/\D/g, ""), pw = M.$("vk-pass").value;
          if (code.length !== 6) return errOut(M, "Enter the 6-digit code from the email."); if (pw.length < 6) return errOut(M, "Password must be at least 6 characters.");
          busy(M, true, "Resetting…");
          post({ action: "reset", email, code, password: pw }).then(j => { if (!j || !j.ok) { busy(M, false, "Reset password & log in →"); return errOut(M, (j && j.error) || "Could not reset the password."); } ok(j); })
            .catch(() => { busy(M, false, "Reset password & log in →"); errOut(M, "Could not reach the server."); });
        });
      };
      draw();
    }
    function bindMode2() { M.ov.querySelectorAll("[data-mode2]").forEach(a => a.addEventListener("click", (e) => { e.preventDefault(); swap(a.dataset.mode2); })); }
    bindTabs(); bindMode2();
  }
  // old account (checked in with mobile before passwords existed): confirm name, add email + password, keep project code and group
  function claimModal(projects, onDone, c) {
    const M = modal(false);
    M.ov.innerHTML = `<div class="vk-modal" role="dialog" aria-modal="true" aria-labelledby="vk-t">
      <h3 id="vk-t">Welcome back 👋</h3><p><b>We found your old account</b> for mobile ••${esc(String(c.mobile || "").slice(-4))}. You don't need a new account: confirm your name and set a password once. Your project code and group are kept.</p>
      <label for="vk-name">Your name <span class="vk-light">(as you entered it the first time)</span></label><input id="vk-name" type="text" maxlength="48" autocomplete="name" placeholder="e.g. Ajay Sharma">
      <label for="vk-email">Email</label><input id="vk-email" type="email" maxlength="254" autocomplete="email" placeholder="you@example.com">
      <label for="vk-pass">New password <span class="vk-light">(at least 6 characters)</span></label>${pwField("vk-pass", "Create a password", "new-password")}
      <label for="vk-code">Project code</label>${codeSelect(projects, c.batch || "")}
      <label for="vk-group">Your group</label><div id="vk-gwrap"></div><div class="vk-light vk-hint" id="vk-ghint"></div>
      <div class="vk-err" id="vk-err" role="alert"></div><button id="vk-go">Save & log in →</button>
      <small><a href="#" id="vk-back">← Back to log in</a></small></div>`;
    groupField(M.ov, projects, c.group || ""); M.$("vk-code").addEventListener(projects.length ? "change" : "input", () => groupField(M.ov, projects, ""));
    M.$("vk-back").addEventListener("click", (e) => { e.preventDefault(); M.close(); authModal(projects, "login", onDone, { login: c.mobile }); });
    setTimeout(() => M.$("vk-name").focus(), 50);
    wire(M, () => {
      const name = M.$("vk-name").value.replace(/\s+/g, " ").trim(), email = M.$("vk-email").value.trim(), pw = M.$("vk-pass").value;
      const codeRaw = M.$("vk-code").value.trim(), p = findProject(projects, codeRaw), g = readGroup(M.ov);
      if (name.length < 2) return errOut(M, "Please type your name.");
      if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) return errOut(M, "Please enter a valid email address.");
      if (pw.length < 6) return errOut(M, "Password must be at least 6 characters.");
      if (projects.length && !p) return errOut(M, "Please select your project code.");
      if (g === null || (!g && groupRequired(p))) return errOut(M, "Please select your group.");
      busy(M, true, "Saving…");
      post({ action: "claim", mobile: c.mobile, name, email, password: pw, batch: p ? p.code : normCode(codeRaw), group: g }).then(j => {
        if (!j || !j.ok) { busy(M, false, "Save & log in →"); return errOut(M, (j && j.error) || "Could not save."); }
        profile.mobile = c.mobile; M.close(); onDone(j.profile, j.token);
      }).catch(() => { busy(M, false, "Save & log in →"); errOut(M, "Could not reach the server."); });
    });
  }
  // after the first meeting a student without a group must pick one (also used when the project code was removed)
  function groupModal(projects, onDone, note) {
    const M = modal(false);
    M.ov.innerHTML = `<div class="vk-modal" role="dialog" aria-modal="true" aria-labelledby="vk-t">
      <h3 id="vk-t">Select your group</h3><p><b>${esc(note || "Your project has started 🎉")}</b> Please choose your project code and group to continue.</p>
      <label for="vk-code">Project code</label>${codeSelect(projects, profile.batch)}
      <label for="vk-group">Your group</label><div id="vk-gwrap"></div><div class="vk-light vk-hint" id="vk-ghint"></div>
      <div class="vk-err" id="vk-err" role="alert"></div><button id="vk-go">Save & continue →</button>
      <small>Logged in as ${esc(profile.name || "")}${profile.email ? " · " + esc(profile.email) : ""} · <a href="#" id="vk-out">Log out</a></small></div>`;
    groupField(M.ov, projects, profile.group); M.$("vk-code").addEventListener(projects.length ? "change" : "input", () => groupField(M.ov, projects, ""));
    M.$("vk-out").addEventListener("click", (e) => { e.preventDefault(); M.close(); logout(projects); });
    wire(M, () => {
      const p = findProject(projects, M.$("vk-code").value), g = readGroup(M.ov);
      if (projects.length && !p) return errOut(M, "Please select your project code.");
      if (g === null || (!g && groupRequired(p))) return errOut(M, "Please select your group.");
      busy(M, true, "Saving…");
      post({ action: "update", token: profile.token, batch: p ? p.code : M.$("vk-code").value, group: g }).then(j => {
        if (j && j.relogin) { M.close(); return authModal(projects, "login", onDone, { note: "Please log in again." }); }
        if (!j || !j.ok) { busy(M, false, "Save & continue →"); return errOut(M, (j && j.error) || "Could not save."); }
        M.close(); onDone(j.profile);
      }).catch(() => { busy(M, false, "Save & continue →"); errOut(M, "Could not reach the server."); });
    });
  }
  function accountModal(projects) {
    const M = modal(true);
    M.ov.innerHTML = `<div class="vk-modal" role="dialog" aria-modal="true" aria-labelledby="vk-t"><button type="button" class="vk-x" id="vk-x" aria-label="Close">✕</button>
      <h3 id="vk-t">Your account</h3><p>${esc(profile.email || "")}${profile.last4 ? ` · 📱 ••${esc(profile.last4)}` : ""}</p>
      <label for="vk-name">Full name <span class="vk-light">(shown on your certificate)</span></label><input id="vk-name" type="text" maxlength="48" value="${esc(profile.name || "")}">
      <label for="vk-code">Project code</label>${codeSelect(projects, profile.batch)}
      <label for="vk-group">Your group</label><div id="vk-gwrap"></div><div class="vk-light vk-hint" id="vk-ghint"></div>
      <div class="vk-err" id="vk-err" role="alert"></div><button id="vk-go">Save changes</button>
      <button type="button" class="vk-sec" id="vk-out">Log out</button></div>`;
    groupField(M.ov, projects, profile.group); M.$("vk-code").addEventListener(projects.length ? "change" : "input", () => groupField(M.ov, projects, ""));
    M.$("vk-x").addEventListener("click", M.close);
    M.$("vk-out").addEventListener("click", () => { M.close(); logout(projects); });
    wire(M, () => {
      const p = findProject(projects, M.$("vk-code").value), g = readGroup(M.ov), name = M.$("vk-name").value.replace(/\s+/g, " ").trim();
      if (name.length < 2) return errOut(M, "Please enter your full name.");
      if (projects.length && !p) return errOut(M, "Please select your project code.");
      if (g === null || (!g && groupRequired(p))) return errOut(M, "Please select your group.");
      busy(M, true, "Saving…");
      post({ action: "update", token: profile.token, name, batch: p ? p.code : M.$("vk-code").value, group: g }).then(j => {
        if (!j || !j.ok) { busy(M, false, "Save changes"); return errOut(M, (j && j.error) || "Could not save."); }
        M.close(); applyProfile(j.profile); renderChip(profile, projects); ping(curView(), true); lastPush = ""; progressSync();
      }).catch(() => { busy(M, false, "Save changes"); errOut(M, "Could not reach the server."); });
    });
  }
  function applyProfile(pr, token) {
    if (!pr) return; Object.assign(profile, { name: pr.name, email: pr.email, uid: pr.uid, last4: pr.last4, group: pr.group || NOG, cert: pr.cert || null, kickoff: pr.kickoff || "", meAt: Date.now() });
    if (token) profile.token = token; setBatch(profile, pr.batch); saveMe(profile); ls.set(KEY + "_was_student", "1");
    try { window.dispatchEvent(new Event("vk-account")); } catch (e) {}
  }
  function logout(projects) {
    const t = profile.token; if (t) post({ action: "logout", token: t }).catch(() => {});
    const vid = profile.vid; Object.keys(profile).forEach(k => delete profile[k]); profile.vid = vid; saveMe(profile);
    const chip = document.getElementById("vk-chip"); if (chip) chip.remove();
    authModal(projects, "login", (pr, tok) => { applyProfile(pr, tok); afterAuth(projects); }, { note: "You are logged out." });
  }
  let begun = false, beginFn = null;
  function afterAuth(projects) {
    const p = findProject(projects, profile.batch);
    if (projects.length && !p) return groupModal(projects, (pr) => { applyProfile(pr); afterAuth(projects); }, "Your project code is no longer active. Please pick your current project code.");
    if (!profile.group && groupRequired(p)) return groupModal(projects, (pr) => { applyProfile(pr); afterAuth(projects); });
    if (beginFn) beginFn();
  }

  /* ---------- greeting chip in the sidebar ---------- */
  function renderChip(m, projects) {
    let c = document.getElementById("vk-chip");
    const host = document.querySelector(".sidebar-progress"); if (!host) return;
    if (!c) { c = document.createElement("div"); c.id = "vk-chip"; c.className = "vk-chip"; host.parentNode.insertBefore(c, host); }
    c.innerHTML = `👋 <b>${esc(m.name)}</b> · ${m.group ? esc(m.group) : `<span class="vk-light">no group yet</span>`}${m.batch ? ` · <b>${esc(m.batch)}</b>` : ""} <button type="button">account</button>`;
    c.querySelector("button").onclick = () => accountModal(projects);
  }

  function setBatch(m, code) {
    m.batch = code || ""; m.codeOk = !!code;
    if (code) ls.set(KEY + "_schedule_view", code);
    saveMe(m);
    setTimeout(() => { try { window.dispatchEvent(new Event("hub-student")); } catch (e) {} }, 0);
  }

  /* ---------- visit pings ---------- */
  let profile = null; const VQ = KEY + "_vq_v2";
  function curView() { const v = document.querySelector("section.view.active"); return v ? v.id.replace(/^view-/, "") : "home"; }
  // page views are counted in the browser; the server gets ONE visit per day per browser (or when the account changes)
  function ping(page, force) {
    if (!profile) return; page = String(page || "home").replace(/[^a-z0-9_-]/gi, "").slice(0, 30) || "home";
    let q; try { q = JSON.parse(ls.get(VQ)) || {}; } catch (e) { q = {}; }
    q.n = (q.n || 0) + 1; q.pages = q.pages || {}; q.pages[page] = (q.pages[page] || 0) + 1;
    const who = [profile.uid || "", profile.name || "", profile.group || "", profile.batch || ""].join("|"), day = todayIST();
    if (q.day === day && q.who === who && !force) { ls.set(VQ, JSON.stringify(q)); return; }
    if (q.day === day && q.who === who && force && q.sentAt && Date.now() - q.sentAt < 6 * 3600e3) { ls.set(VQ, JSON.stringify(q)); return; }
    const n = q.n, pages = q.pages; ls.set(VQ, JSON.stringify({ day, who, n: 0, pages: {}, sentAt: Date.now() }));
    post({ action: "visit", vid: profile.vid, uid: profile.uid || "", last4: profile.last4 || "", name: profile.name || "", group: profile.group || "", batch: profile.batch || "", page, n, pages }).catch(() => {});
  }
  function hookViews() {
    const orig = window.switchView;
    if (typeof orig === "function" && !orig._vk) { const w = function (v) { const r = orig.apply(this, arguments); setTimeout(() => ping(v), 50); return r; }; w._vk = true; window.switchView = w; }
    document.addEventListener("click", (e) => { const b = e.target.closest && e.target.closest("[data-view],[data-goto]"); if (b) setTimeout(() => ping(curView()), 120); });
  }

  /* ---------- cloud progress (site provides window.HUB_PROGRESS) ---------- */
  const normKey = (n, g) => (String(n || "").toLowerCase() + "|" + String(g || "").toLowerCase()).replace(/\s+/g, " ").trim();
  let pushTimer = null, lastPush = "", lastPushAt = 0;
  function progressSync() {
    const H = window.HUB_PROGRESS; if (!H || !profile || !profile.name) return;
    try { if (H.welcome) H.welcome(profile); } catch (e) {}
    const flag = KEY + "_restored_" + normKey(profile.name, profile.group), rday = KEY + "_restday_" + normKey(profile.name, profile.group);
    if (ls.get(rday) === todayIST()) return startPush();          // restore from the cloud once a day per browser
    post({ action: "restore", name: profile.name, group: profile.group || "" }).then(j => { ls.set(rday, todayIST());
      let changed = false; try { changed = !!(j && j.ok && j.data && H.apply(j.data)); } catch (e) {}
      if (changed && !ss(flag)) { try { sessionStorage.setItem(flag, "1"); } catch (e) {} location.reload(); return; }
      startPush();
    }).catch(startPush);
  }
  function pushNow(final) {
    const H = window.HUB_PROGRESS; if (!H || !profile || !profile.name) return;
    let c; try { c = H.collect(); } catch (e) { return; }
    const sig = JSON.stringify(c.data) + "|" + profile.name + "|" + (profile.group || ""); if (sig === lastPush) return;
    if (!final && Date.now() - lastPushAt < 5 * 60000) return;      // at most one save every 5 minutes, plus one when leaving the page
    lastPush = sig; lastPushAt = Date.now();
    fetch(API, { method: "POST", keepalive: true, body: JSON.stringify({ action: "progress", name: profile.name, group: profile.group || "", data: c.data, summary: c.summary }) }).catch(() => { lastPush = ""; });
  }
  function startPush() {
    if (pushTimer) return; pushNow(); pushTimer = setInterval(() => { if (document.visibilityState === "visible") pushNow(); }, 5 * 60000);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") pushNow(true); });
    window.addEventListener("hub-progress", () => setTimeout(() => pushNow(), 300));
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
  /* ---------- trainer: certificates + student accounts ---------- */
  let accs = null, accCheck = [], accState = { q: "", code: "All", grp: "All", st: "All" }, accMsg = "";
  function projComplete(p) {
    const H = window.__SCH || {}; const gs = p.groups || [];
    const allFinal = gs.length > 0 && gs.every(g => ((p.status || {})[g.id] || {}).final === "done");
    let fin = ""; try { fin = H.stageDates ? H.stageDates(p).final : ""; } catch (e) {}
    return { done: allFinal || (!!fin && todayIST() > fin), allFinal, fin };
  }
  function liveProjects() { try { const d = window.__SCH && window.__SCH.data && window.__SCH.data(); if (d && d.projects && d.projects.length) return d.projects; } catch (e) {} return SCHED_PROJECTS || []; }
  function renderAccounts() {
    const box = document.getElementById("vk-acc"); if (!box || !accs) return;
    const projects = liveProjects(); const fmtD = (d) => { try { return new Date(d + "T12:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return d; } };
    const cards = projects.map(p => { const c = projComplete(p); const list = accs.filter(a => normCode(a.batch) === normCode(p.code)); const got = list.filter(a => a.cert).length, mailed = list.filter(a => a.mailed).length; const pend = list.filter(a => !a.cert || (a.email && !a.mailed)).length;
      return `<div class="vk-cc"><b>${esc(p.code)}</b> · ${list.length} enrolled
        <div class="st ${c.done ? "ok" : ""}">${c.done ? "✅ Project complete" : `⏳ In progress${c.fin ? ` · Final presentation ${esc(fmtD(c.fin))}` : ""}`}${got ? ` · 🎓 ${got} issued${mailed ? `, ${mailed} emailed` : ""}` : ""}</div>
        <button type="button" data-cert="${esc(p.code)}" ${c.done && pend ? "" : "disabled"} title="${c.done ? "" : "Unlocks when every group's Final presentation is marked Done, or after the Final presentation date"}">${!c.done ? "🔒 Send certificates (after the Final)" : !list.length ? "No students enrolled yet" : !pend ? `✓ Sent to all ${list.length}` : got ? `🎓 Send to ${pend} new / not emailed` : `🎓 Send certificates to all ${list.length}`}</button></div>`; }).join("");
    const stOf = (a) => a.checkin ? "Check-in only" : a.hasPw ? "Active" : "Old – no password yet";
    const all = accs.map(a => Object.assign({}, a, { status: stOf(a) })).concat(accCheck.map(c => Object.assign({ uid: "", email: "", created: c.first, lastLogin: c.last, logins: 0, checkin: true }, c, { status: "Check-in only" })));
    const codes = ["All", ...new Set(all.map(a => normCode(a.batch) || "—"))], grps = ["All", ...new Set(all.map(a => a.group || "—"))].sort((x, y) => x === "All" ? -1 : y === "All" ? 1 : x.localeCompare(y, undefined, { numeric: true }));
    const rows = all.filter(a => (accState.code === "All" || (normCode(a.batch) || "—") === accState.code) && (accState.grp === "All" || (a.group || "—") === accState.grp) && (accState.st === "All" || a.status === accState.st) && (!accState.q || (a.name + " " + a.email + " " + a.last4).toLowerCase().includes(accState.q.toLowerCase()))).sort((a, b) => (b.lastLogin || b.created || 0) - (a.lastLogin || a.created || 0));
    const nOld = all.filter(a => a.status !== "Active").length;
    box.innerHTML = `<div class="vk-head"><h3>🎓 Certificates & student accounts</h3><span>${all.length} student${all.length === 1 ? "" : "s"} (${accs.length} account${accs.length === 1 ? "" : "s"}${nOld ? `, ${nOld} old / check-in only` : ""}) · only you can see this</span></div>
      ${accMsg ? `<div class="vk-note ${/^⚠/.test(accMsg) ? "err" : ""}">${accMsg}</div>` : ""}
      ${cards ? `<div class="vk-cert">${cards}</div>` : `<p>No project codes yet.</p>`}
      <div class="vk-tools"><input type="text" id="vk-aq" placeholder="Search name, email or last 4 digits…" value="${esc(accState.q)}">
        <select id="vk-ac">${codes.map(c => `<option ${c === accState.code ? "selected" : ""}>${esc(c)}</option>`).join("")}</select><select id="vk-ag" title="Group">${grps.map(c => `<option value="${esc(c)}" ${c === accState.grp ? "selected" : ""}>${c === "All" ? "All groups" : esc(c)}</option>`).join("")}</select>
        <select id="vk-as" title="Status">${["All", "Active", "Old – no password yet", "Check-in only"].map(c => `<option value="${esc(c)}" ${c === accState.st ? "selected" : ""}>${c === "All" ? "All students" : esc(c)}</option>`).join("")}</select>
        <button id="vk-aref">⟳ Refresh</button><button id="vk-acsv">⬇ CSV</button></div>
      <p class="vk-light" style="margin:6px 0 0">Old students log in with their old mobile number and set a password once; they never need a new account. Showing ${rows.length}.</p>
      <div class="vk-wrap"><table class="vk-table"><thead><tr><th>Student</th><th>Email</th><th>Mobile</th><th>Project code</th><th>Group</th><th>Status</th><th>Enrolled</th><th>Last login</th><th>Logins</th><th>Certificate</th><th>Password</th></tr></thead><tbody>
      ${rows.length ? rows.map(a => `<tr><td><b>${esc(a.name)}</b></td><td>${esc(a.email || "—")}</td><td>${a.last4 ? "••" + esc(a.last4) : "—"}</td><td>${esc(a.batch || "—")}</td><td>${a.group ? esc(a.group) : '<span class="vk-no">not assigned</span>'}</td><td>${a.status === "Active" ? "🟢 Active" : a.checkin ? '<span class="vk-no">Check-in only</span>' : '<span class="vk-no">🟡 Old – no password yet</span>'}</td><td>${a.created ? dt(a.created) : "—"}</td><td>${a.lastLogin ? dt(a.lastLogin) : "—"}</td><td>${a.logins || (a.checkin ? "—" : 0)}</td>
        <td>${a.cert ? `🎓 ${esc(a.cert.id)}${a.mailed ? " · ✉️" : ""}` : '<span class="vk-no">—</span>'}</td>
        <td>${a.checkin ? '<span class="vk-no">—</span>' : a.hasPw ? `<button class="vk-mini" data-reset="${esc(a.uid)}" data-n="${esc(a.name)}">Reset</button>` : '<span class="vk-no" title="Checked in before passwords; they set one with Create account">not set</span>'}</td></tr>`).join("")
        : `<tr><td colspan="11" style="color:var(--ink-muted,#888);padding:16px;">No accounts yet. Students appear here after they enroll on the site.</td></tr>`}</tbody></table></div>`;
    const aq = box.querySelector("#vk-aq"); aq.addEventListener("input", (e) => { accState.q = e.target.value; const pos = e.target.selectionStart; renderAccounts(); const n = document.getElementById("vk-aq"); n.focus(); n.setSelectionRange(pos, pos); });
    box.querySelector("#vk-ac").addEventListener("change", (e) => { accState.code = e.target.value; renderAccounts(); });
    box.querySelector("#vk-ag").addEventListener("change", (e) => { accState.grp = e.target.value; renderAccounts(); });
    box.querySelector("#vk-as").addEventListener("change", (e) => { accState.st = e.target.value; renderAccounts(); });
    box.querySelector("#vk-acsv").addEventListener("click", () => {
      const q = (v) => '"' + String(v == null ? "" : v).replace(/"/g, '""') + '"', iso = (t) => t ? new Date(t).toISOString().slice(0, 16).replace("T", " ") : "";
      const csv = [["Student", "Email", "Mobile last 4", "Project code", "Group", "Status", "Enrolled", "Last login", "Logins", "Certificate"].join(",")].concat(rows.map(a => [a.name, a.email, a.last4, a.batch, a.group, a.status, iso(a.created), iso(a.lastLogin), a.logins || 0, a.cert ? a.cert.id : ""].map(q).join(","))).join("\n");
      const l = document.createElement("a"); l.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv" })); l.download = "students-" + todayIST() + ".csv"; document.body.appendChild(l); l.click(); l.remove();
    });
    box.querySelector("#vk-aref").addEventListener("click", () => { accMsg = ""; loadAccounts(); });
    box.querySelectorAll("[data-cert]").forEach(b => b.addEventListener("click", () => {
      const code = b.dataset.cert; const n = accs.filter(a => normCode(a.batch) === normCode(code)).length;
      if (!confirm(`Send the Data Analyst Capstone certificate to all ${n} students enrolled in ${code}?\n\nEach student gets an email with a link, and can download the certificate after logging in.`)) return;
      b.disabled = true; b.textContent = "Sending…";
      post({ action: "certsend", pin: ss(PINK) || "", code, site: siteName() }).then(j => {
        accMsg = j && j.ok ? `✅ ${esc(code)}: ${j.issued} new certificate${j.issued === 1 ? "" : "s"} issued (${j.total} enrolled), ${j.emailed} email${j.emailed === 1 ? "" : "s"} sent${j.noEmail ? `, ${j.noEmail} without email` : ""}.${j.mailError ? ` <br>⚠ Email: ${esc(j.mailError)}` : ""}` : `⚠ ${esc((j && j.error) || "Could not send.")}`;
        loadAccounts();
      }).catch(() => { accMsg = "⚠ Could not reach the server."; renderAccounts(); });
    }));
    box.querySelectorAll("[data-reset]").forEach(b => b.addEventListener("click", () => {
      if (!confirm(`Reset the password of ${b.dataset.n}? You'll get a temporary password to give them.`)) return;
      post({ action: "tresetpw", pin: ss(PINK) || "", uid: b.dataset.reset }).then(j => { accMsg = j && j.ok ? `🔑 Temporary password for <b>${esc(b.dataset.n)}</b>: <code style="font-size:15px">${esc(j.temp)}</code> · they log in with it and can change it with "Forgot password" later.` : `⚠ ${esc((j && j.error) || "Could not reset.")}`; renderAccounts(); });
    }));
  }
  /* ---------- trainer: database status + copy old data (Upstash → Supabase) ---------- */
  let dbInfo = null, dbMsg = "", dbBusy = false;
  function renderDb() {
    const box = document.getElementById("vk-db"); if (!box || !dbInfo) return; const d = dbInfo;
    const st = (ok, err) => ok === true ? "🟢 working" : ok === false ? `🔴 ${esc(err || "not working")}` : "—";
    const canCopy = d.main === "Supabase" && d.mainOk && d.backup;
    box.innerHTML = `<div class="vk-head"><h3>🗄️ Database</h3><span>only you can see this</span></div>
      <p style="margin:6px 0">Main: <b>${esc(d.main || "none")}</b> · ${st(d.mainOk, d.mainErr)}${d.backup ? `<br>Backup (old data): <b>${esc(d.backup)}</b> · ${st(d.backupOk, d.backupErr)}` : ""}</p>
      ${canCopy ? `<p style="margin:6px 0">${d.imported ? `✅ Old data copied on ${esc(new Date(d.imported).toLocaleString("en-IN"))}. You can copy again any time (nothing is overwritten).` : `Old students, accounts, schedule and progress are still in ${esc(d.backup)}. They are brought over automatically when a student logs in, or copy everything now:`}</p>
        <button id="vk-dbcopy" ${dbBusy || !d.backupOk ? "disabled" : ""}>${dbBusy ? "Copying…" : `⇪ Copy old data from ${esc(d.backup)}`}</button>${!d.backupOk ? ` <span class="vk-light">(${esc(d.backup)} must be working: upgrade it or wait for its monthly reset)</span>` : ""}` : ""}
      ${d.main === "Supabase" && d.mainOk === false && /setup yet|supabase-setup/.test(d.mainErr || "") ? `<p class="vk-note err">Run <b>supabase-setup.sql</b> once in Supabase → SQL Editor, then reload.</p>` : ""}
      ${dbMsg ? `<div class="vk-note ${/^⚠/.test(dbMsg) ? "err" : ""}">${dbMsg}</div>` : ""}`;
    const b = box.querySelector("#vk-dbcopy"); if (b) b.addEventListener("click", copyOld);
  }
  async function copyOld() {
    if (dbBusy) return; dbBusy = true; dbMsg = "⏳ Copying… keep this tab open."; renderDb();
    let cursor = "0", n = 0, copied = 0, rounds = 0;
    try {
      do {
        const j = await post({ action: "import", pin: ss(PINK) || "", cursor });
        if (!j || !j.ok) throw new Error((j && j.error) || "Could not copy");
        cursor = j.cursor; n += j.scanned; copied += j.copied; rounds++;
        dbMsg = `⏳ Copying… ${copied} items so far`; renderDb();
      } while (cursor !== "0" && rounds < 400);
      dbMsg = `✅ Done: ${copied} items copied (students, accounts, schedule, progress). Old students can log in normally.`;
      accs = null; loadAccounts();
    } catch (e) { dbMsg = "⚠ " + esc(e.message); }
    dbBusy = false; loadDb();
  }
  function loadDb() {
    const acc = document.getElementById("vk-acc"); if (!acc) return;
    let box = document.getElementById("vk-db"); if (!box) { box = document.createElement("div"); box.id = "vk-db"; box.className = "card vk-acc"; acc.parentNode.insertBefore(box, acc); }
    post({ action: "dbinfo", pin: ss(PINK) || "" }).then(j => { if (j && j.ok) { dbInfo = j; renderDb(); } else box.remove(); }).catch(() => box.remove());
  }
  function loadAccounts() {
    let box = document.getElementById("vk-acc"); const rep = document.getElementById("vk-report"); if (!rep) return;
    if (!box) { box = document.createElement("div"); box.id = "vk-acc"; box.className = "card vk-acc"; rep.parentNode.insertBefore(box, rep.nextSibling); }
    if (!accs) box.innerHTML = `<div class="vk-head"><h3>🎓 Certificates & student accounts</h3><span>Loading…</span></div>`;
    if (!dbInfo && !document.getElementById("vk-db")) loadDb();
    post({ action: "accounts", pin: ss(PINK) || "" }).then(j => { if (!j || !j.ok) { box.innerHTML = `<div class="vk-head"><h3>🎓 Certificates & student accounts</h3><span>${esc((j && j.error) || "Could not load")}</span></div>`; return; } accs = j.accounts || []; accCheck = j.checkins || []; renderAccounts(); })
      .catch(() => { box.innerHTML = `<div class="vk-head"><h3>🎓 Certificates & student accounts</h3><span>Could not reach the server.</span></div>`; });
  }
  function trainerWatch() {
    const isTr = ss(UNLOCK) === "1" && !!ss(PINK);
    const root = document.getElementById("sch-root"); let box = document.getElementById("vk-report");
    if (isTr && root && !box) { box = document.createElement("div"); box.id = "vk-report"; box.className = "card vk-report"; root.parentNode.insertBefore(box, root.nextSibling); report = null; loadReport(); accs = null; accMsg = ""; loadAccounts(); }
    if (!isTr && box) { box.remove(); report = null; const a = document.getElementById("vk-acc"); if (a) a.remove(); accs = null; }
  }

  let SCHED_PROJECTS = [];
  function refreshMe(projects, force) {
    if (!profile || !profile.token) return Promise.resolve("none");
    return post({ action: "me", token: profile.token }).then(j => {
      if (j && j.ok) { applyProfile(j.profile); return "ok"; }
      if (j && j.relogin) { delete profile.token; saveMe(profile); return "relogin"; }
      return "error";
    }).catch(() => "offline");
  }
  /* ---------- start ---------- */
  function start() {
    fetch(API + "?stats=1").then(r => r.ok ? r.json() : null).then(s => {
      if (!s || typeof s.unique !== "number") return;          // live API not connected → stay hidden
      renderCounter(s);
      fetch(API).then(r => r.json()).catch(() => null).then(sched => {
        const projects = allProjects(sched);
        profile = me(); SCHED_PROJECTS = projects;
        const isTrainer = ss(UNLOCK) === "1" || ss(KEY + "_trainer_skip") === "1";
        beginFn = () => { if (begun) { renderChip(profile, projects); return; } begun = true; renderChip(profile, projects); hookViews(); ping(curView(), true); progressSync(); };
        window.VK_AUTH = { profile: () => profile, refresh: () => refreshMe(projects, true), account: () => profile.token ? accountModal(projects) : authModal(projects, "login", (pr, tok) => { applyProfile(pr, tok); afterAuth(projects); }), login: () => authModal(projects, "login", (pr, tok) => { applyProfile(pr, tok); afterAuth(projects); }) };
        if (isTrainer || ss(KEY + "_guest") === "1") return;
        const done = (pr, token) => { applyProfile(pr, token); afterAuth(projects); };
        if (profile.token) {
          // refresh the account from the server at most every 6 hours (saves database requests); always when a group may be needed
          const p = findProject(projects, profile.batch);
          const stale = !profile.meAt || Date.now() - profile.meAt > 6 * 3600e3 || (!profile.group && groupRequired(p));
          if (!stale && profile.name) return afterAuth(projects);
          refreshMe(projects).then(r => { if (r === "relogin") authModal(projects, "login", done, { note: "Please log in again.", login: profile.email || "" }); else afterAuth(projects); });
        } else if (profile.name && profile.uid) authModal(projects, "login", done, { note: "Log in with the mobile number you used before. No new account needed.", login: profile.mobile || "" });
        else if (ls.get(KEY + "_was_student") === "1") authModal(projects, "login", done);
        else authModal(projects, "signup", done);
      });
      setInterval(trainerWatch, 1500); trainerWatch();
    }).catch(() => {});
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
