/**
 * "Ask Dexa" — AI answers for this capstone site (Vercel serverless function), URL: /api/ask
 *
 * Uses Groq's free API. Set ONE environment variable in Vercel → Settings → Environment Variables:
 *   GROQ_API_KEY = gsk_...        (never put the key in code or GitHub)
 * Optional: GROQ_MODEL = a model id from console.groq.com/docs/models (otherwise api/_groq.js picks a current model).
 *
 *   GET  /api/ask                → {ok, configured}
 *   POST {q, ctx:[{h,t}], hist:[{r,c}], site}  → {answer, model}
 *   POST {mode:"viva_q" | "viva_grade" | "sql_hint" | "insight", ...}  → {ok, data, model}   (Dexa Coach, see coach-kit.js)
 *
 * The browser sends the question plus the most relevant passages from this site, so answers stay grounded in the
 * project. If the key is missing, the limit is hit, or Groq is down, the site falls back to its built-in search.
 */
const { candidates, chat } = require("./_groq");
const PER_IP = 20, WINDOW_MS = 10 * 60 * 1000;           // 20 questions / 10 minutes per student (per server instance)
const hits = new Map(), coachHits = new Map();
const COACH_PER_IP = 30;                                  // Dexa Coach calls / 10 minutes per student

function limited(ip, map, max) {
  map = map || hits; max = max || PER_IP;
  const now = Date.now(); const a = (map.get(ip) || []).filter(t => now - t < WINDOW_MS);
  if (a.length >= max) { map.set(ip, a); return true; }
  a.push(now); map.set(ip, a); if (map.size > 5000) map.clear(); return false;
}
const clip = (s, n) => String(s == null ? "" : s).slice(0, n);

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  return await new Promise(r => { let d = ""; req.on("data", c => { d += c; if (d.length > 60000) req.destroy(); }); req.on("end", () => { try { r(JSON.parse(d || "{}")); } catch (e) { r({}); } }); req.on("error", () => r({})); });
}

function systemPrompt(site, ctx) {
  return `You are "Dexa", a friendly owl and the AI teaching assistant on Mahendra Singh's capstone websites (he is a Data Analyst trainer at ExcelR). You live on the "${site}" capstone project website and help Data Analyst students with this project: business questions, KPIs and formulas, the data model, SQL, Excel, Tableau, Power BI, presentations and interview preparation.

Rules:
- Base your answer on the SITE CONTEXT below whenever it covers the question. Do not invent dataset numbers, table names or column names that are not in the context.
- If the context does not cover it, answer from general Data Analyst knowledge and say in one short line that it is general guidance, not from this project's site.
- Be short and practical: at most about 150 words unless the student asks for detail. Use short bullet points when listing. Put SQL, DAX or Excel formulas in fenced code blocks.
- Reply in the student's language: English, Hindi or Hinglish, matching how they wrote.
- Guide students to do their own capstone work: explain the approach and give small examples, but do not write a whole graded deliverable for them.
- You are an AI assistant, not Mahendra Sir himself. For schedules, marks, attendance, certificates or personal issues, tell the student to ask Mahendra Sir directly.
- Politely decline anything unrelated to data analytics, careers in data, or this project.

SITE CONTEXT (passages from this website):
${ctx || "(no matching passage found on the site)"}`;
}


