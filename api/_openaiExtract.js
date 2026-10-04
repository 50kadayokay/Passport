// _openaiExtract.js — Phase 7. A single reusable OpenAI "forced function call" helper, generalized
// from the proven pattern in _newsAI.js (structured output = the equivalent of Anthropic forced
// tool_use). Returns { input, usage } where `input` is the parsed tool arguments and `usage` is
// normalized to the Anthropic-style shape _aiUsage.recordUsage already expects.
//
// Nothing here writes to the DB. Model is env-configurable (AI_MODEL, default gpt-4o-mini).

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = () => process.env.AI_MODEL || "gpt-4o-mini";
const RETRY = new Set([429, 500, 502, 503]);

// ---------------------------------------------------------------------------
// CENTRAL MODEL SELECTION
//
// One place to change what each task runs on. Chosen per task rather than
// defaulting to the biggest model everywhere:
//
//   ask        Answering from supplied company context. The retrieval does the
//              hard part -- the model summarises passages it was handed and
//              refuses when they do not cover the question. That is not a
//              reasoning-heavy job, and this path is the high-volume one.
//
//   compose    Drafting and revising a release. Same reasoning load, longer
//              output; prose quality matters more than depth.
//
//   extract    Pulling structured facts out of a published release. Low volume
//              (once per publication) but the output becomes DURABLE COMPANY
//              KNOWLEDGE that later feeds supersession and profile proposals.
//              Accuracy is worth more than the cost saving here, so this one
//              gets the larger model.
//
// Each is env-overridable without touching code.
// ---------------------------------------------------------------------------
export const AI_MODELS = {
  ask:     () => process.env.AI_MODEL_ASK     || process.env.AI_MODEL || "gpt-4o-mini",
  compose: () => process.env.AI_MODEL_COMPOSE || process.env.AI_MODEL || "gpt-4o-mini",
  extract: () => process.env.AI_MODEL_EXTRACT || "gpt-4o",
};

// A request that never returns is worse than one that fails: the CEO watches a
// spinner with no way to know. Bounded, and surfaced as a clear error.
const TIMEOUT_MS = () => Number(process.env.AI_TIMEOUT_MS || 45000);

async function postOpenAI(body, { timeoutMs } = {}) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs || TIMEOUT_MS());
  try {
    return await fetch(OPENAI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Plain-text completion. The prose counterpart to callOpenAITool.
 *
 * Returns { text, usage, model }. Retries the same transient statuses the tool
 * helper does. The caller owns the prompt; this owns transport, timeout, retry
 * and error shape, so no provider detail leaks into MineIQ business logic.
 */
export async function callOpenAIText({ system, user, model, maxTokens = 2000, temperature = 0.2, timeoutMs }) {
  const body = {
    model: model || MODEL(),
    max_tokens: maxTokens,
    temperature,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  };
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    let res;
    try {
      res = await postOpenAI(body, { timeoutMs });
    } catch (e) {
      // Abort or network. Both transient enough to retry once or twice.
      lastErr = new Error(e?.name === "AbortError" ? "The AI request timed out." : "Could not reach the AI service.");
      await new Promise((r) => setTimeout(r, 600 * 2 ** attempt));
      continue;
    }
    if (res.ok) {
      const j = await res.json();
      const text = String(j.choices?.[0]?.message?.content || "").trim();
      if (!text) throw new Error("The AI returned an empty response.");
      const u = j.usage || {};
      return {
        text,
        model: j.model || body.model,
        usage: { input_tokens: u.prompt_tokens ?? 0, output_tokens: u.completion_tokens ?? 0 },
      };
    }
    // Never surface the provider's raw body: it can echo the prompt, which here
    // contains company documents.
    lastErr = new Error(`AI request failed (${res.status}).`);
    if (!RETRY.has(res.status) || attempt === 2) throw lastErr;
    await new Promise((r) => setTimeout(r, 600 * 2 ** attempt));
  }
  throw lastErr;
}

// tool = { name, description, parameters(JSON schema) }
export async function callOpenAITool({ system, user, tool, model, maxTokens = 8000, imageUrl = "" }) {
  if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY missing");
  // A vision turn passes the image alongside the text (gpt-4o / gpt-4o-mini are vision-capable).
  const userContent = imageUrl
    ? [{ type: "text", text: user }, { type: "image_url", image_url: { url: imageUrl, detail: "low" } }]
    : user;
  const body = {
    model: model || MODEL(),
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ],
    tools: [{ type: "function", function: { name: tool.name, description: tool.description, parameters: tool.parameters } }],
    tool_choice: { type: "function", function: { name: tool.name } },
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await postOpenAI(body);
    if (res.ok) {
      const j = await res.json();
      const call = j.choices?.[0]?.message?.tool_calls?.[0];
      if (!call?.function?.arguments) throw new Error("no tool_call in response");
      let input;
      try { input = JSON.parse(call.function.arguments); }
      catch { throw new Error("tool_call arguments were not valid JSON"); }
      const u = j.usage || {};
      return {
        input,
        usage: {
          input_tokens: u.prompt_tokens || 0,
          output_tokens: u.completion_tokens || 0,
          cache_read_input_tokens: u.prompt_tokens_details?.cached_tokens || 0,
        },
      };
    }
    if (!RETRY.has(res.status) || attempt === 2) {
      const b = await res.text().catch(() => "");
      throw new Error(`openai HTTP ${res.status}: ${String(b).slice(0, 300)}`);
    }
    await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
  }
}

