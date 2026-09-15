import { AnthropicProvider } from "./anthropic";
import { MockProvider } from "./mock";
import { OpenAICompatibleProvider } from "./openai-compatible";
import type { ModelProvider } from "./types";

type Env = Record<string, string | undefined>;

function required(env: Env, key: string, provider: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is required when using provider "${provider}". See .env.example.`);
  return value;
}

/** Builds a provider from environment variables. Keys are read here and nowhere else. */
export function createProvider(providerName: string | undefined, model: string | undefined, env: Env): ModelProvider {
  const name = (providerName ?? "mock").trim().toLowerCase() || "mock";
  switch (name) {
    case "mock":
      return new MockProvider();
    case "openai":
      if (!model) throw new Error(`A model name is required for provider "openai" (AI_MODEL / JUDGE_MODEL).`);
      return new OpenAICompatibleProvider(model, required(env, "OPENAI_API_KEY", name), env.OPENAI_BASE_URL || undefined);
    case "anthropic":
      if (!model) throw new Error(`A model name is required for provider "anthropic" (AI_MODEL / JUDGE_MODEL).`);
      return new AnthropicProvider(model, required(env, "ANTHROPIC_API_KEY", name));
    default:
      throw new Error(`Unknown provider "${name}". Use mock, openai or anthropic.`);
  }
}
