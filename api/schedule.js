/**
 * PayFlow Fintech Analytics — live API (Vercel serverless function), URL: /api/schedule
 *
 * Storage: Upstash Redis (free) connected from Vercel → Storage. Connecting it adds
 * KV_REST_API_URL + KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_URL/TOKEN) automatically.
 *
 * 1) Project schedule (trainer edits, students read)
 *    GET  /api/schedule                              → schedule JSON
 *    POST {action:"check",pin} | {action:"save",pin,data} | {action:"setpin",pin,newPin}
 * 2) Real visitor counter + student visits
 *    GET  /api/schedule?stats=1                      → {unique, today, views}  (public)
 *    POST {action:"visit", vid, name, group, batch, page}   (students, no PIN)
 *    POST {action:"report", pin, days}               → per-student visits + daily chart (trainer only)
 *    Student accounts (name, email, mobile, password; phone and email are unique):
 *    POST {action:"signup", name, email, mobile, password, batch, group}  → {token, profile}   (group "" = not assigned yet)
 *    POST {action:"login", login (email or mobile), password}              → {token, profile}
 *    POST {action:"me" | "logout", token}   POST {action:"update", token, name?, group?, batch?}
 *    POST {action:"forgot", email} → 6-digit code by email (Resend)   POST {action:"reset", email, code, password} → {token, profile}
 *    Trainer: {action:"accounts", pin} · {action:"tresetpw", pin, uid} → temporary password · {action:"certsend", pin, code, site} → issue + email certificates
 *    The mobile number itself is never stored: only a salted hash (the account id) and its last 4 digits. Passwords: scrypt with a random salt.
 *    Email (password reset + certificates): env RESEND_API_KEY and MAIL_FROM (e.g. "Mahendra Singh <certificates@yourdomain.com>").
 * 3) Cloud progress (student name + group is the key, so a new device can restore it)
 *    POST {action:"progress", name, group, data, summary}   (students, no PIN)
 *    POST {action:"restore", name, group}            → saved progress or null
 *
 * Trainer login: username (env ADMIN_USER, default "Mahendra") + password. The default password is stored here only as a
 * salted hash (DEFAULT_PASS_HASH); env ADMIN_PASSWORD overrides it; after "Change password" on the site its
 * hash lives in Redis. 8 wrong PINs in 15 minutes locks PIN actions for 15 minutes.
 */
const crypto = require("crypto");

const PFX = "payflow:";
const KEY_DATA = PFX + "schedule", KEY_PIN = PFX + "passhash", KEY_FAIL = PFX + "pinfail";
const DEFAULT_PASS_HASH = "63c299b85fcdb023f9d9e61dafc2250dc0fd4ce464153d5c0879d8d5b4dbe18d";
const MAX_FAILS = 8, FAIL_WINDOW_S = 900, MAX_BYTES = 200000, KEEP_DAYS_S = 400 * 86400;
const SALT = "axon-mkt-trainer";