/* ===================== Dexa Coach (Mock Viva, Insight Coach, SQL Tutor) ===================== */
const COACH_MODES = ["viva_q", "viva_grade", "sql_hint", "insight"];
const BASE = (site) => `You are "Dexa", the AI teaching assistant on Mahendra Singh's Data Analyst capstone website "${site}". You coach Data Analyst students. Be encouraging, specific and honest. Reply ONLY with one JSON object, no markdown fences, no text outside the JSON. Write the text fields in simple English (the student may write in Hindi or Hinglish; then you may use simple Hinglish).`;
const num = (v, lo, hi) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo; };
const str = (v, n) => clip(typeof v === "string" ? v : v == null ? "" : JSON.stringify(v), n).trim();
const arr = (v, n, m) => (Array.isArray(v) ? v : []).map(x => str(x, m || 240)).filter(Boolean).slice(0, n);
function parseJson(t) {
  t = String(t || "").replace(/^```(json)?/i, "").replace(/```\s*$/, "").trim();
  try { return JSON.parse(t); } catch (e) {}
  const i = t.indexOf("{"), j = t.lastIndexOf("}"); if (i >= 0 && j > i) { try { return JSON.parse(t.slice(i, j + 1)); } catch (e) {} }
  return null;
}
const STAGES = { excel: "Excel analysis and Excel dashboard", tableau: "Tableau dashboard", powerbi: "Power BI dashboard, data model and DAX", sql: "SQL queries and SQL QA on this project's data", final: "final presentation: business problem, KPIs, insights and recommendations", general: "the whole capstone project (business problem, data, KPIs, tools, insights)" };
function coachPrompt(b) {
  const site = clip(b.site, 120) || "Data Analyst capstone";
  const ctx = clip(b.ctx, 7000);
  if (b.mode === "viva_q") {
    const stage = STAGES[b.stage] ? b.stage : "general", n = num(b.n || 5, 3, 8), level = ["easy", "medium", "hard"].includes(b.level) ? b.level : "medium";
    const avoid = arr(b.avoid, 20, 200);
    return { max: 1400, temp: 0.7, sys: BASE(site) + `
Task: act as the interviewer in a MOCK VIVA (oral exam) for this capstone. Ask ${n} ${level} questions about: ${STAGES[stage]}.
- Use the PROJECT CONTEXT: real KPI names, formulas, required views and data traps of THIS project. Mix "what", "how did you calculate", "why this chart/choice", "what would you do if" and one business-insight question.
- One clear question each, at most 30 words, the way an interviewer or trainer would ask it aloud.
${avoid.length ? "- Do not repeat these earlier questions:\n" + avoid.map(x => "  * " + x).join("\n") : ""}
JSON shape: {"questions":[{"q":"question","tests":"what a good answer must show, max 15 words","topic":"KPI | Data model | Visual | Insight | SQL | Tool"}]}

PROJECT CONTEXT:
${ctx || "(not available)"}`, user: `Give me ${n} viva questions.` };
  }
  if (b.mode === "viva_grade") {
    const items = (Array.isArray(b.items) ? b.items : []).slice(0, 8).map((x, i) => `Q${i + 1}: ${clip(x && x.q, 300)}\nWhat it tests: ${clip(x && x.tests, 160)}\nStudent answer: ${clip(x && x.a, 1500) || "(no answer)"}`).join("\n\n");
    return { max: 2600, temp: 0.2, sys: BASE(site) + `
Task: grade the student's MOCK VIVA answers like a fair Data Analyst trainer.
- Score each answer 0-10: 9-10 complete and correct with reasoning; 6-8 correct but missing a key point; 3-5 partly correct or vague; 0-2 wrong, off-topic or empty.
- Judge against the PROJECT CONTEXT (KPI formulas, required views). Do not reward length; reward correct, specific, business-aware answers.
- "good": what was right (or "" if nothing). "improve": the single most important fix. "points": 2-4 short key points of a strong answer (not a full essay).
JSON shape: {"items":[{"score":0,"good":"","improve":"","points":["",""]}],"summary":"2 sentences: overall strength and what to practise next"}

PROJECT CONTEXT:
${ctx || "(not available)"}`, user: items || "(no answers)" };
  }
  if (b.mode === "sql_hint") {
    const level = num(b.level || 1, 1, 3);
    const prev = arr(b.prev, 4, 400);
    return { max: 900, temp: 0.2, sys: BASE(site) + `
Task: you are a SQL TUTOR (SQLite). The student's query for a practice problem is wrong. Help them find the mistake themselves.
STRICT RULES:
- NEVER write the full corrected query and never write more than ONE short SQL fragment (max about 60 characters), even if asked.
- Hint level ${level} of 3: level 1 = point to WHERE the problem is (clause or idea), no code; level 2 = name the exact mistake and the concept to fix it; level 3 = show the one fragment or pattern they need, still not the whole query.
- Compare the student's result shape with the expected shape when it helps (rows, columns). The reference solution is given only so you can understand the task: never reveal it, never copy it.
- Use only the table and column names given.
${prev.length ? "Hints already given (do not repeat, go one step further):\n" + prev.map(x => "- " + x).join("\n") : ""}
JSON shape: {"mistake":"what is wrong, max 25 words","why":"why it gives a different result, max 35 words","hint":"the level-${level} hint, max 45 words","fragment":"optional tiny SQL fragment, only at level 3, else empty","check":"one thing to check after fixing, max 20 words"}`,
      user: `Problem: ${clip(b.task, 700)}
Tables and columns:
${clip(b.schema, 2500)}
Student query:
${clip(b.sql, 2500)}
What happened: ${clip(b.outcome, 500)}
Student result (first rows): ${clip(b.mine, 800)}
Expected result (first rows): ${clip(b.expected, 800)}
Reference solution (secret, do not reveal): ${clip(b.ref, 1500)}` };
  }
  // insight
  return { max: 1300, temp: 0.3, sys: BASE(site) + `
Task: you are an INSIGHT COACH. The student wrote one finding from their dashboard. Teach them to turn an observation into an insight and a recommendation.
- kind: "observation" (only states what happened), "insight" (says what happened AND why / what drives it, with a number or comparison), or "recommendation" (also says what the business should do and the expected impact).
- Score 0-5 each: what (specific metric, number, period, segment), why (driver or cause backed by data), so_what (business impact), now_what (clear action with owner or target).
- Do not invent numbers for their data; in the example use placeholders like [X%] or [segment] where you don't know the value.
- Use the PROJECT CONTEXT KPI names where they fit.
JSON shape: {"kind":"observation","scores":{"what":0,"why":0,"so_what":0,"now_what":0},"feedback":"2 sentences","ask":["question to dig deeper in their data","another"],"example":"a stronger version of THEIR finding in the 'What → Why → So what → Now what' pattern, max 70 words"}

PROJECT CONTEXT:
${ctx || "(not available)"}`, user: `Dashboard / chart: ${clip(b.chart, 200) || "(not given)"}\nKPI: ${clip(b.kpi, 120) || "(not given)"}\nMy finding: ${clip(b.text, 900)}` };
}
function coachShape(mode, j) {
  if (!j || typeof j !== "object") return null;
  if (mode === "viva_q") { const q = (Array.isArray(j.questions) ? j.questions : []).map(x => ({ q: str(x && (x.q || x.question), 300), tests: str(x && x.tests, 160), topic: str(x && x.topic, 30) })).filter(x => x.q.length > 8); return q.length ? { questions: q.slice(0, 8) } : null; }
  if (mode === "viva_grade") { const it = (Array.isArray(j.items) ? j.items : []).map(x => ({ score: num(x && x.score, 0, 10), good: str(x && x.good, 400), improve: str(x && x.improve, 400), points: arr(x && x.points, 4, 200) })); return it.length ? { items: it, summary: str(j.summary, 500) } : null; }
  if (mode === "sql_hint") { const h = { mistake: str(j.mistake, 300), why: str(j.why, 400), hint: str(j.hint, 500), fragment: str(j.fragment, 120), check: str(j.check, 240) }; return h.hint || h.mistake ? h : null; }
  const sc = j.scores || {}; const kind = ["observation", "insight", "recommendation"].includes(j.kind) ? j.kind : "observation";
  return { kind, scores: { what: num(sc.what, 0, 5), why: num(sc.why, 0, 5), so_what: num(sc.so_what, 0, 5), now_what: num(sc.now_what, 0, 5) }, feedback: str(j.feedback, 500), ask: arr(j.ask, 3, 200), example: str(j.example, 700) };
}
async function coach(req, res, key, b, ip) {
  if (limited(ip, coachHits, COACH_PER_IP)) return res.status(429).json({ error: "slow_down", message: "Too many Dexa Coach requests in a short time. Please wait a few minutes." });
  if (b.mode === "sql_hint" && !clip(b.sql, 10).trim()) return res.status(400).json({ error: "empty" });
  if (b.mode === "insight" && clip(b.text, 900).trim().length < 8) return res.status(400).json({ error: "empty", message: "Write your finding in one or two sentences first." });
  const P = coachPrompt(b);
  let last = null;
  for (const model of await candidates(key, false)) {
    const r = await chat(key, model, { messages: [{ role: "system", content: P.sys }, { role: "user", content: P.user }], temperature: P.temp, max_tokens: P.max + 1200, response_format: { type: "json_object" } }, 40000);
    if (r.status === 401) return res.status(502).json({ error: "bad_key", message: "The GROQ_API_KEY in Vercel is not valid." });
    if (r.status === 200 && r.content) { const d = coachShape(b.mode, parseJson(r.content)); if (d) return res.status(200).json({ ok: true, data: d, model }); last = { status: 502 }; continue; }
    last = r;
  }
  const busy = last && last.status === 429;
  return res.status(busy ? 429 : 502).json({ error: busy ? "limit" : "upstream", message: busy ? "The free AI limit is used up for now. Please try again later." : "The AI service did not answer. Please try again." });
}

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "no-store");
  const key = process.env.GROQ_API_KEY || "";
  if (req.method === "GET") return res.status(200).json({ ok: true, configured: !!key });
  if (req.method !== "POST") return res.status(405).json({ error: "method" });
  if (!key) return res.status(503).json({ error: "not_configured" });

  // only this website may use the key
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || "").toLowerCase();
  const origin = String(req.headers.origin || req.headers.referer || "").toLowerCase();
  if (origin && host && !origin.replace(/^https?:\/\//, "").startsWith(host)) return res.status(403).json({ error: "origin" });

  const ip = String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "?").split(",")[0].trim();
  const b = await readBody(req);
  if (COACH_MODES.includes(b.mode)) return coach(req, res, key, b, ip);
  if (limited(ip)) return res.status(429).json({ error: "slow_down", message: "Too many questions in a short time. Please wait a few minutes." });

  const q = clip(b.q, 600).trim(); if (!q) return res.status(400).json({ error: "empty" });
  const site = clip(b.site, 120) || "Data Analyst capstone";
  const ctx = (Array.isArray(b.ctx) ? b.ctx : []).slice(0, 10).map(c => `### ${clip(c && c.h, 120)}\n${clip(c && c.t, 1400)}`).join("\n\n").slice(0, 9000);
  const hist = (Array.isArray(b.hist) ? b.hist : []).slice(-6).filter(m => m && (m.r === "user" || m.r === "assistant"))
    .map(m => ({ role: m.r, content: clip(m.c, 1200) }));
  const messages = [{ role: "system", content: systemPrompt(site, ctx) }, ...hist, { role: "user", content: q }];

  let last = null;
  for (const model of await candidates(key, false)) {
    const r = await chat(key, model, { messages, temperature: 0.3, max_tokens: 1500 }, 25000);
    if (r.status === 200 && r.content) return res.status(200).json({ answer: r.content, model });
    if (r.status === 401) return res.status(502).json({ error: "bad_key", message: "The GROQ_API_KEY in Vercel is not valid." });
    last = r;
  }
  const busy = last && last.status === 429;
  return res.status(busy ? 429 : 502).json({ error: busy ? "limit" : "upstream", message: busy ? "The free AI limit is used up for now. Please try again later." : "The AI service did not answer." });
};