// --- Anthropic path (same forced-tool contract, same {input, usage} return) -------------------
// The pipeline is provider-agnostic: extraction logic doesn't care which vendor answers, only that
// a valid tool-call comes back. This mirrors callOpenAITool exactly (forced tool_use = OpenAI's
// forced function call). Model IDs arrive in OpenAI terms (undefined = cheap pass, "gpt-4o" = the
// deep numeric pass); we map them to Claude equivalents so callers stay unchanged.
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTH_MODEL = () => process.env.ANTHROPIC_MODEL || "claude-sonnet-5";
const ANTH_DEEP = () => process.env.ANTHROPIC_MODEL_DEEP || ANTH_MODEL();
const pickAnthModel = (m) => (!m || /mini/i.test(m)) ? ANTH_MODEL() : (/gpt/i.test(m) ? ANTH_DEEP() : m);

export async function callAnthropicTool({ system, user, tool, model, maxTokens = 8000 }) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY missing");
  const body = {
    model: pickAnthModel(model),
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
    tools: [{ name: tool.name, description: tool.description, input_schema: tool.parameters }],
    tool_choice: { type: "tool", name: tool.name },
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const j = await res.json();
      const call = (j.content || []).find((c) => c.type === "tool_use");
      if (!call || !call.input) throw new Error("no tool_use in response");
      const u = j.usage || {};
      return {
        input: call.input,
        usage: {
          input_tokens: u.input_tokens || 0,
          output_tokens: u.output_tokens || 0,
          cache_read_input_tokens: u.cache_read_input_tokens || 0,
        },
      };
    }
    if (!RETRY.has(res.status) || attempt === 2) {
      const b = await res.text().catch(() => "");
      throw new Error(`anthropic HTTP ${res.status}: ${String(b).slice(0, 300)}`);
    }
    await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
  }
}

// Provider dispatcher: prefer OpenAI when its key is present (the original design), otherwise use
// Anthropic. Callers use this so the extraction runs on whatever key the deployment actually has.
export async function callLLMTool(args) {
  if (process.env.OPENAI_API_KEY) return callOpenAITool(args);
  if (process.env.ANTHROPIC_API_KEY) return callAnthropicTool(args);
  throw new Error("No LLM key: set OPENAI_API_KEY or ANTHROPIC_API_KEY");
}
