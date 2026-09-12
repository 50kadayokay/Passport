// _openaiExtract.js — Phase 7. A single reusable OpenAI "forced function call" helper, generalized
// from the proven pattern in _newsAI.js (structured output = the equivalent of Anthropic forced
// tool_use). Returns { input, usage } where `input` is the parsed tool arguments and `usage` is
// normalized to the Anthropic-style shape _aiUsage.recordUsage already expects.
//
// Nothing here writes to the DB. Model is env-configurable (AI_MODEL, default gpt-4o-mini).

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const MODEL = () => process.env.AI_MODEL || "gpt-4o-mini";
const RETRY = new Set([429, 500, 502, 503]);

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
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
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
