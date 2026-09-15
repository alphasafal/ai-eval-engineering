import type { PromptVersion } from "./protocol";
import { promptV1 } from "./v1";
import { promptV2 } from "./v2";

export const PROMPTS: Record<string, PromptVersion> = { v1: promptV1, v2: promptV2 };

export function getPrompt(id: string): PromptVersion {
  const prompt = PROMPTS[id.toLowerCase()];
  if (!prompt) throw new Error(`Unknown prompt version "${id}". Available: ${Object.keys(PROMPTS).join(", ")}`);
  return prompt;
}
