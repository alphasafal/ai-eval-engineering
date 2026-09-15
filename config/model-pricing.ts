/**
 * Model pricing used for cost estimates.
 *
 * Provider pricing changes. The values below are NOT authoritative:
 * look up your provider's current price list and set them yourself.
 * If a provider/model pair is missing, cost is reported as "n/a" rather
 * than silently treated as free.
 */

export interface ModelPricing {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
  /** Why this price is here and whether it is real. */
  note: string;
}

export const modelPricing: Record<string, ModelPricing> = {
  // Illustrative only — lets the mock demo show cost trade-offs.
  "mock:mock-support-sim-1": {
    inputPerMillionUsd: 0.5,
    outputPerMillionUsd: 1.5,
    note: "ILLUSTRATIVE mock pricing. Not a real provider price.",
  },

  // Add your real models here, e.g.:
  // "anthropic:<model-id>": { inputPerMillionUsd: 0, outputPerMillionUsd: 0, note: "from provider pricing page, YYYY-MM-DD" },
  // "openai:<model-id>":    { inputPerMillionUsd: 0, outputPerMillionUsd: 0, note: "from provider pricing page, YYYY-MM-DD" },
};

export function getPricing(provider: string, model: string): ModelPricing | undefined {
  return modelPricing[`${provider}:${model}`];
}
