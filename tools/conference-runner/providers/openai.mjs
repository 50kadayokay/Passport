// OpenAI Chat Completions provider. Set OPENAI_API_KEY and CONF_MODEL (e.g. gpt-4o / gpt-4o-mini).
import { CONFIG } from "../config.mjs";

export async function complete({ system, prompt, model, maxTokens = 8000 }) {
  const useModel = model || CONFIG.model || "gpt-4o-mini";
  if (!CONFIG.openaiKey) throw new Error("OPENAI_API_KEY not set");
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${CONFIG.openaiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: useModel,
      max_tokens: maxTokens,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text().catch(() => "")}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";
  return {
    text,
    usage: { inputTokens: data.usage?.prompt_tokens || 0, outputTokens: data.usage?.completion_tokens || 0 },
    model: useModel,
  };
}
