// Anthropic Messages API provider. Set ANTHROPIC_API_KEY and CONF_MODEL (e.g. a Claude Sonnet id).
import { CONFIG } from "../config.mjs";

export async function complete({ system, prompt, model, maxTokens = 8000 }) {
  const useModel = model || CONFIG.model || "claude-sonnet-4-5";
  if (!CONFIG.anthropicKey) throw new Error("ANTHROPIC_API_KEY not set");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": CONFIG.anthropicKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: useModel,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text().catch(() => "")}`);
  const data = await res.json();
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("");
  return {
    text,
    usage: { inputTokens: data.usage?.input_tokens || 0, outputTokens: data.usage?.output_tokens || 0 },
    model: useModel,
  };
}
