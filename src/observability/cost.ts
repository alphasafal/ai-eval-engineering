import type { ModelPricing } from "../../config/model-pricing";
import type { TokenUsage } from "../providers/types";

/** Rough token estimate (~4 characters per token). Used only when a provider reports no usage. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/** Returns USD cost, or null when no pricing is configured (unknown cost is not zero cost). */
export function estimateCostUsd(usage: TokenUsage, pricing: ModelPricing | undefined): number | null {
  if (!pricing) return null;
  return (
    (usage.inputTokens / 1_000_000) * pricing.inputPerMillionUsd +
    (usage.outputTokens / 1_000_000) * pricing.outputPerMillionUsd
  );
}
