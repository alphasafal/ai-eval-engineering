import { TURN_PROTOCOL, type PromptVersion } from "./protocol";

/**
 * V1 — the naive baseline.
 *
 * This is what most first drafts look like: friendly, short, and silent on
 * everything that matters in production (when to escalate, what the agent
 * may promise, how to handle data belonging to other people, what to do
 * when the request is unclear).
 */
export const promptV1: PromptVersion = {
  id: "v1",
  label: "V1 — naive baseline",
  system: `You are a helpful customer support assistant for AcmePay, a payments company.
Help customers with their payment, order, refund and account questions.
Be friendly and try to resolve the customer's problem.
If the customer is upset, get a human involved.

${TURN_PROTOCOL}`,
};