function redisEnv() {
  const e = process.env;
  let url = e.KV_REST_API_URL || e.UPSTASH_REDIS_REST_URL, token = e.KV_REST_API_TOKEN || e.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    const k = Object.keys(e).find(k => /_REST_(API_)?URL$/.test(k) && /KV|REDIS|UPSTASH/i.test(k) && e[k.replace(/_URL$/, "_TOKEN")]);
    if (k) { url = e[k]; token = e[k.replace(/_URL$/, "_TOKEN")]; }
  }
  if (!url || !token) {   // fallback: Upstash also gives rediss://default:TOKEN@host:6379 → REST is https://host with the same token
    const k = Object.keys(e).find(k => /(^|_)(REDIS|KV)_URL$/.test(k) && /^rediss?:\/\/[^@]+@[^:\/]+\.upstash\.io/.test(e[k] || ""));
    if (k) { try { const u = new URL(e[k]); url = "https://" + u.hostname; token = decodeURIComponent(u.password); } catch (x) {} }
  }
  if (url && token) return { url: url.replace(/\/$/, ""), token };
  // Redis Cloud (or any normal Redis): redis://user:password@host:port  (rediss:// = TLS). Vercel sets REDIS_URL.
  const rk = ["REDIS_URL", ...Object.keys(e).filter(k => /(^|_)REDIS_URL$/.test(k))].find(k => /^rediss?:\/\//.test(e[k] || ""));
  if (rk) { try { const u = new URL(e[rk]); return { tcp: true, tls: u.protocol === "rediss:", host: u.hostname, port: +u.port || 6379, user: decodeURIComponent(u.username || ""), pass: decodeURIComponent(u.password || ""), db: +(u.pathname || "").slice(1) || 0 }; } catch (x) {} }
  return null;
}
/* ---- tiny Redis client (RESP protocol over TCP/TLS), used only for Redis Cloud; no npm package needed ---- */
const net = require("net"), tls = require("tls");
const enc = (args) => { let o = "*" + args.length + "\r\n"; for (const a of args) { const b = Buffer.from(String(a), "utf8"); o += "$" + b.length + "\r\n" + b.toString("utf8") + "\r\n"; } return o; };
function parseResp(buf, i) {            // → [value, nextIndex] or null if the buffer is not complete yet
  if (i >= buf.length) return null;
  const nl = buf.indexOf("\r\n", i); if (nl < 0) return null;
  const t = String.fromCharCode(buf[i]), line = buf.toString("utf8", i + 1, nl);
  if (t === "+") return [line, nl + 2];
  if (t === "-") return [{ __err: line }, nl + 2];
  if (t === ":") return [Number(line), nl + 2];
  if (t === "$") { const n = Number(line); if (n < 0) return [null, nl + 2]; if (buf.length < nl + 2 + n + 2) return null; return [buf.toString("utf8", nl + 2, nl + 2 + n), nl + 2 + n + 2]; }
  if (t === "*") { const n = Number(line); if (n < 0) return [null, nl + 2]; const out = []; let j = nl + 2; for (let k = 0; k < n; k++) { const v = parseResp(buf, j); if (!v) return null; out.push(v[0]); j = v[1]; } return [out, j]; }
  throw new Error("Bad reply from Redis");
}
function tcpRun(env, cmds) {             // one connection: AUTH (+SELECT) and all commands in a single write
  return new Promise((resolve, reject) => {
    const pre = []; if (env.pass) pre.push(env.user ? ["AUTH", env.user, env.pass] : ["AUTH", env.pass]); if (env.db) pre.push(["SELECT", env.db]);
    const all = pre.concat(cmds), want = all.length; let buf = Buffer.alloc(0), got = [], pos = 0, done = false;
    const opts = { host: env.host, port: env.port };
    const sock = env.tls ? tls.connect(Object.assign({ servername: env.host }, opts)) : net.connect(opts);
    const fin = (err, val) => { if (done) return; done = true; clearTimeout(t); try { sock.end(); sock.destroy(); } catch (e) {} err ? reject(err) : resolve(val); };
    const t = setTimeout(() => fin(new Error("Redis timeout")), 9000);
    sock.on(env.tls ? "secureConnect" : "connect", () => sock.write(all.map(enc).join("")));
    sock.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      try { let v; while (got.length < want && (v = parseResp(buf, pos))) { got.push(v[0]); pos = v[1]; } } catch (e) { return fin(e); }
      if (got.length >= want) { const a = got.slice(0, pre.length).find(x => x && x.__err); if (a) return fin(new Error("Redis login failed: " + a.__err)); fin(null, got.slice(pre.length)); }
    });
    sock.on("error", (e) => fin(new Error("Redis connection failed: " + e.message)));
    sock.on("close", () => fin(new Error("Redis closed the connection")));
  });
}
// names only (never values) of env vars that look database-related, to help debug "not connected"
const envHints = () => Object.keys(process.env).filter(k => /KV|REDIS|UPSTASH/i.test(k)).sort();
async function redis(env, ...cmd) {
  if (env.tcp) { const [v] = await tcpRun(env, [cmd]); if (v && v.__err) throw new Error(v.__err); return v; }
  const r = await fetch(env.url, { method: "POST", headers: { Authorization: "Bearer " + env.token, "Content-Type": "application/json" }, body: JSON.stringify(cmd) });
  const j = await r.json(); if (j.error) throw new Error(j.error); return j.result;
}
async function pipe(env, cmds) {
  if (!cmds.length) return [];
  if (env.tcp) { const out = []; for (let i = 0; i < cmds.length; i += 500) out.push(...await tcpRun(env, cmds.slice(i, i + 500))); return out.map(v => v && v.__err ? undefined : v); }
  const r = await fetch(env.url + "/pipeline", { method: "POST", headers: { Authorization: "Bearer " + env.token, "Content-Type": "application/json" }, body: JSON.stringify(cmds) });
  const j = await r.json(); if (!Array.isArray(j)) throw new Error(j.error || "pipeline failed");
  return j.map(x => x.result);
}
const hash = (pin) => crypto.createHash("sha256").update(SALT + "|" + pin, "utf8").digest("hex");
const toObj = (raw) => { const h = {}; if (Array.isArray(raw)) { for (let k = 0; k < raw.length; k += 2) h[raw[k]] = raw[k + 1]; } else if (raw) Object.assign(h, raw); return h; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const istDay = (t) => new Date((t || Date.now()) + 330 * 60000).toISOString().slice(0, 10);   // India date
const clean = (s, n) => String(s == null ? "" : s).replace(/[\u0000-\u001f<>]/g, "").replace(/\s+/g, " ").trim().slice(0, n);
function send(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.end(JSON.stringify(obj));
}
async function readBody(req) {
  if (req.body !== undefined && req.body !== null && req.body !== "") return typeof req.body === "string" ? JSON.parse(req.body) : req.body;
  const chunks = []; for await (const c of req) chunks.push(c);
  const s = Buffer.concat(chunks).toString("utf8"); return s ? JSON.parse(s) : {};
}
async function checkPin(env, pin) {
  const fails = +(await redis(env, "GET", KEY_FAIL)) || 0;
  if (fails >= MAX_FAILS) return { ok: false, code: 429, error: "Too many wrong logins. Try again in 15 minutes." };
  const stored = (await redis(env, "GET", KEY_PIN)) || (process.env.ADMIN_PASSWORD ? hash(process.env.ADMIN_PASSWORD) : DEFAULT_PASS_HASH);
  if (hash(String(pin || "")) !== stored) {
    await pipe(env, [["INCR", KEY_FAIL], ["EXPIRE", KEY_FAIL, String(FAIL_WINDOW_S)]]); await sleep(800);
    return { ok: false, code: 401, error: "Wrong username or password" };
  }
  if (fails) await redis(env, "DEL", KEY_FAIL);
  return { ok: true };
}


/* ===================== student accounts ===================== */
const ACC_ACTIONS = ["signup", "login", "me", "update", "logout", "forgot", "reset"];
const SESSION_S = 60 * 86400, RESET_S = 900;
const EMAIL_RE = /^[^\s@<>"']{1,64}@[^\s@<>"']{1,190}\.[a-z]{2,24}$/i;
const NO_GROUP = "";
const normMob = (m) => String(m || "").replace(/\D/g, "").replace(/^(?:91|0)(?=\d{10}$)/, "");
const uidOf = (mob) => "u_" + crypto.createHash("sha256").update(SALT + "|mobile|" + mob, "utf8").digest("hex").slice(0, 24);
const emKey = (em) => PFX + "em:" + crypto.createHash("sha256").update(SALT + "|email|" + em, "utf8").digest("hex").slice(0, 32);
const normEmail = (e) => String(e || "").trim().toLowerCase().slice(0, 254);
function pwHash(pw) { const salt = crypto.randomBytes(16).toString("hex"); return "s1$" + salt + "$" + crypto.scryptSync(String(pw), salt, 32).toString("hex"); }
function pwOk(pw, stored) {
  const [v, salt, d] = String(stored || "").split("$"); if (v !== "s1" || !salt || !d) return false;
  const a = crypto.scryptSync(String(pw), salt, 32), b = Buffer.from(d, "hex"); return b.length === a.length && crypto.timingSafeEqual(a, b);
}
const pwProblem = (pw) => String(pw || "").length < 6 ? "Password must be at least 6 characters." : String(pw).length > 72 ? "Password is too long." : "";
async function schedProjects(env) { try { const v = await redis(env, "GET", KEY_DATA); return v ? (JSON.parse(v).projects || []) : []; } catch (e) { return []; } }
const codeN = (c) => String(c || "").toUpperCase().replace(/\s+/g, "");
const projOf = (projects, code) => projects.find(p => codeN(p.code) === codeN(code)) || null;
// group becomes required the day after the project's kick-off meeting
const kickOf = (p) => String((p && ((p.overrides && p.overrides.kickoff) || p.kickoff)) || "").slice(0, 10);
const groupRequired = (p) => !!(p && kickOf(p) && istDay() > kickOf(p));
function profileOut(uid, h, projects) {
  const p = projOf(projects, h.batch); let cert = null; try { cert = h.cert ? JSON.parse(h.cert) : null; } catch (e) {}
  return { uid, name: h.name || "", email: h.email || "", last4: h.last4 || "", group: h.group || NO_GROUP, batch: h.batch || "",
    needsGroup: !h.group && groupRequired(p), codeOk: !!p || !projects.length, kickoff: kickOf(p), cert };
}
async function newSession(env, uid, ver) { const t = crypto.randomBytes(24).toString("hex"); await redis(env, "SET", PFX + "sess:" + t, uid + "|" + ver, "EX", String(SESSION_S)); return t; }
async function sessionUser(env, token) {
  if (!/^[a-f0-9]{48}$/.test(String(token || ""))) return null;
  const v = await redis(env, "GET", PFX + "sess:" + token); if (!v) return null;
  const [uid, ver] = String(v).split("|"); const h = toObj(await redis(env, "HGETALL", PFX + "u:" + uid));
  if (!h.pw || String(h.ver || "1") !== ver) return null;
  return { uid, h };
}
function validGroup(p, group) { const gs = ((p && p.groups) || []).map(g => String(g.name || "").trim()).filter(Boolean); return !group || !gs.length || gs.includes(group); }
async function mailSend(list) {      // list: [{to, subject, html}] → Resend (batch API, max 100 per call)
  const key = process.env.RESEND_API_KEY; if (!key) return { ok: false, error: "no_key" };
  const from = process.env.MAIL_FROM || "Mahendra Singh <onboarding@resend.dev>"; let sent = 0, error = "";
  for (let i = 0; i < list.length; i += 100) {
    const chunk = list.slice(i, i + 100);
    try {
      const r = await fetch("https://api.resend.com/emails/batch", { method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
        body: JSON.stringify(chunk.map(m => ({ from, to: [m.to], subject: m.subject, html: m.html }))) });
      const j = await r.json().catch(() => ({}));
      if (r.ok) sent += chunk.length; else error = (j && (j.message || j.error)) || ("HTTP " + r.status);
    } catch (e) { error = e.message; }
  }
  return { ok: !error, sent, error };
}
const siteUrl = (req, b) => { const h = String(req.headers["x-forwarded-host"] || req.headers.host || ""); return /^[a-z0-9.-]+(:\d+)?$/i.test(h) ? (/^localhost|^127\./.test(h) ? "http://" : "https://") + h + "/" : ""; };
const mailWrap = (title, body) => `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px"><div style="font-size:13px;color:#6d28d9;font-weight:700;letter-spacing:.08em">DATA ANALYST CAPSTONE · MAHENDRA SINGH</div><h2 style="margin:10px 0 14px;color:#1f1b2e">${title}</h2>${body}<p style="color:#9ca3af;font-size:12px;margin-top:24px">You get this email because you have an account on a Data Analyst capstone project website.</p></div>`;
const escH = (s) => String(s == null ? "" : s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

async function accounts(env, req, res, b) {
  const ip = String(req.headers["x-forwarded-for"] || (req.socket && req.socket.remoteAddress) || "?").split(",")[0].trim();
  if (b.action === "me" || b.action === "logout" || b.action === "update") {
    const u = await sessionUser(env, b.token);
    if (b.action === "logout") { if (/^[a-f0-9]{48}$/.test(String(b.token || ""))) await redis(env, "DEL", PFX + "sess:" + b.token); return send(res, 200, { ok: true }); }
    if (!u) return send(res, 401, { ok: false, error: "Please log in again.", relogin: true });
    const projects = await schedProjects(env);
    if (b.action === "me") return send(res, 200, { ok: true, profile: profileOut(u.uid, u.h, projects) });
    const name = b.name != null ? clean(b.name, 48) : u.h.name, batch = b.batch != null ? codeN(clean(b.batch, 30)) : u.h.batch, group = b.group != null ? clean(b.group, 40) : (u.h.group || "");
    if (name.length < 2) return send(res, 400, { ok: false, error: "Please enter your full name." });
    const p = projOf(projects, batch);
    if (projects.length && !p) return send(res, 400, { ok: false, error: "This project code doesn't exist. Check the code with your trainer." });
    if (!group && groupRequired(p)) return send(res, 400, { ok: false, error: "Your project has started, so please select your group." });
    if (!validGroup(p, group)) return send(res, 400, { ok: false, error: "Please select a group from the list." });
    await redis(env, "HSET", PFX + "u:" + u.uid, "name", name, "batch", batch, "group", group, "updated", String(Date.now()));
    return send(res, 200, { ok: true, profile: profileOut(u.uid, Object.assign({}, u.h, { name, batch, group }), projects) });
  }
  if (b.action === "signup") {
    const name = clean(b.name, 48), email = normEmail(b.email), mob = normMob(b.mobile), batch = codeN(clean(b.batch, 30)), group = clean(b.group, 40);
    if (name.length < 2 || !/[a-zA-Zऀ-ॿ]/.test(name)) return send(res, 400, { ok: false, field: "name", error: "Please enter your full name." });
    if (!EMAIL_RE.test(email)) return send(res, 400, { ok: false, field: "email", error: "Please enter a valid email address." });
    if (!/^[6-9]\d{9}$/.test(mob)) return send(res, 400, { ok: false, field: "mobile", error: "Please enter a valid 10-digit mobile number." });
    const pe = pwProblem(b.password); if (pe) return send(res, 400, { ok: false, field: "password", error: pe });
    const throttle = PFX + "su:" + crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16);
    const [n] = await pipe(env, [["INCR", throttle], ["EXPIRE", throttle, "3600"]]); if (+n > 20) return send(res, 429, { ok: false, error: "Too many sign-ups from this network. Try again later." });
    const projects = await schedProjects(env), p = projOf(projects, batch);
    if (projects.length && !p) return send(res, 400, { ok: false, field: "batch", error: "This project code doesn't exist. Check the code with your trainer." });
    if (!projects.length && !/^[A-Z0-9-]{2,20}$/.test(batch)) return send(res, 400, { ok: false, field: "batch", error: "Please enter your project code, like P1426." });
    if (!group && groupRequired(p)) return send(res, 400, { ok: false, field: "group", error: "Your project has started, so please select your group." });
    if (!validGroup(p, group)) return send(res, 400, { ok: false, field: "group", error: "Please select a group from the list." });
    const uid = uidOf(mob), UK = PFX + "u:" + uid;
    const [hraw, emOwner] = await pipe(env, [["HGETALL", UK], ["GET", emKey(email)]]); const h = toObj(hraw);
    if (h.pw) return send(res, 409, { ok: false, field: "mobile", error: "This mobile number already has an account. Log in, or use 'Forgot password'." });
    if (emOwner && emOwner !== uid) return send(res, 409, { ok: false, field: "email", error: "This email is already registered. Log in, or use 'Forgot password'." });
    const ver = String((+h.ver || 0) + 1), now = String(Date.now());
    const cmds = [["HSET", UK, "name", name, "email", email, "group", group, "batch", batch, "last4", mob.slice(-4), "pw", pwHash(b.password), "ver", ver, "updated", now], ["HSETNX", UK, "created", now], ["SADD", PFX + "users", uid], ["SET", emKey(email), uid]];
    if (h.email && h.email !== email) cmds.push(["DEL", emKey(h.email)]);
    await pipe(env, cmds);
    const token = await newSession(env, uid, ver);
    return send(res, 200, { ok: true, token, profile: profileOut(uid, Object.assign({}, h, { name, email, group, batch, last4: mob.slice(-4) }), projects) });
  }
  if (b.action === "login") {
    const id = String(b.login || "").trim(); let uid = null;
    if (id.includes("@")) uid = await redis(env, "GET", emKey(normEmail(id)));
    else { const mob = normMob(id); if (/^[6-9]\d{9}$/.test(mob)) uid = uidOf(mob); }
    if (!uid) { await sleep(500); return send(res, 401, { ok: false, error: "No account found with this email or mobile number. Create an account first." }); }
    const F = PFX + "lf:" + uid; const [fails, hraw] = await pipe(env, [["GET", F], ["HGETALL", PFX + "u:" + uid]]); const h = toObj(hraw);
    if (+fails >= 8) return send(res, 429, { ok: false, error: "Too many wrong passwords. Wait 15 minutes or use 'Forgot password'." });
    if (!h.name) { await sleep(500); return send(res, 401, { ok: false, error: "No account found with this email or mobile number. Create an account first." }); }
    if (!h.pw) return send(res, 401, { ok: false, legacy: true, error: "You checked in before passwords existed. Choose 'Create account' with the same mobile number to set your password (your details are kept)." });
    if (!pwOk(String(b.password || ""), h.pw)) { await pipe(env, [["INCR", F], ["EXPIRE", F, "900"]]); await sleep(700); return send(res, 401, { ok: false, error: "Wrong password. Try again or use 'Forgot password'." }); }
    if (+fails) await redis(env, "DEL", F);
    const token = await newSession(env, uid, String(h.ver || "1"));
    return send(res, 200, { ok: true, token, profile: profileOut(uid, h, await schedProjects(env)) });
  }
  if (b.action === "forgot") {
    const email = normEmail(b.email); if (!EMAIL_RE.test(email)) return send(res, 400, { ok: false, error: "Please enter the email you registered with." });
    if (!process.env.RESEND_API_KEY) return send(res, 503, { ok: false, error: "Password reset by email is not switched on for this site yet. Ask your trainer to reset your password." });
    const uid = await redis(env, "GET", emKey(email));
    if (uid) {
      const T = PFX + "rstt:" + uid; const first = await redis(env, "SET", T, "1", "NX", "EX", "60");
      if (first) {
        const h = toObj(await redis(env, "HGETALL", PFX + "u:" + uid)); const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
        await redis(env, "SET", PFX + "rst:" + uid, hash("reset|" + code) + "|0", "EX", String(RESET_S));
        const r = await mailSend([{ to: email, subject: `Your password reset code: ${code}`, html: mailWrap("Reset your password", `<p>Hi ${escH(h.name || "")},</p><p>Your code to reset the password on <b>${escH(clean(b.site, 80) || "your capstone project website")}</b> is:</p><p style="font-size:30px;font-weight:700;letter-spacing:6px;color:#4c1d95">${code}</p><p>It works for 15 minutes. If you didn't ask for this, you can ignore this email.</p>`) }]);
        if (!r.ok) return send(res, 502, { ok: false, error: "Could not send the email right now (" + String(r.error).slice(0, 80) + "). Try again later or ask your trainer." });
      }
    }
    return send(res, 200, { ok: true, message: "If this email is registered, a 6-digit code is on its way. Check your inbox and spam folder." });
  }
  if (b.action === "reset") {
    const email = normEmail(b.email), code = String(b.code || "").replace(/\D/g, ""); const pe = pwProblem(b.password); if (pe) return send(res, 400, { ok: false, error: pe });
    const uid = EMAIL_RE.test(email) ? await redis(env, "GET", emKey(email)) : null; const R = uid ? PFX + "rst:" + uid : null;
    const v = R ? await redis(env, "GET", R) : null; if (!v) { await sleep(500); return send(res, 400, { ok: false, error: "This code has expired. Ask for a new code." }); }
    const [hc, tries] = String(v).split("|");
    if (hash("reset|" + code) !== hc) { if (+tries >= 4) await redis(env, "DEL", R); else await redis(env, "SET", R, hc + "|" + ((+tries) + 1), "KEEPTTL"); await sleep(600); return send(res, 400, { ok: false, error: +tries >= 4 ? "Too many wrong codes. Ask for a new code." : "Wrong code. Check the email and try again." }); }
    const h = toObj(await redis(env, "HGETALL", PFX + "u:" + uid)); const ver = String((+h.ver || 1) + 1);
    await pipe(env, [["HSET", PFX + "u:" + uid, "pw", pwHash(b.password), "ver", ver, "updated", String(Date.now())], ["DEL", R], ["DEL", PFX + "lf:" + uid]]);
    const token = await newSession(env, uid, ver);
    return send(res, 200, { ok: true, token, profile: profileOut(uid, Object.assign({}, h, { ver }), await schedProjects(env)) });
  }
  return send(res, 400, { ok: false, error: "Unknown action" });
}

async function trainerAccounts(env, req, res, b) {
  const ids = ((await redis(env, "SMEMBERS", PFX + "users")) || []).slice(0, 5000);
  const rows = ids.length ? await pipe(env, ids.map(id => ["HGETALL", PFX + "u:" + id])) : [];
  const users = ids.map((id, i) => Object.assign({ uid: id }, toObj(rows[i]))).filter(h => h.name);
  if (b.action === "accounts") {
    return send(res, 200, { ok: true, accounts: users.map(h => { let cert = null; try { cert = h.cert ? JSON.parse(h.cert) : null; } catch (e) {} return { uid: h.uid, name: h.name, email: h.email || "", last4: h.last4 || "", group: h.group || "", batch: h.batch || "", created: +h.created || 0, hasPw: !!h.pw, cert, mailed: !!h.certMailed }; }) });
  }
  if (b.action === "tresetpw") {
    const h = users.find(x => x.uid === b.uid); if (!h) return send(res, 404, { ok: false, error: "Student not found" });
    const temp = Array.from({ length: 8 }, () => "abcdefghjkmnpqrstuvwxyz23456789"[crypto.randomInt(0, 31)]).join("");
    await pipe(env, [["HSET", PFX + "u:" + h.uid, "pw", pwHash(temp), "ver", String((+h.ver || 1) + 1), "updated", String(Date.now())], ["DEL", PFX + "lf:" + h.uid]]);
    return send(res, 200, { ok: true, temp });
  }
  // certsend: issue a certificate to every student enrolled in this project code, then email the ones not emailed yet
  const code = codeN(b.code); if (!code) return send(res, 400, { ok: false, error: "Project code missing" });
  const site = clean(b.site, 80) || "Data Analyst capstone", url = siteUrl(req, b), today = istDay();
  const list = users.filter(h => codeN(h.batch) === code); if (!list.length) return send(res, 400, { ok: false, error: "No student is enrolled in " + code + " yet." });
  const cmds = [], mails = [], mailUids = []; let issued = 0;
  list.forEach(h => {
    let cert = null; try { cert = h.cert ? JSON.parse(h.cert) : null; } catch (e) {}
    if (!cert) { cert = { id: "DA-" + PFX.replace(/[^a-z]/gi, "").slice(0, 4).toUpperCase() + "-" + crypto.randomBytes(4).toString("hex").toUpperCase().slice(0, 7), date: today, code, project: site }; cmds.push(["HSET", PFX + "u:" + h.uid, "cert", JSON.stringify(cert)]); issued++; }
    if (h.email && !h.certMailed) { mailUids.push(h.uid); mails.push({ to: h.email, subject: `🎓 Your Data Analyst Capstone certificate is ready`, html: mailWrap(`Congratulations, ${escH(h.name)}! 🎉`, `<p>You have completed the <b>${escH(site)}</b> capstone project (${escH(code)}). Your certificate of completion is ready.</p><p><a href="${escH(url)}" style="display:inline-block;background:#4c1d95;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700">Download my certificate</a></p><p>Log in on the site and open <b>Dexa Coach → My Certificate</b>. Certificate ID: <b>${escH(cert.id)}</b>.</p><p>— Mahendra Singh, Data Analyst Trainer</p>`) }); }
  });
  if (cmds.length) await pipe(env, cmds);
  let emailed = 0, mailError = "";
  if (mails.length) { const r = await mailSend(mails); if (r.ok) { emailed = mails.length; await pipe(env, mailUids.map(u => ["HSET", PFX + "u:" + u, "certMailed", String(Date.now())])); } else mailError = r.error === "no_key" ? "Email is not set up (RESEND_API_KEY missing), so students see the certificate on the site after logging in." : r.error; }
  return send(res, 200, { ok: true, total: list.length, issued, emailed, noEmail: list.filter(h => !h.email).length, mailError });
}

module.exports = async function handler(req, res) {
  const env = redisEnv();
  if (!env) return send(res, 200, { configured: false, error: "Database not connected. Vercel → Storage → connect Redis (Redis Cloud free) or Upstash Redis (tick Production), then redeploy.",
    envFound: envHints(), vercelEnv: process.env.VERCEL_ENV || "" });
  try {
    if (req.method === "GET") {
      const q = new URL(req.url, "http://x").searchParams;
      if (q.get("stats")) {
        const d = istDay(); const [u, t, v] = await pipe(env, [["PFCOUNT", PFX + "v:all"], ["PFCOUNT", PFX + "v:day:" + d], ["GET", PFX + "views"]]);
        return send(res, 200, { unique: +u || 0, today: +t || 0, views: +v || 0, day: d });
      }
      const v = await redis(env, "GET", KEY_DATA);
      return send(res, 200, v ? JSON.parse(v) : { active: "", projects: [] });
    }
    if (req.method !== "POST") return send(res, 405, { ok: false, error: "Method not allowed" });
    let b; try { b = await readBody(req); } catch (e) { return send(res, 400, { ok: false, error: "Bad request" }); }

    // ---------- student visit (no PIN) ----------
    if (b.action === "visit") {
      const vid = clean(b.vid, 40); if (!/^v_[a-z0-9]{6,36}$/i.test(vid)) return send(res, 400, { ok: false, error: "Bad visitor id" });
      const name = clean(b.name, 48), group = clean(b.group, 40), batch = clean(b.batch, 30), page = clean(b.page, 30) || "home";
      const uid = /^u_[a-f0-9]{24}$/.test(String(b.uid || "")) ? b.uid : "", last4 = /^\d{4}$/.test(String(b.last4 || "")) ? b.last4 : "";
      const now = Date.now(), d = istDay(now), S = PFX + "s:" + vid;
      const cmds = [["PFADD", PFX + "v:all", vid], ["PFADD", PFX + "v:day:" + d, vid], ["EXPIRE", PFX + "v:day:" + d, String(KEEP_DAYS_S)],
                    ["INCR", PFX + "views"], ["INCR", PFX + "views:day:" + d], ["EXPIRE", PFX + "views:day:" + d, String(KEEP_DAYS_S)]];
      if (name) {
        cmds.push(["SADD", PFX + "students", vid], ["HSETNX", S, "first", String(now)],
                  ["HSET", S, "name", name, "last", String(now), "lastPage", page, ...(group ? ["group", group] : []), ...(batch ? ["batch", batch] : []), ...(uid ? ["uid", uid] : []), ...(last4 ? ["last4", last4] : [])],
                  ["HINCRBY", S, "views", "1"], ["HINCRBY", S, "p:" + page, "1"], ["SADD", S + ":days", d],
                  ["SADD", PFX + "d:" + d, vid], ["EXPIRE", PFX + "d:" + d, String(KEEP_DAYS_S)]);
      }
      await pipe(env, cmds);
      return send(res, 200, { ok: true });
    }

    // ---------- student accounts: enroll / login / password reset (no trainer PIN) ----------
    if (ACC_ACTIONS.includes(b.action)) return await accounts(env, req, res, b);

    // ---------- cloud progress (no PIN) ----------
    if (b.action === "progress" || b.action === "restore") {
      const name = clean(b.name, 48), group = clean(b.group, 40);
      if (name.length < 2) return send(res, 400, { ok: false, error: "Name required" });
      const key = (name.toLowerCase() + "|" + group.toLowerCase()).replace(/\s+/g, " ");
      if (b.action === "restore") { const v = await redis(env, "HGET", PFX + "prog", key); return send(res, 200, { ok: true, data: v ? JSON.parse(v) : null }); }
      const data = JSON.stringify(b.data || {}), sum = JSON.stringify(Object.assign({}, b.summary || {}, { ts: Date.now(), name, group }));
      if (data.length > 60000 || sum.length > 2000) return send(res, 413, { ok: false, error: "Progress too large" });
      await pipe(env, [["HSET", PFX + "prog", key, data], ["HSET", PFX + "progsum", key, sum]]);
      return send(res, 200, { ok: true });
    }

    if (b.action === "check") {   // login: username must match too
      const u = String(b.user || "").trim().toLowerCase();
      if (u !== String(process.env.ADMIN_USER || "Mahendra").trim().toLowerCase()) {
        await pipe(env, [["INCR", KEY_FAIL], ["EXPIRE", KEY_FAIL, String(FAIL_WINDOW_S)]]); await sleep(800);
        return send(res, 401, { ok: false, error: "Wrong username or password" });
      }
    }
    const c = await checkPin(env, b.pin);
    if (!c.ok) return send(res, c.code, { ok: false, error: c.error });

    if (b.action === "check") return send(res, 200, { ok: true });
    if (b.action === "accounts" || b.action === "tresetpw" || b.action === "certsend") return await trainerAccounts(env, req, res, b);
    if (b.action === "save") {
      const d = b.data;
      if (!d || !Array.isArray(d.projects)) return send(res, 400, { ok: false, error: "Bad data" });
      delete d.pinHash;
      const s = JSON.stringify(d);
      if (s.length > MAX_BYTES) return send(res, 413, { ok: false, error: "Too much data: delete old projects first" });
      await redis(env, "SET", KEY_DATA, s);
      return send(res, 200, { ok: true, saved: new Date().toISOString() });
    }
    if (b.action === "setpin") {
      const n = String(b.newPin || "");
      if (n.length < 6) return send(res, 400, { ok: false, error: "Password must be at least 6 characters" });
      await redis(env, "SET", KEY_PIN, hash(n));
      return send(res, 200, { ok: true });
    }
    if (b.action === "report") {
      const days = Math.min(Math.max(+b.days || 30, 7), 120); const now = Date.now();
      // a report costs ~100 + 2 × students database commands, so it is cached for 5 minutes (1 command when cached)
      const RC = PFX + "repcache:" + days;
      if (!b.fresh) { const c = await redis(env, "GET", RC); if (c) { try { return send(res, 200, Object.assign(JSON.parse(c), { cached: true })); } catch (e) {} } }
      const dayList = Array.from({ length: days }, (_, i) => istDay(now - (days - 1 - i) * 86400000));
      const head = await pipe(env, [["SMEMBERS", PFX + "students"], ["PFCOUNT", PFX + "v:all"], ["GET", PFX + "views"],
        ...dayList.map(d => ["PFCOUNT", PFX + "v:day:" + d]), ...dayList.map(d => ["GET", PFX + "views:day:" + d]), ...dayList.map(d => ["SCARD", PFX + "d:" + d])]);
      const ids = (head[0] || []).slice(0, 3000), n = dayList.length;
      const daily = dayList.map((d, i) => ({ day: d, unique: +head[3 + i] || 0, views: +head[3 + n + i] || 0, named: +head[3 + 2 * n + i] || 0 }));
      const rows = await pipe(env, ids.flatMap(id => [["HGETALL", PFX + "s:" + id], ["SMEMBERS", PFX + "s:" + id + ":days"]]));
      const students = ids.map((id, i) => {
        const raw = rows[2 * i] || []; const h = {};
        if (Array.isArray(raw)) for (let k = 0; k < raw.length; k += 2) h[raw[k]] = raw[k + 1]; else Object.assign(h, raw);
        const pages = Object.keys(h).filter(k => k.startsWith("p:")).map(k => [k.slice(2), +h[k]]).sort((a, b) => b[1] - a[1]);
        return { vid: id, uid: h.uid || "", last4: h.last4 || "", name: h.name || "", group: h.group || "", batch: h.batch || "", first: +h.first || 0, last: +h.last || 0, views: +h.views || 0,
                 days: (rows[2 * i + 1] || []).sort(), lastPage: h.lastPage || "", pages: pages.slice(0, 6) };
      }).filter(s => s.name);
      const ps = await redis(env, "HGETALL", PFX + "progsum"); const progress = {};
      if (Array.isArray(ps)) for (let k = 0; k < ps.length; k += 2) { try { progress[ps[k]] = JSON.parse(ps[k + 1]); } catch (e) {} }
      else if (ps) for (const k in ps) { try { progress[k] = JSON.parse(ps[k]); } catch (e) {} }
      const out = { ok: true, today: istDay(now), unique: +head[1] || 0, views: +head[2] || 0, daily, students, progress, at: now };
      try { const sv = JSON.stringify(out); if (sv.length < 900000) await redis(env, "SET", RC, sv, "EX", "300"); } catch (e) {}
      return send(res, 200, out);
    }
    return send(res, 400, { ok: false, error: "Unknown action" });
  } catch (e) {
    return send(res, 500, { ok: false, error: "Server error: " + e.message });
  }
};
