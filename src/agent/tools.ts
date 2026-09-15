import { TOOL_ACTIONS } from "../schemas/agent-response";
import { stableHash } from "../observability/hash";

/**
 * Sandboxed, fictional tools. The agent can only invoke names present in
 * this registry — model output is never evaluated, executed or used as a path.
 * All data is fake and derived deterministically from the case input.
 */

export type ToolName = (typeof TOOL_ACTIONS)[number];

export interface ToolExecution {
  ok: boolean;
  output: unknown;
  /** Simulated tool latency, so trajectories have realistic cost. */
  latencyMs: number;
}

type ToolHandler = (seed: number) => unknown;

const handlers: Record<ToolName, ToolHandler> = {
  lookup_transaction: (seed) => ({
    transactions: [
      { id: `txn_${seed % 100000}`, amount: 49.99, status: "settled" },
      { id: `txn_${(seed + 1) % 100000}`, amount: 49.99, status: seed % 2 ? "pending" : "settled" },
    ],
  }),
  lookup_order: (seed) => ({
    orderId: `A-${1000 + (seed % 9000)}`,
    status: ["processing", "shipped", "delivered"][seed % 3],
  }),
  check_refund_policy: (seed) => ({
    eligible: seed % 3 !== 0,
    windowDays: 30,
    note: "Eligibility is decided by the refunds team after policy check.",
  }),
  open_fraud_case: (seed) => ({ caseId: `FRD-${seed % 100000}`, status: "open" }),
  escalate_to_human: (seed) => ({ ticketId: `ESC-${seed % 100000}`, queue: "tier-2" }),
};

export function isKnownTool(name: string): name is ToolName {
  return Object.hasOwn(handlers, name);
}

export function executeTool(name: string, contextKey: string): ToolExecution {
  const seed = stableHash(`${name}:${contextKey}`);
  const latencyMs = 60 + (seed % 140);
  if (!isKnownTool(name)) {
    return { ok: false, output: { error: `Unknown tool "${name}"` }, latencyMs: 0 };
  }
  return { ok: true, output: handlers[name](seed), latencyMs };
}
