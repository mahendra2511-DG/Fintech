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
 *    POST {action:"lookup", mobile}                  → saved student profile for this mobile (one-time login on any device)
 *    POST {action:"register", mobile, name, group, batch}  → save/update the profile (batch must be a trainer-created project code)
 *         The mobile number itself is never stored: only a salted hash (the student's id) and its last 4 digits.
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
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}
// names only (never values) of env vars that look database-related, to help debug "not connected"
const envHints = () => Object.keys(process.env).filter(k => /KV|REDIS|UPSTASH/i.test(k)).sort();
async function redis(env, ...cmd) {
  const r = await fetch(env.url, { method: "POST", headers: { Authorization: "Bearer " + env.token, "Content-Type": "application/json" }, body: JSON.stringify(cmd) });
  const j = await r.json(); if (j.error) throw new Error(j.error); return j.result;
}
async function pipe(env, cmds) {
  if (!cmds.length) return [];
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

module.exports = async function handler(req, res) {
  const env = redisEnv();
  if (!env) return send(res, 200, { configured: false, error: "Database not connected. Vercel → Storage → connect Upstash Redis (tick Production), then redeploy.",
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

    // ---------- one-time student login by mobile number (no PIN) ----------
    if (b.action === "lookup" || b.action === "register") {
      const mob = String(b.mobile || "").replace(/\D/g, "").replace(/^(?:91|0)(?=\d{10}$)/, "");
      if (!/^[6-9]\d{9}$/.test(mob)) return send(res, 400, { ok: false, error: "Enter a valid 10-digit mobile number." });
      const uid = "u_" + crypto.createHash("sha256").update(SALT + "|mobile|" + mob, "utf8").digest("hex").slice(0, 24);
      const UK = PFX + "u:" + uid;
      if (b.action === "lookup") {
        const h = toObj(await redis(env, "HGETALL", UK));
        return send(res, 200, { ok: true, uid, last4: mob.slice(-4), found: !!h.name, profile: h.name ? { name: h.name, group: h.group || "", batch: h.batch || "" } : null });
      }
      const name = clean(b.name, 48), group = clean(b.group, 40), batch = clean(b.batch, 30).toUpperCase().replace(/\s+/g, "");
      if (name.length < 2 || !group || !batch) return send(res, 400, { ok: false, error: "Name, project code and group are required." });
      const sv = await redis(env, "GET", KEY_DATA);
      if (sv) { let codes = []; try { codes = (JSON.parse(sv).projects || []).map(p => String(p.code || "").toUpperCase().replace(/\s+/g, "")); } catch (e) {}
        if (codes.length && !codes.includes(batch)) return send(res, 400, { ok: false, error: "This project code doesn't exist. Check the code with your trainer." }); }
      const now = String(Date.now());
      await pipe(env, [["HSET", UK, "name", name, "group", group, "batch", batch, "last4", mob.slice(-4), "updated", now], ["HSETNX", UK, "created", now], ["SADD", PFX + "users", uid]]);
      return send(res, 200, { ok: true, uid, last4: mob.slice(-4), profile: { name, group, batch } });
    }

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
