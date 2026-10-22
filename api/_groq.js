/* Shared Groq helper for /api/ask and /api/review (files starting with "_" are not public routes on Vercel).
   Groq retires models often, so the preferred lists below are checked against Groq's live model list and any other
   suitable model on the account is tried next. Override with env GROQ_MODEL / GROQ_VISION_MODEL. */
const TEXT = ["openai/gpt-oss-120b", "qwen/qwen3.8-27b", "openai/gpt-oss-20b"];
const VISION = ["qwen/qwen3.8-27b"];
const SKIP = /guard|whisper|tts|orpheus|compound|playai|distil|safeguard|prompt-guard|allam/i;
let cache = { t: 0, ids: null };

async function listModels(key) {
  if (cache.ids && Date.now() - cache.t < 10 * 60 * 1000) return cache.ids;
  try {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), 6000);
    const r = await fetch("https://api.groq.com/openai/v1/models", { headers: { Authorization: "Bearer " + key }, signal: ac.signal });
    clearTimeout(t); const j = await r.json().catch(() => ({}));
    if (r.ok && Array.isArray(j.data)) { cache = { t: Date.now(), ids: j.data.filter(m => m && m.active !== false).map(m => m.id) }; return cache.ids; }
  } catch (e) {}
  return null;
}
async function candidates(key, vision) {
  const env = vision ? process.env.GROQ_VISION_MODEL : process.env.GROQ_MODEL;
  let out = [...(env ? [env] : []), ...(vision ? VISION : TEXT)];
  const ids = await listModels(key);
  if (ids) {
    out = out.filter(m => m === env || ids.includes(m));
    const like = vision ? /qwen3\.\d|vision|vl\b|-vl|scout|maverick|llava|gemma-3|pixtral|llama-4/i : /gpt-oss|qwen|llama|kimi|deepseek|mistral|gemma/i;
    out = out.concat(ids.filter(id => !SKIP.test(id) && like.test(id)));
  }
  return [...new Set(out)].slice(0, 5);
}
function extras(model) {
  if (/gpt-oss/i.test(model)) return { reasoning_effort: "low" };
  if (/qwen3/i.test(model)) return { reasoning_format: "hidden" };
  return {};
}
/* one chat call; drops optional parameters the model rejects and retries once */
async function chat(key, model, body, ms) {
  let payload = Object.assign({ model }, body, extras(model));
  for (let attempt = 0; attempt < 3; attempt++) {
    const ac = new AbortController(); const t = setTimeout(() => ac.abort(), ms || 30000);
    let r, j;
    try {
      r = await fetch("https://api.groq.com/openai/v1/chat/completions", { method: "POST", signal: ac.signal,
        headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      j = await r.json().catch(() => ({}));
    } catch (e) { return { status: 504, error: "timeout" }; } finally { clearTimeout(t); }
    const msg = String((j && j.error && (j.error.message || j.error.code)) || "");
    if (r.status === 400 && /reasoning_(effort|format)|include_reasoning/i.test(msg) && (payload.reasoning_effort || payload.reasoning_format)) { payload = Object.assign({}, payload); delete payload.reasoning_effort; delete payload.reasoning_format; continue; }
    if (r.status === 400 && /response_format|json/i.test(msg) && payload.response_format) { payload = Object.assign({}, payload); delete payload.response_format; continue; }
    const m = j && j.choices && j.choices[0] && j.choices[0].message;
    const content = m && typeof m.content === "string" ? m.content.replace(/<think>[\s\S]*?<\/think>/g, "").trim() : "";
    return { status: r.status, content, error: msg.slice(0, 200) };
  }
  return { status: 400, error: "rejected parameters" };
}
module.exports = { candidates, chat };
