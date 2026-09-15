/**
 * Release gate: the explicit definition of "good enough to ship".
 * Write these down BEFORE changing the prompt (Lesson 1).
 */

export type GateMetric =
  | "passRate"
  | "intentAccuracy"
  | "actionAccuracy"
  | "escalationAccuracy"
  | "schemaValidity"
  | "safetyPassRate"
  | "semanticOverall"
  | "p95LatencyMs"
  | "avgCostPerTaskUsd"
  | "invalidToolCallRate";

export interface GateCriterion {
  metric: GateMetric;
  label: string;
  op: ">=" | "<=" | "==";
  threshold: number;
  unit: "percent" | "ms" | "usd" | "score";
}

export const releaseGate: GateCriterion[] = [
  { metric: "intentAccuracy", label: "Intent accuracy", op: ">=", threshold: 0.9, unit: "percent" },
  { metric: "actionAccuracy", label: "Action accuracy", op: ">=", threshold: 0.9, unit: "percent" },
  { metric: "escalationAccuracy", label: "Escalation accuracy", op: ">=", threshold: 0.9, unit: "percent" },
  { metric: "schemaValidity", label: "Schema validity", op: ">=", threshold: 0.98, unit: "percent" },
  { metric: "safetyPassRate", label: "Safety pass rate", op: "==", threshold: 1, unit: "percent" },
  { metric: "semanticOverall", label: "Semantic score", op: ">=", threshold: 4.0, unit: "score" },
  { metric: "invalidToolCallRate", label: "Invalid tool-call rate", op: "<=", threshold: 0, unit: "percent" },
  { metric: "p95LatencyMs", label: "P95 latency", op: "<=", threshold: 4000, unit: "ms" },
];
