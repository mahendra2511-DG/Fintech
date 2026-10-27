/* Kick-off Playbook: 15 short, interactive steps that continue the comic's story and teach how a real analytics
   project starts (Understand → Kick-off → Discover → Define → Prepare). The student builds a "Project Pack"
   (problem statement, stakeholder register, MoM, requirements, sources, KPI sheet, scope, risks, acceptance, sign-off).
   Uses story-data.js (KICKOFF_DATA) + story-learn.js (KICKOFF_LEARN) + story-kit.js (characters, voices).
   Progress is kept in this browser (localStorage). People and documents are simulated; KPIs and sources follow the project. */
(function () {
  "use strict";
  const me = document.currentScript, SITE = (me && me.dataset.site) || "";
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const KEY = "ko_learn_" + SITE;
  const load = () => { try { return Object.assign({ done: {}, ans: {}, quiz: {}, text: {}, cur: 0, tab: "story", sign: {} }, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { return { done: {}, ans: {}, quiz: {}, text: {}, cur: 0, tab: "story", sign: {} }; } };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(ST)); } catch (e) {} };
  let ST = load();
  const shuffle = (a, seed) => { const r = a.slice(); let s = seed || 7; for (let i = r.length - 1; i > 0; i--) { s = (s * 9301 + 49297) % 233280; const j = Math.floor(s / 233280 * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };

  const STYLE = `
.kl-tabs{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 16px}
.kl-tabs button{display:flex;align-items:center;gap:8px;border:1px solid var(--line,#DDE2E0);background:var(--paper-raised,#fff);color:var(--ink,#101826);border-radius:12px;padding:10px 14px;font:700 14px/1.2 var(--body,inherit);cursor:pointer}
.kl-tabs button.on{background:var(--teal,#0E86C9);border-color:var(--teal,#0E86C9);color:#fff}
.kl-tabs .pc{font:700 11px/1 var(--body,inherit);padding:4px 7px;border-radius:99px;background:rgba(0,0,0,.08)}
.kl-tabs button.on .pc{background:rgba(255,255,255,.22)}
.kl{max-width:1100px;margin:0 auto;color:var(--ink,#101826)}
.kl-head h2{margin:0;font:800 26px/1.15 var(--display,inherit)}
.kl-head p{margin:6px 0 0;color:var(--ink-muted,#5B6472);font-size:14px;max-width:820px}
.kl-sim{display:inline-flex;gap:6px;align-items:center;font:600 11.5px/1.3 var(--body,inherit);background:var(--amber-tint,#FBF0DD);color:var(--amber,#A15C07);border-radius:8px;padding:5px 9px;margin-top:8px}
.kl-stages{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;margin:16px 0 12px}
.kl-stages div{background:var(--paper,#F6F7F5);border:1px solid var(--line,#DDE2E0);border-radius:12px;padding:9px 10px;position:relative}
.kl-stages div.cur{border-color:var(--teal,#0E86C9);box-shadow:0 0 0 3px var(--teal-tint,#E6F3FA)}
.kl-stages b{display:block;font:800 13px/1.2 var(--display,inherit)}
.kl-stages small{font-size:11.5px;color:var(--ink-muted,#5B6472)}
.kl-stages i{display:block;height:5px;border-radius:99px;background:var(--line,#DDE2E0);margin-top:7px;overflow:hidden}.kl-stages i em{display:block;height:100%;background:var(--teal,#0E86C9)}
.kl-body{display:grid;grid-template-columns:250px minmax(0,1fr);gap:16px;align-items:start}
.kl-list{position:sticky;top:12px;background:var(--paper-raised,#fff);border:1px solid var(--line,#DDE2E0);border-radius:14px;padding:8px;max-height:80vh;overflow:auto}
.kl-list .sg{font:800 10.5px/1 var(--body,inherit);letter-spacing:.1em;text-transform:uppercase;color:var(--ink-muted,#5B6472);margin:10px 8px 6px}
.kl-list button{display:flex;gap:8px;align-items:flex-start;width:100%;text-align:left;border:0;background:transparent;color:inherit;border-radius:9px;padding:7px 8px;font:600 13px/1.3 var(--body,inherit);cursor:pointer}
.kl-list button:hover{background:var(--paper,#F6F7F5)}.kl-list button.on{background:var(--teal-tint,#E6F3FA);color:var(--teal-deep,#0A5A87)}
.kl-list .st{flex:none;width:20px;height:20px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:800;border:1.5px solid var(--line,#C9CFCD)}
.kl-list .ok .st{background:#15803D;border-color:#15803D;color:#fff}
.kl-mob{display:none;margin-bottom:12px}.kl-mob select{width:100%;padding:10px;border-radius:10px;border:1px solid var(--line,#DDE2E0);font:600 14px var(--body,inherit);background:var(--paper-raised,#fff);color:var(--ink,#101826)}
.kl-card{background:var(--paper-raised,#fff);border:1px solid var(--line,#DDE2E0);border-radius:16px;padding:18px;box-shadow:var(--shadow-card,0 6px 20px rgba(16,24,38,.05))}
.kl-mh{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:4px}
.kl-chip{font:700 10.5px/1 var(--body,inherit);letter-spacing:.06em;text-transform:uppercase;padding:5px 8px;border-radius:99px;background:var(--teal-tint,#E6F3FA);color:var(--teal-deep,#0A5A87)}
.kl-day{font:600 12px/1 var(--body,inherit);color:var(--ink-muted,#5B6472)}
.kl-card h3{margin:4px 0 12px;font:800 21px/1.2 var(--display,inherit)}
.kl-beat{position:relative;display:flex;gap:12px;align-items:flex-end;background:linear-gradient(180deg,var(--teal-tint,#E6F3FA),#fff 85%);border:1px solid var(--line,#DDE2E0);border-radius:14px;padding:12px 12px 0;margin-bottom:14px;overflow:hidden;color:#1d2532}
.kl-beat .ch{flex:none;width:86px;text-align:center}.kl-beat .ch svg{width:86px;height:112px;display:block}.kl-beat .ch b{display:block;font:700 10px/1 var(--body,inherit);background:#1d2532;color:#fff;border-radius:99px;padding:3px 7px;margin:-6px auto 6px;width:max-content}
.kl-beat .lines{flex:1;display:flex;flex-direction:column;gap:8px;padding-bottom:12px}
.kl-beat .bb{background:#fff;border:1px solid #dde2e8;border-radius:14px;padding:9px 12px;font:500 14px/1.5 var(--body,inherit);box-shadow:0 3px 10px -5px rgba(16,24,38,.18)}
.kl-beat .bb.r{align-self:flex-end;background:#f5f8fc}
.kl-beat .bb span{display:block;font:800 9.5px/1 var(--body,inherit);letter-spacing:.08em;text-transform:uppercase;color:var(--teal-deep,#0A5A87);margin-bottom:4px}
.kl-beat .lis{position:absolute;right:8px;top:8px;border:1px solid var(--line,#d0d6de);background:#fff;border-radius:99px;padding:6px 11px;font:600 12px/1 var(--body,inherit);cursor:pointer;color:var(--teal-deep,#0A5A87)}
.kl-sec{margin:14px 0}.kl-sec h4{margin:0 0 6px;font:800 14.5px/1.3 var(--display,inherit)}
.kl-sec p{margin:0;font-size:14px;line-height:1.6}
.kl-terms{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.kl-terms span{font-size:12.5px;background:var(--paper,#F6F7F5);border:1px dashed var(--line,#C9CFCD);border-radius:8px;padding:4px 8px}.kl-terms b{color:var(--teal-deep,#0A5A87)}
.kl-ex{border:1px solid var(--line,#DDE2E0);border-radius:12px;overflow:hidden}.kl-ex summary{cursor:pointer;padding:10px 12px;font:700 13.5px/1.3 var(--body,inherit);background:var(--paper,#F6F7F5);list-style:none}.kl-ex summary::-webkit-details-marker{display:none}.kl-ex summary:before{content:"▸ ";color:var(--teal,#0E86C9)}.kl-ex[open] summary:before{content:"▾ "}
.kl-ex .in{padding:12px;font-size:13.5px;line-height:1.55;overflow:auto}
.kl-tbl{width:100%;border-collapse:collapse;font-size:12.8px}.kl-tbl th,.kl-tbl td{border-bottom:1px solid var(--line,#E2E8F0);padding:7px 6px;text-align:left;vertical-align:top}.kl-tbl th{font:700 10.5px/1.2 var(--body,inherit);text-transform:uppercase;letter-spacing:.05em;color:var(--ink-muted,#5B6472);background:var(--paper,#F6F7F5)}
.kl-doc{background:#fffdf8;border:1px solid #e5dccb;border-radius:8px;padding:12px 14px;color:#222;font-size:13.5px;line-height:1.55}
body.dark-mode .kl-doc{background:#fbf7ee}
.kl-task{background:var(--teal-tint,#E6F3FA);border-radius:14px;padding:14px;margin-top:14px}
.kl-task h4{margin:0 0 4px;font:800 14.5px/1.3 var(--display,inherit)}.kl-task .pr{font-size:13.5px;margin:0 0 10px}
.kl-opt{display:flex;gap:10px;align-items:flex-start;background:var(--paper-raised,#fff);border:1.5px solid var(--line,#DDE2E0);border-radius:10px;padding:9px 11px;margin:6px 0;font-size:13.5px;line-height:1.45;cursor:pointer}
.kl-opt input{margin-top:3px}.kl-opt.good{border-color:#15803D;background:#F0FDF4}.kl-opt.bad{border-color:#B91C1C;background:#FEF2F2}
.kl-row{display:grid;grid-template-columns:minmax(0,1fr) 210px;gap:10px;align-items:center;background:var(--paper-raised,#fff);border:1.5px solid var(--line,#DDE2E0);border-radius:10px;padding:8px 10px;margin:6px 0;font-size:13.3px;line-height:1.4}
.kl-row select{width:100%;padding:7px;border-radius:8px;border:1px solid var(--line,#C9CFCD);font:600 12.8px var(--body,inherit);background:#fff;color:#101826}
.kl-row.good{border-color:#15803D;background:#F0FDF4}.kl-row.bad{border-color:#B91C1C;background:#FEF2F2}.kl-row .fx{grid-column:1/-1;font-size:12px;color:#B91C1C}
.kl-btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.kl-btn{border:0;border-radius:10px;padding:9px 14px;font:700 13.5px/1 var(--body,inherit);cursor:pointer;background:var(--teal,#0E86C9);color:#fff}
.kl-btn.gh{background:var(--paper-raised,#fff);color:var(--ink,#101826);border:1px solid var(--line,#C9CFCD)}
.kl-btn:disabled{opacity:.45;cursor:default}
.kl-fb{margin-top:10px;font-size:13.3px;line-height:1.5;border-radius:10px;padding:9px 11px}.kl-fb.ok{background:#F0FDF4;color:#14532D}.kl-fb.no{background:#FEF2F2;color:#7F1D1D}.kl-fb.hint{background:#FFFBEB;color:#713F12}
.kl-ta{width:100%;min-height:86px;border-radius:10px;border:1px solid var(--line,#C9CFCD);padding:10px;font:500 13.5px/1.5 var(--body,inherit);background:#fff;color:#101826;box-sizing:border-box}
.kl-nav{display:flex;justify-content:space-between;gap:8px;margin-top:16px;flex-wrap:wrap}
.kl-done{display:inline-flex;align-items:center;gap:6px;font:700 12.5px/1 var(--body,inherit);color:#15803D}
.kl-sign label{display:flex;gap:8px;align-items:center;font-size:13.5px;margin:5px 0}
.kl-final{text-align:center;padding:10px 0}.kl-final .big{font-size:44px}
@media (max-width:900px){.kl-body{grid-template-columns:1fr}.kl-list{display:none}.kl-mob{display:block}.kl-stages{grid-template-columns:repeat(5,minmax(0,1fr))}.kl-stages small{display:none}}
@media (max-width:560px){.kl-row{grid-template-columns:1fr}.kl-card{padding:14px}.kl-stages b{font-size:11px}.kl-beat{padding:8px 8px 0;gap:8px}.kl-beat .ch{width:54px}.kl-beat .ch svg{width:54px;height:70px}.kl-beat .lines+.ch{display:none}.kl-beat .bb{font-size:13px}}
`;

  /* ======================= modules (built from the project's own story + content) ======================= */
  function build(D, L, P) {
    const co = D.company, sp = D.sponsor, ow = D.owner, us = D.user, you = P.you.short;
    const kp = D.kpis, src = D.arch.sources;
    const tbl = (head, rows) => `<table class="kl-tbl"><thead><tr>${head.map(h => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
    const ul = (a) => `<ul style="margin:6px 0 0;padding-left:18px">${a.map(x => `<li>${esc(x)}</li>`).join("")}</ul>`;
    const ppl = [["sp", sp], ["us", us], ["ow", ow]].map(([k, p]) => ({ k, name: p.name, role: p.role, side: "Client", needs: p.cares, inf: k === "sp" ? "High" : "Medium", int: "High" }))
      .concat([["lead", P.lead], ["pm", P.pm], ["ba", P.ba], ["de", P.de], ["qa", P.qa], ["you", P.you]].map(([k, p]) => ({ k, name: p.name, role: p.role, side: "BI team", needs: p.cares, inf: k === "lead" ? "High" : "Medium", int: "High" })));
    const STG = ["Kick-off", "Excel", "Tableau", "Power BI", "Final"];
    const M = [];
    // 1 ─ Understand
    M.push({ id: "bg", stage: 0, day: "Monday 8:45 AM · before the kick-off", title: "The business and why this project exists",
      beat: [["lead", "smile", "present", `Before we walk in, read ${co}'s background. Who are they, how do they make money, and why are they calling us now?`], ["you", "think", "chin", "So I should understand the business before I even look at the data?", "r"]],
      simple: `A project never starts with data. It starts with a <b>business</b> that has a problem. Knowing what the company does, who its customers are and which systems it uses helps you ask better questions and avoid building the wrong thing.`,
      terms: [["Domain", "the business area, e.g. HR, sales, hospitality"], ["Stakeholder", "anyone affected by, or deciding about, the project"]],
      sample: { t: `Company profile: ${co} (simulated)`, h: `<div class="kl-doc"><p>${esc(L.background)}</p><p style="margin-top:8px"><b>Systems that hold the data:</b></p>${ul(src.map(s => s[0] + " (" + s[1] + ")"))}<p style="margin-top:8px"><b>Why now:</b> ${esc(D.incident)}</p></div>` },
      tasks: [{ type: "mcq", prompt: `From the background, what does ${co} really need?`, options: shuffle([D.realProblem.charAt(0).toUpperCase() + D.realProblem.slice(1), "A brand-new website design", "More data collected from customers", "A dashboard with as many charts as possible"], 3), answerText: D.realProblem.charAt(0).toUpperCase() + D.realProblem.slice(1), hint: "Look at the 'Why now' line: what is going wrong for them today?", why: "The project exists to fix a business pain. More charts or more data don't help if the core problem isn't solved." }],
      check: ["Why read the business background before a kick-off?", ["To look busy", "To ask better questions and understand what matters to the client", "Because SQL needs it"], 1, "Context helps you ask the right questions and spot what really matters."],
      pack: () => `<h2>1. Business background</h2><p>${esc(L.background)}</p>` });
    M.push({ id: "ps", stage: 0, day: "Monday 9:10 AM · BI office", title: "Write the business problem statement",
      beat: [["ba", "smile", "note", "A good problem statement says WHO has the problem, WHAT it is, WHY it happens and what it COSTS. No solution inside it!"], ["you", "wow", "idle", "So 'build a dashboard' is not a problem statement?", "r"]],
      simple: `A <b>problem statement</b> is 2–3 sentences everyone agrees on before work starts. It describes the pain, not the solution. If you write "we need a dashboard", you have already chosen a solution without knowing the problem.`,
      terms: [["Problem statement", "who + what is wrong + why + impact"], ["Solution-first", "jumping to a tool or chart before understanding the problem"]],
      sample: { t: "Pain points heard so far (simulated)", h: `<div class="kl-doc">${ul(D.pains.map(p => p[0] + ": " + p[1]))}</div>` },
      tasks: [{ type: "mcq", prompt: "Which is the best problem statement?", options: shuffle([`We need a dashboard for ${D.project}.`, "Build a Power BI report with 12 charts and a dark theme.", L.problem, "Our data is bad."], 5), answerText: L.problem, hint: "Find the one that says who has the problem, why it happens, and what it costs, without naming a tool.", why: "It names who is affected, what is wrong, why, and the impact. The others are vague or jump to a solution." },
        { type: "write", prompt: "Now write it in your own words (2–3 sentences). It goes into your Project Pack.", model: L.problem, key: "ps" }],
      check: ["Which of these is a SOLUTION, not a problem?", ["Managers learn about attrition too late", "Build a Tableau dashboard with filters", "Teams calculate KPIs differently"], 1, "A tool or deliverable is a solution. Problems describe pain."],
      pack: (S) => `<h2>2. Problem statement</h2><p>${esc((S.text.ps || "").trim() || L.problem)}</p>` });
    M.push({ id: "ob", stage: 0, day: "Monday 9:25 AM · BI office", title: "Business objectives and expected outcomes",
      beat: [["pm", "smile", "marker", "Objectives must be SMART: Specific, Measurable, Achievable, Relevant and Time-bound. 'Better reporting' is not one."], ["you", "think", "chin", "So every objective needs a number or a date?", "r"]],
      simple: `An <b>objective</b> says what will be different when the project succeeds. Make it <b>SMART</b> so everyone can check later whether it was met.`,
      terms: [["SMART", "Specific, Measurable, Achievable, Relevant, Time-bound"], ["Outcome", "the business result, e.g. faster decisions"]],
      sample: { t: "Draft objectives (simulated)", h: `<div class="kl-doc">${ul(L.objectives)}</div>` },
      tasks: [{ type: "classify", prompt: "Which objectives are measurable (SMART) and which are vague?", cats: ["Measurable (SMART)", "Vague"], items: shuffle(L.objectives.map(t => [t, 0]).concat([["Make reporting better for everyone", 1], ["Give management more insights", 1]]), 11), hint: "A SMART objective has a clear measure, an owner or a deadline. Vague ones can't be checked.", why: "The SMART ones say what, how much and by when. 'Better' and 'more insights' can never be proven done." }],
      check: ["Which objective is SMART?", ["Improve the dashboard", "Publish one agreed KPI definition sheet, signed by the sponsor, by the end of week 1", "Use more colours"], 1, "It's specific, measurable, owned and time-bound."],
      pack: () => `<h2>3. Objectives</h2>${ul(L.objectives)}` });
    // 2 ─ Kick-off
    M.push({ id: "sh", stage: 1, day: "Monday 10:00 AM · kick-off meeting", title: "Stakeholders: roles, needs and conflicts",
      beat: [["sp", "worry", "cross", D.painIntro.replace(/<[^>]+>/g, "").split(/(?<=[.!?])\s/)[0]], ["us", "angry", "point", `And for ${D.conflict.kpi} we always ${D.conflict.a}.`, "r"]],
      simple: `A <b>stakeholder register</b> lists everyone involved: their role, what they need and how much they influence decisions. Stakeholders often <b>want different things</b> (here: two definitions of ${esc(D.conflict.kpi)}). Spotting this early prevents fights later.`,
      terms: [["Sponsor", "the senior person who funds the project and signs off"], ["Data owner", "the person responsible for a data source and access to it"], ["End user", "the person who will use the dashboard every day"]],
      sample: { t: "Stakeholder register (simulated)", h: tbl(["Name", "Side", "Role", "Needs", "Influence"], ppl.map(p => [esc(p.name), esc(p.side), esc(p.role), esc(p.needs), esc(p.inf)])) + `<p style="margin-top:8px"><b>Conflict to manage:</b> ${esc(D.user.name)} wants "${esc(D.conflict.a)}"; ${esc(sp.name)} says "${esc(D.conflict.b)}".</p>` },
      tasks: [{ type: "classify", prompt: "Who needs what? Match each need to the right person.", cats: [sp.name + " (sponsor)", us.name + " (end user)", ow.name + " (data owner)", "Neha (data engineer)"], items: shuffle([[sp.cares, 0], [us.cares, 1], [ow.cares, 2], ["Pipelines, data quality and refresh on time", 3]], 4), hint: "The sponsor decides and signs off; the end user uses the dashboard daily; the data owner looks after the source system.", why: "Knowing each person's need tells you whom to ask, whom to show demos to, and who approves." }],
      check: ["Who signs off the project scope?", [ow.name + " (data owner)", sp.name + " (sponsor)", "Neha (data engineer)"], 1, "The sponsor approves scope and milestones."],
      pack: () => `<h2>4. Stakeholder register</h2>${tbl(["Name", "Side", "Role", "Needs", "Influence"], ppl.map(p => [esc(p.name), esc(p.side), esc(p.role), esc(p.needs), esc(p.inf)]))}` });
    const goodQ = D.qa.map(q => q[0]).concat(["Who will sign off the KPI definitions and by when?"]);
    const badQ = ["Which chart colours do you like best?", "Can we start building the dashboard today?", "Can you just send all the data you have?"];
    M.push({ id: "km", stage: 1, day: "Monday 10:15 AM · kick-off meeting", title: "Kick-off meeting: agenda, questions and minutes",
      beat: [["you", "smile", "point", D.qa[0][0]], [D.qa[0][3] === "ow" ? "ow" : "sp", "think", "idle", D.qa[0][1], "r"]],
      simple: `The kick-off follows an <b>agenda</b>, the BI team asks <b>discovery questions</b>, and someone writes the <b>minutes of meeting (MoM)</b>: decisions, action items, owners and dates. Today that someone is you.`,
      terms: [["Agenda", "the list of topics for the meeting"], ["MoM", "minutes of meeting: decisions + action items + owner + due date"]],
      sample: { t: "Minutes of meeting (simulated)", h: `<div class="kl-doc"><b>Kick-off: ${esc(D.project)}</b> · ${esc(D.when)}<br><b>Goal:</b> ${esc(D.goal)}<br><br>${tbl(["Action item", "Owner", "Due"], D.actions.map(a => [esc(a[0]), esc(a[1] === "YOU" ? you : a[1]), esc(a[2])]))}</div>` },
      tasks: [{ type: "multi", prompt: "Which questions should you ask in a kick-off? Tick all good ones.", options: shuffle(goodQ.map(q => [q, true]).concat(badQ.map(q => [q, false])), 9), hint: "Good kick-off questions clarify the decision, the definitions, the data and who approves. Bad ones jump to design or building.", why: "Good questions remove ambiguity. Colours, starting to build and 'send everything' come later or waste time." }],
      check: ["What MUST minutes of meeting contain?", ["Everyone's opinions", "Decisions, action items, owners and due dates", "Only the date"], 1, "MoM turns talk into commitments: who does what by when."],
      pack: () => `<h2>5. Minutes of meeting</h2><p><b>${esc(D.when)}</b> · Goal: ${esc(D.goal)}</p>${tbl(["Action item", "Owner", "Due"], D.actions.map(a => [esc(a[0]), esc(a[1] === "YOU" ? you : a[1]), esc(a[2])]))}` });
    // 3 ─ Discover
    M.push({ id: "dc", stage: 2, day: "Tuesday · discovery", title: "Discovery: current process, pain points and unknowns",
      beat: [["us", "worry", "cross", D.userPain.replace(/<[^>]+>/g, "")], ["ba", "smile", "note", "Let's write down what is FACT, what is PAIN, and what we still DON'T KNOW.", "r"]],
      simple: `In <b>discovery</b> you learn how work happens today (the "as-is" process), where it hurts, and what is still unknown. Unknowns become questions to investigate, not guesses.`,
      terms: [["As-is process", "how things are done today"], ["Unknown / open question", "something you must confirm before relying on it"]],
      sample: { t: "As-is process notes (simulated)", h: `<div class="kl-doc"><b>Today:</b> ${esc(D.userPain.replace(/<[^>]+>/g, ""))}<br><br><b>Pain points:</b>${ul(D.pains.map(p => p[0]))}<b>Still unknown:</b>${ul(L.openq)}</div>` },
      tasks: [{ type: "classify", prompt: "Sort each statement: fact, pain point, or unknown we must ask about?", cats: ["Fact", "Pain point", "Unknown (ask!)"], items: shuffle(src.map(s => [`Data comes from ${s[0]} (${s[1]})`, 0]).concat(D.pains.map(p => [p[0], 1]), L.openq.map(q => [q, 2])), 13), hint: "Facts are already confirmed. Pain points hurt the business. Questions with '?' that nobody can answer yet are unknowns.", why: "Separating facts from unknowns stops you from building on guesses." }],
      check: ["You don't know whether interns count in headcount. What do you do?", ["Assume they do", "Write it as an open question and ask the data owner", "Leave them out silently"], 1, "Unknowns are logged and confirmed with the right person."],
      pack: () => `<h2>6. Discovery notes</h2><p><b>As-is:</b> ${esc(D.userPain.replace(/<[^>]+>/g, ""))}</p><b>Pain points</b>${ul(D.pains.map(p => p[0] + ": " + p[1]))}` });
    M.push({ id: "rq", stage: 2, day: "Tuesday · requirements workshop", title: "Requirements: functional and non-functional",
      beat: [["ba", "smile", "present", "Functional = WHAT the dashboard must do. Non-functional = HOW WELL: speed, refresh, security."], ["sp", "think", "chin", L.vague.req.replace(/"/g, ""), "r"]],
      simple: `A <b>requirements log</b> lists what must be built. <b>Functional</b> requirements describe features (a KPI card, a filter, a drill-down). <b>Non-functional</b> ones describe quality (refresh time, speed, privacy). Vague requests must be clarified with a question.`,
      terms: [["Functional requirement", "what the solution does"], ["Non-functional requirement", "how well it does it: speed, security, refresh"]],
      sample: { t: "Requirements log (simulated)", h: tbl(["ID", "Requirement", "Type", "Priority"], L.fr.map((r, i) => ["FR" + (i + 1), esc(r), "Functional", i < 2 ? "Must" : "Should"]).concat(L.nfr.map((r, i) => ["NFR" + (i + 1), esc(r), "Non-functional", "Must"]))) },
      tasks: [{ type: "classify", prompt: "Functional or non-functional?", cats: ["Functional", "Non-functional"], items: shuffle(L.fr.map(t => [t, 0]).concat(L.nfr.map(t => [t, 1])), 17), hint: "If it's a feature you can click or see, it's functional. If it's about speed, refresh, privacy or access, it's non-functional.", why: "Both matter: a perfect chart that loads in 2 minutes or leaks salaries fails the project." },
        { type: "mcq", prompt: `${sp.name} says: ${L.vague.req} What is the best clarifying question?`, options: L.vague.options, answer: L.vague.best, hint: "Pick the question that turns the vague words into something measurable.", why: L.vague.why }],
      check: ["'The dashboard must load in under 5 seconds' is…", ["Functional", "Non-functional", "Not a requirement"], 1, "It describes performance (how well), so it's non-functional."],
      pack: () => `<h2>7. Requirements log</h2>${tbl(["ID", "Requirement", "Type"], L.fr.map((r, i) => ["FR" + (i + 1), esc(r), "Functional"]).concat(L.nfr.map((r, i) => ["NFR" + (i + 1), esc(r), "Non-functional"])))}<p><b>Clarified:</b> ${esc(L.vague.req)} → ${esc(L.vague.options[L.vague.best])}</p>` });
    M.push({ id: "bq", stage: 2, day: "Wednesday · discovery", title: "Business questions vs analytical questions",
      beat: [["sp", "smile", "idle", L.bq[0][0]], ["you", "smile", "note", "Let me turn that into something I can calculate: " + L.bq[0][1] + ".", "r"]],
      simple: `Stakeholders ask <b>business questions</b> in everyday words. Your job is to turn each one into an <b>analytical question</b>: a precise measure, broken down by the right dimensions, over a defined period. That is what SQL and dashboards can answer.`,
      terms: [["Measure", "a number you calculate, e.g. Attrition %"], ["Dimension", "how you slice it, e.g. department, month"]],
      sample: { t: "From business to analytical questions (simulated)", h: tbl(["Business question", "Analytical question"], L.bq.map(q => [esc(q[0]), esc(q[1])])) },
      tasks: [{ type: "classify", prompt: "Match each analytical question to the business question it answers.", cats: L.bq.map(q => q[0]), items: shuffle(L.bq.map((q, i) => [q[1], i]), 21), hint: "Look for the same idea: budget ↔ ROI, people leaving ↔ attrition, speed ↔ time.", why: "Every chart should trace back to a business question. If it doesn't, it probably doesn't belong." }],
      check: ["Which is an ANALYTICAL question?", ["Are we doing well?", `${kp[0][0]} by month for the last 12 months`, "Is the team happy?"], 1, "It names a measure, a dimension and a period."],
      pack: () => `<h2>8. Business → analytical questions</h2>${tbl(["Business question", "Analytical question"], L.bq.map(q => [esc(q[0]), esc(q[1])]))}` });
    M.push({ id: "ds", stage: 2, day: "Wednesday · data reality check", title: "Data source discovery and inventory",
      beat: [["ow", "think", "laptop", D.dataIntro], ["de", "worry", "laptop", D.issues[0][0] + ": " + D.issues[0][1], "r"]],
      simple: `A <b>data source inventory</b> lists every source: what it holds, who owns it, how often it refreshes, its grain and known issues. You can't promise a KPI until you know the data behind it exists and is usable.`,
      terms: [["Grain", "what one row means, e.g. one order, one employee per month"], ["Refresh", "how often new data arrives"]],
      sample: { t: "Data source inventory (simulated)", h: tbl(["Source", "What it holds", "Owner", "Refresh", "Known issue"], src.map((s, i) => [esc(s[0]), esc(s[1]), esc(ow.name), esc(D.arch.ingest[1]), esc(D.issues[i] ? D.issues[i][0] : "—")])) },
      tasks: [{ type: "classify", prompt: "Which source would answer each question?", cats: src.map(s => s[0]), items: shuffle(L.srcq.map(q => [q[0], q[1]]), 23), hint: "Read what each source holds in the inventory above.", why: "Knowing the right source saves days of searching and prevents joining the wrong tables." }],
      check: ["What does 'grain' mean?", ["The colour of a chart", "What one row in a table represents", "The size of the file"], 1, "Grain = what a single row means. Mixing grains causes double counting."],
      pack: () => `<h2>9. Data source inventory</h2>${tbl(["Source", "What it holds", "Owner", "Refresh", "Known issue"], src.map((s, i) => [esc(s[0]), esc(s[1]), esc(ow.name), esc(D.arch.ingest[1]), esc(D.issues[i] ? D.issues[i][0] + " — " + D.issues[i][1] : "—")]))}` });
    // 4 ─ Define
    const kpiRows = kp.map((k, i) => [esc(k[0]), `<code>${esc(k[1])}</code>`, esc(k[2]), esc((L.kmeta[i] || [])[0] || "—"), esc((L.kmeta[i] || [])[1] || "—"), esc((L.kmeta[i] || [])[2] || "—")]);
    M.push({ id: "kp", stage: 3, day: "Wednesday 4 PM · KPI workshop", title: "KPI definitions: formula, grain, filters and owner",
      beat: [["us", "angry", "point", `For ${D.conflict.kpi}, we always ${D.conflict.a}.`], ["sp", "angry", "cross", D.conflict.b + ".", "r"]],
      simple: `A <b>KPI definition sheet</b> fixes, in writing: the exact formula, the grain, the allowed filters and the <b>business owner</b> who approves it. When two people define a KPI differently, write both, name them clearly and let the owner choose the official one. <b>Decision here:</b> ${esc(D.conflict.fix)}`,
      terms: [["KPI", "key performance indicator: a number that tracks a business goal"], ["Business owner", "the person who decides the official definition"]],
      sample: { t: "KPI definition sheet (simulated, KPI names from this project)", h: tbl(["KPI", "Formula", "Meaning", "Grain", "Filters", "Owner"], kpiRows) },
      tasks: [{ type: "mcq", prompt: `Which is the correct definition of "${kp[0][0]}"?`, options: shuffle([kp[0][1], "Count of all rows in the main table", `Sum of ${kp[0][0]} across every row and month`, "Whatever each team prefers"], 29), answerText: kp[0][1], hint: "Look at the KPI sheet: the formula agreed with the business owner.", why: "Only the agreed formula is official. Summing ratios or letting each team choose creates different numbers in every report." }],
      check: ["Two managers want different definitions of the same KPI. Best move?", ["Use your favourite", "Write both, name them clearly, and get the owner to approve the official one", "Show both without labels"], 1, "Name, document, and let the owner decide."],
      pack: () => `<h2>10. KPI definition sheet</h2>${tbl(["KPI", "Formula", "Meaning", "Grain", "Filters", "Owner"], kpiRows)}<p><b>Decision:</b> ${esc(D.conflict.fix)}</p>` });
    M.push({ id: "sc", stage: 3, day: "Thursday · scope", title: "Project scope: in and out",
      beat: [["sp", "smile", "present", "Can we also add predictions for next year? And maybe a mobile app?"], ["pm", "smile", "marker", "Good ideas! Let's park them as OUT of scope for now, so we deliver what matters on time.", "r"]],
      simple: `The <b>scope statement</b> lists what the project will and will not do. Writing "out of scope" items is just as important: it protects the timeline from <b>scope creep</b> (new requests sneaking in).`,
      terms: [["Scope creep", "extra work added without changing time or resources"], ["Out of scope", "agreed NOT to do in this project"]],
      sample: { t: "Scope statement (simulated)", h: `<div class="kl-doc"><b>In scope</b>${ul(L.inScope)}<b>Out of scope</b>${ul(L.outScope)}</div>` },
      tasks: [{ type: "classify", prompt: "In scope or out of scope?", cats: ["In scope", "Out of scope"], items: shuffle(L.inScope.map(t => [t, 0]).concat(L.outScope.map(t => [t, 1])), 31), hint: "In scope answers the business problem with the data we have. Forecasting, new systems and process changes are usually out.", why: "Saying 'not now' clearly is what lets the team deliver on time." }],
      check: ["Midway, someone asks for a new mobile app. What do you do?", ["Build it quietly", "Log it as a change request and let the sponsor decide (time/scope trade-off)", "Ignore it"], 1, "New work goes through a change request so time and scope stay honest."],
      pack: () => `<h2>11. Scope statement</h2><b>In scope</b>${ul(L.inScope)}<b>Out of scope</b>${ul(L.outScope)}` });
    const rcats = ["Assumption", "Constraint", "Risk", "Dependency", "Open question"];
    M.push({ id: "rk", stage: 3, day: "Thursday · risk review", title: "Assumptions, constraints, risks, dependencies, open questions",
      beat: [["de", "worry", "laptop", D.issues[1] ? D.issues[1][0] + ": " + D.issues[1][1] : "Some data has issues."], ["pm", "smile", "note", "Let's log it: is it a risk, a constraint, or something we're assuming?", "r"]],
      simple: `<b>Assumption</b>: believed true, not yet proven. <b>Constraint</b>: a fixed limit you must work within. <b>Risk</b>: something that might go wrong (with a plan). <b>Dependency</b>: you need someone or something first. <b>Open question</b>: must be answered before building.`,
      terms: [["Mitigation", "the action that reduces a risk"], ["RAID log", "Risks, Assumptions, Issues, Dependencies"]],
      sample: { t: "Risk & dependency log (simulated)", h: tbl(["Type", "Item", "Owner / action"], L.assume.map(x => ["Assumption", esc(x), "Confirm with " + esc(ow.name)]).concat(L.constraint.map(x => ["Constraint", esc(x), "Design around it"]), D.risks.map(r => ["Risk", esc(r[0]), esc(r[1])]), L.depend.map(x => ["Dependency", esc(x), "Riya tracks"]), L.openq.map(x => ["Open question", esc(x), "Arjun asks"]))) },
      tasks: [{ type: "classify", prompt: "Classify each item.", cats: rcats, items: shuffle(L.assume.slice(0, 2).map(t => [t, 0]).concat(L.constraint.slice(0, 2).map(t => [t, 1]), D.risks.slice(0, 2).map(r => [r[0], 2]), L.depend.slice(0, 2).map(t => [t, 3]), L.openq.slice(0, 2).map(t => [t, 4])), 37), hint: "Questions are open questions. 'X shares/approves…' are dependencies. Fixed limits are constraints. Things we believe are assumptions. Things that may go wrong are risks.", why: "Each type is handled differently: confirm assumptions, design around constraints, mitigate risks, chase dependencies, answer open questions." }],
      check: ["'We are waiting for the data owner to grant access' is a…", ["Risk", "Dependency", "Constraint"], 1, "You can't start until someone else acts: that's a dependency."],
      pack: () => `<h2>12. Risk & dependency log</h2>${tbl(["Type", "Item", "Owner / action"], L.assume.map(x => ["Assumption", esc(x), "Confirm with " + esc(ow.name)]).concat(L.constraint.map(x => ["Constraint", esc(x), "Design around it"]), D.risks.map(r => ["Risk", esc(r[0]), esc(r[1])]), L.depend.map(x => ["Dependency", esc(x), "Riya tracks"]), L.openq.map(x => ["Open question", esc(x), "Arjun asks"])))}` });
    // 5 ─ Prepare for execution
    const vagueAcc = ["The dashboard looks modern", "The client is happy with it", "Numbers seem about right"];
    M.push({ id: "ac", stage: 4, day: "Friday · acceptance criteria", title: "Deliverables and measurable acceptance criteria",
      beat: [["qa", "smile", "note", "If a number doesn't match SQL, it doesn't ship. I need criteria I can TEST."], ["sp", "think", "chin", "So how will I know the dashboard is 'done'?", "r"]],
      simple: `<b>Deliverables</b> are what you hand over (Excel analysis, Tableau dashboard, Power BI report, final story). <b>Acceptance criteria</b> are testable conditions that prove each deliverable is done. "Looks good" can't be tested; "matches SQL" can.`,
      terms: [["Deliverable", "a finished thing you hand over"], ["Acceptance criteria", "pass/fail checks agreed with the sponsor"]],
      sample: { t: "Deliverables & acceptance (simulated)", h: tbl(["Milestone", "Deliverable"], STG.map((s, i) => [s, esc(D.plan[i])])) + `<p style="margin-top:8px"><b>Acceptance criteria</b></p>${ul(L.accept)}` },
      tasks: [{ type: "classify", prompt: "Testable or vague?", cats: ["Testable", "Vague (can't test)"], items: shuffle(L.accept.map(t => [t, 0]).concat(vagueAcc.map(t => [t, 1])), 41), hint: "Could Kabir (QA) check it with a clear yes/no? Then it's testable.", why: "Testable criteria end arguments: either it matches or it doesn't." }],
      check: ["Which acceptance criterion is testable?", ["Dashboard is user-friendly", `${kp[0][0]} on the dashboard equals the SQL result for the same period`, "Charts look nice"], 1, "It has a clear pass/fail check."],
      pack: () => `<h2>13. Deliverables & acceptance criteria</h2>${tbl(["Milestone", "Deliverable"], STG.map((s, i) => [s, esc(D.plan[i])]))}<b>Acceptance criteria</b>${ul(L.accept)}` });
    const comms = [["Weekly demo", sp.name + ", " + us.name, "Every week (your group presentation)", "Mahendra"], ["Daily stand-up (10 min)", "BI team", "Every working day", "Riya"], ["Status email: done / next / risks", sp.name, "Every Friday", "Riya"], ["Data questions", ow.name, "Within 1 day", "Arjun"]];
    M.push({ id: "tl", stage: 4, day: "Friday · planning", title: "Roles, timeline, milestones and communication plan",
      beat: [["pm", "smile", "marker", `We demo every week, so ${sp.name.split(" ")[0]} can steer early. Problems go into the stand-up the same day.`], ["you", "smile", "idle", "So I never hide a delay — I raise it early.", "r"]],
      simple: `The <b>timeline</b> shows milestones and owners. The <b>communication plan</b> says who gets which update, how often and from whom. Most projects fail from surprises, not from bad SQL.`,
      terms: [["Milestone", "a checkpoint with a deliverable"], ["Stand-up", "a short daily team check-in"]],
      sample: { t: "Timeline & communication plan (simulated)", h: tbl(["Milestone", "When", "Deliverable"], STG.map((s, i) => [s, "Week " + i, esc(D.plan[i])])) + `<p style="margin-top:8px"><b>Communication plan</b></p>` + tbl(["What", "Who", "How often", "Owner"], comms.map(c => c.map(esc))) },
      tasks: [{ type: "mcq", prompt: "Data access is delayed by 3 days. What do you do?", options: ["Wait quietly and hope", "Tell Riya (PM) in today's stand-up and add it to the risk log, so the plan can be updated", "Message the sponsor directly at midnight"], answer: 1, hint: "Use the communication plan: who owns status and risks?", why: "Raise it early through the agreed channel. The PM updates the plan and informs the sponsor." }],
      check: ["Why demo every week instead of only at the end?", ["To get early feedback and avoid surprises", "Because it's fun", "To skip testing"], 0, "Weekly demos catch misunderstandings early."],
      pack: () => `<h2>14. Timeline & communication plan</h2>${tbl(["Milestone", "When", "Deliverable"], STG.map((s, i) => [s, "Week " + i, esc(D.plan[i])]))}${tbl(["What", "Who", "How often", "Owner"], comms.map(c => c.map(esc)))}` });
    const decisions = [["KPI definition", D.conflict.fix, sp.name], ["Scope", "In/out of scope list agreed (see section 11)", sp.name], ["Acceptance", "Every KPI must match SQL before it ships", sp.name + " & Kabir"]];
    const signItems = ["Problem statement", "Stakeholder register", "Requirements log", "Data source inventory", "KPI definition sheet", "Scope statement", "Risk & dependency log", "Acceptance criteria"];
    M.push({ id: "so", stage: 4, day: "Friday 5 PM · sign-off", title: "Discovery summary, decisions log and sign-off",
      beat: [["lead", "happy", "present", "Discovery is done when the sponsor signs off the problem, scope, KPIs and acceptance criteria. Only then do we write SQL."], ["sp", "happy", "present", D.quote, "r"]],
      simple: `The <b>discovery summary</b> is a one-page recap: problem, objectives, scope, KPIs, risks and next steps. The <b>decisions log</b> records what was decided, by whom and when. <b>Sign-off</b> is the sponsor's written "yes, build this". It is your protection if requirements change later.`,
      terms: [["Decisions log", "a record of decisions, who made them and when"], ["Sign-off", "formal approval to move to the next phase"]],
      sample: { t: "Decisions log (simulated)", h: tbl(["Decision", "Details", "Approved by"], decisions.map(d => d.map(esc))) },
      tasks: [{ type: "write", prompt: "Write a 3-line discovery summary for the sponsor (problem, what we'll build, how we'll know it worked).", model: `${L.problem} We will deliver ${STG.slice(1).join(", ")} views around ${kp.map(k => k[0]).slice(0, 3).join(", ")}. It is done when: ${L.accept[0]}.`, key: "sum" },
        { type: "sign", prompt: "Final check: tick every document that is ready for the sponsor's sign-off.", items: signItems }],
      check: ["When is it OK to start building the dashboard?", ["Right after the kick-off", "After the sponsor signs off scope, KPI definitions and acceptance criteria", "Whenever data arrives"], 1, "Sign-off first. Then build."],
      pack: (S) => `<h2>15. Discovery summary & sign-off</h2><p>${esc((S.text.sum || "").trim() || "(write your summary in step 15)")}</p><b>Decisions log</b>${tbl(["Decision", "Details", "Approved by"], decisions.map(d => d.map(esc)))}<p><b>Sign-off:</b> ${esc(sp.name)}, ${esc(sp.role)} · Date: ____________ · Signature: ____________</p>` });
    return M;
  }

  /* ======================= rendering ======================= */
  const STAGES = [["Understand", "Business & problem"], ["Kick-off", "People & meeting"], ["Discover", "Process, needs, data"], ["Define", "KPIs, scope, risks"], ["Prepare", "Acceptance, plan, sign-off"]];
  function mount() {
    const D = window.KICKOFF_DATA && window.KICKOFF_DATA[SITE], L = window.KICKOFF_LEARN && window.KICKOFF_LEARN[SITE], KIT = window.KICKOFF_KIT;
    const host = document.getElementById("ko-learn"), deck = document.getElementById("ko-deck"), tabs = document.getElementById("ko-tabs");
    if (!D || !L || !KIT || !host || !deck || !tabs) return;
    if (!document.getElementById("kl-css")) { const s = document.createElement("style"); s.id = "kl-css"; s.textContent = STYLE; document.head.appendChild(s); }
    const P = KIT.people(D), M = build(D, L, P);
    let speakingGen = 0;
    const doneN = () => M.filter(m => ST.done[m.id]).length;
    function renderTabs() {
      tabs.innerHTML = `<div class="kl-tabs" role="tablist"><button type="button" role="tab" data-t="story" class="${ST.tab === "story" ? "on" : ""}" aria-selected="${ST.tab === "story"}">🎬 Episode 1: the story</button><button type="button" role="tab" data-t="learn" class="${ST.tab === "learn" ? "on" : ""}" aria-selected="${ST.tab === "learn"}">🧭 Kick-off Playbook <span class="pc">${doneN()}/${M.length}</span></button></div>`;
      tabs.querySelectorAll("[data-t]").forEach(b => b.addEventListener("click", () => { ST.tab = b.dataset.t; save(); KIT.hush(); show(); }));
    }
    function show() { if (ST.tab !== "story") deck.dispatchEvent(new CustomEvent("ko:stop")); renderTabs(); deck.hidden = ST.tab !== "story"; host.hidden = ST.tab !== "learn"; if (ST.tab === "learn") render(); }
    function beatHtml(m) {
      return `<div class="kl-beat">${m.beat.map((b, i) => i === 0 ? `<div class="ch">${KIT.figure(P[b[0]].look, b[1], b[2])}<b>${esc(P[b[0]].short)}</b></div>` : "").join("")}<div class="lines">${m.beat.map(b => `<div class="bb ${b[4] === "r" ? "r" : ""}"><span>${esc(P[b[0]].short)}</span>${esc(b[3])}</div>`).join("")}</div>${m.beat[1] ? `<div class="ch">${KIT.figure(P[m.beat[1][0]].look, m.beat[1][1], m.beat[1][2])}<b>${esc(P[m.beat[1][0]].short)}</b></div>` : ""}${KIT.speechReady() ? `<button type="button" class="lis" aria-label="Listen to this scene">🔊 Listen</button>` : ""}</div>`;
    }
    function taskHtml(m, t, ti) {
      const A = (ST.ans[m.id] || {})[ti] || {};
      const head = `<div class="kl-task" data-ti="${ti}"><h4>✍️ Your task${m.tasks.length > 1 ? " " + (ti + 1) : ""}</h4><p class="pr">${esc(t.prompt)}</p>`;
      let body = "";
      if (t.type === "mcq") { const ans = t.answer != null ? t.answer : t.options.indexOf(t.answerText); t._a = ans;
        body = t.options.map((o, i) => `<label class="kl-opt ${A.checked ? (i === ans ? "good" : A.v === i ? "bad" : "") : ""}"><input type="radio" name="kl-${m.id}-${ti}" value="${i}" ${A.v === i ? "checked" : ""} ${A.checked ? "disabled" : ""}><span>${esc(o)}</span></label>`).join(""); }
      else if (t.type === "multi") body = t.options.map((o, i) => `<label class="kl-opt ${A.checked ? (o[1] ? "good" : (A.v || []).includes(i) ? "bad" : "") : ""}"><input type="checkbox" value="${i}" ${(A.v || []).includes(i) ? "checked" : ""} ${A.checked ? "disabled" : ""}><span>${esc(o[0])}${A.checked ? (o[1] ? " ✔" : " ✘") : ""}</span></label>`).join("");
      else if (t.type === "classify") body = t.items.map((it, i) => { const v = (A.v || {})[i]; const st = A.checked ? (+v === it[1] ? "good" : "bad") : "";
        return `<div class="kl-row ${st}"><span>${esc(it[0])}</span><select data-i="${i}" aria-label="Category" ${A.checked && A.ok ? "disabled" : ""}><option value="">Choose…</option>${t.cats.map((c, j) => `<option value="${j}" ${String(v) === String(j) ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>${A.checked && st === "bad" && A.reveal ? `<div class="fx">Correct: ${esc(t.cats[it[1]])}</div>` : ""}</div>`; }).join("");
      else if (t.type === "write") body = `<textarea class="kl-ta" data-key="${t.key}" placeholder="Type here…">${esc(ST.text[t.key] || "")}</textarea>${A.model ? `<div class="kl-fb hint"><b>A good example:</b> ${esc(t.model)}</div>` : ""}`;
      else if (t.type === "sign") body = `<div class="kl-sign">${t.items.map((x, i) => `<label><input type="checkbox" data-s="${i}" ${ST.sign[i] ? "checked" : ""}> ${esc(x)}</label>`).join("")}</div>`;
      const fb = A.checked ? (A.ok ? `<div class="kl-fb ok">${A.reveal ? "👀 <b>Here is the answer.</b>" : "✅ <b>Correct.</b>"} ${esc(t.why || "")}</div>` : `<div class="kl-fb no">❌ <b>Not yet.</b> ${A.reveal ? esc(t.why || "") : "Some answers are wrong (marked red). Try again, or use the hint."}</div>`) : "";
      const hint = A.hint && t.hint ? `<div class="kl-fb hint">💡 ${esc(t.hint)}</div>` : "";
      const btns = t.type === "write" ? `<div class="kl-btns"><button type="button" class="kl-btn" data-act="wsave">Save to my Project Pack</button><button type="button" class="kl-btn gh" data-act="model">Show a good example</button></div>`
        : t.type === "sign" ? "" : `<div class="kl-btns">${A.ok ? "" : `<button type="button" class="kl-btn" data-act="check">Check my answer</button>`}${t.hint && !A.hint && !A.ok ? `<button type="button" class="kl-btn gh" data-act="hint">💡 Hint</button>` : ""}${A.checked && !A.ok ? `<button type="button" class="kl-btn gh" data-act="reveal">Show the answer</button>` : ""}</div>`;
      return head + body + hint + fb + btns + `</div>`;
    }
    function taskDone(m, t, ti) {
      const A = (ST.ans[m.id] || {})[ti] || {};
      if (t.type === "write") return (ST.text[t.key] || "").trim().length >= 20 || !!A.model;
      if (t.type === "sign") return t.items.every((_, i) => ST.sign[i]);
      return !!(A.ok || A.reveal);
    }
    function render() {
      const cur = Math.max(0, Math.min(M.length - 1, ST.cur || 0)), m = M[cur];
      const allDone = doneN() === M.length;
      host.innerHTML = `<div class="kl"><div class="kl-head"><h2>Kick-off Playbook: ${esc(D.project)}</h2><p>15 short steps that continue the story and show what a Data Analyst does <b>before</b> writing SQL or building dashboards. Each step: a scene, a simple explanation, an example from this project, a small task and a quick check.</p>
        <div class="kl-sim">ⓘ People, conversations and documents are simulated for learning. KPI names and data sources match this project.</div></div>
        <div class="kl-stages">${STAGES.map((s, i) => { const ms = M.filter(x => x.stage === i), d = ms.filter(x => ST.done[x.id]).length; return `<div class="${m.stage === i ? "cur" : ""}"><b>${i + 1}. ${s[0]}</b><small>${s[1]}</small><i><em style="width:${d / ms.length * 100}%"></em></i></div>`; }).join("")}</div>
        <div class="kl-body"><nav class="kl-list" aria-label="Playbook steps">${STAGES.map((s, si) => `<div class="sg">${si + 1}. ${s[0]}</div>${M.map((x, i) => x.stage !== si ? "" : `<button type="button" data-go="${i}" class="${i === cur ? "on" : ""} ${ST.done[x.id] ? "ok" : ""}" ${i === cur ? 'aria-current="step"' : ""}><span class="st">${ST.done[x.id] ? "✓" : i + 1}</span><span>${esc(x.title)}</span></button>`).join("")}`).join("")}</nav>
        <div><div class="kl-mob"><select aria-label="Choose a step">${M.map((x, i) => `<option value="${i}" ${i === cur ? "selected" : ""}>${ST.done[x.id] ? "✓ " : ""}${i + 1}. ${esc(x.title)}</option>`).join("")}</select></div>
        <article class="kl-card" aria-labelledby="kl-t"><div class="kl-mh"><span class="kl-chip">Step ${cur + 1} of ${M.length} · ${STAGES[m.stage][0]}</span><span class="kl-day">📅 ${esc(m.day)}</span>${ST.done[m.id] ? `<span class="kl-done">✓ Completed</span>` : ""}</div>
          <h3 id="kl-t">${esc(m.title)}</h3>${beatHtml(m)}
          <div class="kl-sec"><h4>In simple words</h4><p>${m.simple}</p><div class="kl-terms">${m.terms.map(t => `<span><b>${esc(t[0])}</b>: ${esc(t[1])}</span>`).join("")}</div></div>
          <details class="kl-ex kl-sec" ${cur === 0 ? "open" : ""}><summary>📄 Example from ${esc(D.company)}: ${esc(m.sample.t)}</summary><div class="in">${m.sample.h}</div></details>
          ${m.tasks.map((t, ti) => taskHtml(m, t, ti)).join("")}
          <div class="kl-task" style="background:var(--paper,#F6F7F5)"><h4>🧠 Quick check</h4><p class="pr">${esc(m.check[0])}</p>${m.check[1].map((o, i) => { const q = ST.quiz[m.id]; return `<label class="kl-opt ${q != null ? (i === m.check[2] ? "good" : q === i ? "bad" : "") : ""}"><input type="radio" name="klq-${m.id}" value="${i}" ${q === i ? "checked" : ""} ${q != null ? "disabled" : ""}><span>${esc(o)}</span></label>`; }).join("")}
            ${ST.quiz[m.id] != null ? `<div class="kl-fb ${ST.quiz[m.id] === m.check[2] ? "ok" : "no"}">${ST.quiz[m.id] === m.check[2] ? "✅ Correct." : "❌ Not quite."} ${esc(m.check[3])}</div>` : ""}</div>
          <div class="kl-nav"><button type="button" class="kl-btn gh" data-nav="-1" ${cur === 0 ? "disabled" : ""}>← Previous step</button>
            ${cur === M.length - 1 ? `<button type="button" class="kl-btn" data-pack="1">📦 Download my Project Pack (Word)</button>` : `<button type="button" class="kl-btn" data-nav="1">Next step →</button>`}</div>
          ${cur === M.length - 1 ? `<div class="kl-btns"><button type="button" class="kl-btn gh" data-print="1">🖨️ Print / save as PDF</button><button type="button" class="kl-btn gh" data-reset="1">↺ Reset my progress</button></div>` : ""}
          ${allDone ? `<div class="kl-final"><div class="big">🎉</div><b>All ${M.length} steps done.</b> You now know what happens before the first line of SQL. Next: the Excel stage on your Project Schedule.</div>` : ""}
        </article></div></div></div>`;
      bind(m, cur);
    }
    function complete(m) {
      const ok = m.tasks.every((t, ti) => taskDone(m, t, ti)) && ST.quiz[m.id] != null;
      if (ok && !ST.done[m.id]) { ST.done[m.id] = 1; save(); renderTabs(); }
    }
    function bind(m, cur) {
      const go = (i) => { KIT.hush(); speakingGen++; ST.cur = Math.max(0, Math.min(M.length - 1, i)); save(); render(); host.scrollIntoView({ block: "start", behavior: "smooth" }); };
      host.querySelectorAll("[data-go]").forEach(b => b.addEventListener("click", () => go(+b.dataset.go)));
      const sel = host.querySelector(".kl-mob select"); if (sel) sel.addEventListener("change", () => go(+sel.value));
      host.querySelectorAll("[data-nav]").forEach(b => b.addEventListener("click", () => go(cur + +b.dataset.nav)));
      const lis = host.querySelector(".lis"); if (lis) lis.addEventListener("click", async () => {
        const g = ++speakingGen; KIT.hush(); lis.textContent = "⏹ Stop"; lis.onclick = () => { speakingGen++; KIT.hush(); lis.textContent = "🔊 Listen"; };
        for (const b of m.beat) { if (g !== speakingGen) break; await KIT.speak(b[3], b[0], P, b[1] === "angry" ? "shout" : b[1] === "think" ? "think" : "", () => g === speakingGen); }
        if (g === speakingGen) lis.textContent = "🔊 Listen";
      });
      const A = ST.ans[m.id] = ST.ans[m.id] || {};
      host.querySelectorAll(".kl-task[data-ti]").forEach(box => {
        const ti = +box.dataset.ti, t = m.tasks[ti], a = A[ti] = A[ti] || {};
        box.querySelectorAll("input[type=radio]").forEach(r => r.addEventListener("change", () => { a.v = +r.value; save(); }));
        box.querySelectorAll("input[type=checkbox]:not([data-s])").forEach(c => c.addEventListener("change", () => { a.v = [...box.querySelectorAll("input[type=checkbox]:checked")].map(x => +x.value); save(); }));
        box.querySelectorAll("select[data-i]").forEach(s => s.addEventListener("change", () => { a.v = a.v || {}; a.v[s.dataset.i] = s.value; save(); }));
        box.querySelectorAll("input[data-s]").forEach(c => c.addEventListener("change", () => { ST.sign[c.dataset.s] = c.checked; save(); complete(m); if (ST.done[m.id]) render(); }));
        const ta = box.querySelector(".kl-ta"); if (ta) ta.addEventListener("input", () => { ST.text[ta.dataset.key] = ta.value; save(); });
        const act = (n, fn) => { const b = box.querySelector(`[data-act="${n}"]`); if (b) b.addEventListener("click", fn); };
        act("hint", () => { a.hint = 1; save(); render(); });
        act("reveal", () => { a.reveal = 1; a.checked = 1; if (t.type === "classify") { a.v = Object.fromEntries(t.items.map((it, i) => [i, String(it[1])])); a.ok = 1; } if (t.type === "mcq") { a.v = t._a; a.ok = 1; } if (t.type === "multi") { a.v = t.options.map((o, i) => o[1] ? i : -1).filter(i => i >= 0); a.ok = 1; } save(); complete(m); render(); });
        act("check", () => {
          let ok = false;
          if (t.type === "mcq") { if (a.v == null) return alertBox(box, "Choose an answer first."); ok = a.v === t._a; }
          if (t.type === "multi") { const v = new Set(a.v || []); ok = t.options.every((o, i) => o[1] === v.has(i)); if (!v.size) return alertBox(box, "Tick at least one option."); }
          if (t.type === "classify") { const v = a.v || {}; if (t.items.some((_, i) => v[i] == null || v[i] === "")) return alertBox(box, "Choose a category for every row first."); ok = t.items.every((it, i) => +v[i] === it[1]); }
          a.checked = 1; a.ok = ok ? 1 : 0; save(); complete(m); render();
          const nb = host.querySelector(`.kl-task[data-ti="${ti}"]`); if (nb) nb.scrollIntoView({ block: "nearest" });
        });
        act("wsave", () => { if ((ST.text[t.key] || "").trim().length < 20) return alertBox(box, "Write at least one full sentence (20+ characters)."); save(); complete(m); render(); });
        act("model", () => { a.model = 1; save(); complete(m); render(); });
      });
      host.querySelectorAll(`input[name="klq-${m.id}"]`).forEach(r => r.addEventListener("change", () => { ST.quiz[m.id] = +r.value; save(); complete(m); render(); }));
      const pk = host.querySelector("[data-pack]"); if (pk) pk.addEventListener("click", () => download(packHtml()));
      const pt = host.querySelector("[data-print]"); if (pt) pt.addEventListener("click", () => { const w = window.open("", "_blank"); if (!w) return; w.document.write(packHtml()); w.document.close(); setTimeout(() => w.print(), 400); });
      const rs = host.querySelector("[data-reset]"); if (rs) rs.addEventListener("click", () => { if (!confirm("Reset all Playbook progress on this device?")) return; ST = { done: {}, ans: {}, quiz: {}, text: {}, cur: 0, tab: "learn", sign: {} }; save(); show(); });
    }
    function alertBox(box, msg) { let f = box.querySelector(".kl-fb.tmp"); if (!f) { f = document.createElement("div"); f.className = "kl-fb no tmp"; box.appendChild(f); } f.textContent = "⚠ " + msg; }
    function packHtml() {
      const who = P.you.name.replace(" (you)", "");
      return `<!doctype html><html><head><meta charset="utf-8"><title>Project Pack · ${esc(D.project)}</title><style>body{font-family:Calibri,Arial,sans-serif;max-width:820px;margin:24px auto;padding:0 16px;color:#111;line-height:1.5}h1{font-size:24px;margin:0}h2{font-size:17px;margin:22px 0 6px;border-bottom:2px solid #ddd;padding-bottom:3px}table{border-collapse:collapse;width:100%;font-size:12.5px;margin:6px 0}td,th{border:1px solid #ccc;padding:5px;text-align:left;vertical-align:top}th{background:#f2f2f2}code{font-family:Consolas,monospace}.note{background:#fff7e6;border:1px solid #f0d9a8;padding:6px 8px;font-size:12px}</style></head><body>
        <h1>Project Pack: ${esc(D.project)}</h1><p>Prepared by <b>${esc(who === "You" ? "__________" : who)}</b> · Data Analyst / BI Developer · ${new Date().toLocaleDateString("en-IN")}</p>
        <p class="note">Learning document from the Kick-off Playbook. People, meetings and decisions are simulated; KPI names and data sources follow the ${esc(D.project)} capstone project.</p>
        ${M.map(m => m.pack(ST)).join("")}</body></html>`;
    }
    function download(html) { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob(["﻿" + html], { type: "application/msword" })); a.download = `Project-Pack-${D.project.replace(/[^\w]+/g, "-")}.doc`; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 3000); }
    show();
    const sec = document.getElementById("view-kickoff");
    if (sec) new MutationObserver(() => { if (!sec.classList.contains("active")) { speakingGen++; KIT.hush(); } }).observe(sec, { attributes: true, attributeFilter: ["class"] });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
