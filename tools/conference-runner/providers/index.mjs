// Provider selector — keeps the runner architecture independent of the LLM vendor/model.
import { CONFIG } from "../config.mjs";
import * as mock from "./mock.mjs";
import * as anthropic from "./anthropic.mjs";
import * as openai from "./openai.mjs";

const PROVIDERS = { mock, anthropic, openai };

export function getProvider(name) {
  const p = PROVIDERS[name || CONFIG.provider || "mock"];
  if (!p) throw new Error(`Unknown provider "${name}". Use one of: ${Object.keys(PROVIDERS).join(", ")}`);
  return p;
}

export async function complete(opts, providerName) {
  return getProvider(providerName).complete(opts);
}
