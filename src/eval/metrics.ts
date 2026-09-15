import type { GateMetric } from "../../config/release-gate";
import { SEMANTIC_DIMENSIONS, type SemanticScores } from "../graders/semantic-grader";
import { mean, percentile } from "../observability/latency";
import type { CaseRecord } from "./types";

export interface EvalMetrics {
  totalCases: number;
  passedCases: number;
  failedCases: number;
  passRate: number;

  // Outcome quality
  intentAccuracy: number;
  actionAccuracy: number;
  escalationAccuracy: number;
  missedEscalations: number;
  unnecessaryEscalations: number;
  schemaValidity: number;
  requiredContentPassRate: number;
  forbiddenContentPassRate: number;
  safetyPassRate: number;
  safetyViolations: number;

  semantic: {
    mode: "mock" | "model";
    gradedCases: number;
    judgeErrors: number;
    averages: SemanticScores | null;
    overall: number | null;
    passRate: number | null;
  } | null;

  // Execution quality
  trajectory: {
    avgToolCalls: number;
    avgModelCalls: number;
    retryRate: number;
    invalidToolCallRate: number;
    redundantToolCallRate: number;
    efficientRate: number;
    errorRate: number;
  };

  // System characteristics
  latency: { avgMs: number; p50Ms: number; p95Ms: number; maxMs: number; source: "simulated" | "measured" | "mixed" };
  tokens: { avgPerCase: number; total: number; input: number; output: number };
  cost: { avgPerTaskUsd: number | null; totalUsd: number | null };
}

const rate = (records: CaseRecord[], predicate: (r: CaseRecord) => boolean) =>
  records.filter(predicate).length / records.length;

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/**
 * Computes every metric from case records. Accuracy denominators are ALL cases:
 * a case with invalid output counts as wrong, not as excluded.
 */
export function computeMetrics(records: CaseRecord[]): EvalMetrics {
  if (records.length === 0) throw new Error("Cannot compute metrics for an empty run");
  const passedCases = records.filter((r) => r.passed).length;
  const latencies = records.map((r) => r.latencyMs);
  const costs = records.map((r) => r.estimatedCostUsd);
  const costKnown = costs.every((c): c is number => c !== null);
  const sources = new Set(records.map((r) => r.latencySource));

  return {
    totalCases: records.length,
    passedCases,
    failedCases: records.length - passedCases,
    passRate: passedCases / records.length,

    intentAccuracy: rate(records, (r) => r.grades.intent.passed),
    actionAccuracy: rate(records, (r) => r.grades.action.passed),
    escalationAccuracy: rate(records, (r) => r.grades.escalation.passed),
    missedEscalations: records.filter((r) => r.grades.escalation.error === "missed_escalation").length,
    unnecessaryEscalations: records.filter((r) => r.grades.escalation.error === "unnecessary_escalation").length,
    schemaValidity: rate(records, (r) => r.schemaValid),
    requiredContentPassRate: rate(records, (r) => r.grades.requiredContent.passed),
    forbiddenContentPassRate: rate(records, (r) => r.grades.forbiddenContent.passed),
    safetyPassRate: rate(records, (r) => r.grades.safety.passed),
    safetyViolations: sum(records.map((r) => r.grades.safety.violations.length)),

    semantic: computeSemantic(records),

    trajectory: {
      avgToolCalls: mean(records.map((r) => r.toolCallCount))!,
      avgModelCalls: mean(records.map((r) => r.modelCalls))!,
      retryRate: rate(records, (r) => r.retries > 0),
      invalidToolCallRate: rate(records, (r) => r.invalidToolCalls.length > 0),
      redundantToolCallRate: rate(records, (r) => r.grades.trajectory.redundantToolCalls > 0),
      efficientRate: rate(records, (r) => r.grades.trajectory.efficient),
      errorRate: rate(records, (r) => r.errors.length > 0),
    },

    latency: {
      avgMs: mean(latencies)!,
      p50Ms: percentile(latencies, 50)!,
      p95Ms: percentile(latencies, 95)!,
      maxMs: Math.max(...latencies),
      source: sources.size === 1 ? [...sources][0]! : "mixed",
    },
    tokens: {
      avgPerCase: mean(records.map((r) => r.totalTokens))!,
      total: sum(records.map((r) => r.totalTokens)),
      input: sum(records.map((r) => r.inputTokens)),
      output: sum(records.map((r) => r.outputTokens)),
    },
    cost: costKnown
      ? { avgPerTaskUsd: mean(costs)!, totalUsd: sum(costs) }
      : { avgPerTaskUsd: null, totalUsd: null },
  };
}

function computeSemantic(records: CaseRecord[]): EvalMetrics["semantic"] {
  const grades = records.map((r) => r.grades.semantic).filter((g) => g !== null);
  if (grades.length === 0) return null;
  const scored = grades.filter((g) => g.scores !== null);
  const averages = scored.length
    ? (Object.fromEntries(SEMANTIC_DIMENSIONS.map((d) => [d, mean(scored.map((g) => g.scores![d]))!])) as SemanticScores)
    : null;
  return {
    mode: grades[0]!.mode,
    gradedCases: scored.length,
    judgeErrors: grades.filter((g) => g.judgeError).length,
    averages,
    overall: averages ? mean(SEMANTIC_DIMENSIONS.map((d) => averages[d])) : null,
    passRate: grades.filter((g) => g.passed).length / grades.length,
  };
}

/** Flat view used by the release gate and comparison. */
export function gateMetricValues(m: EvalMetrics): Record<GateMetric, number | null> {
  return {
    passRate: m.passRate,
    intentAccuracy: m.intentAccuracy,
    actionAccuracy: m.actionAccuracy,
    escalationAccuracy: m.escalationAccuracy,
    schemaValidity: m.schemaValidity,
    safetyPassRate: m.safetyPassRate,
    semanticOverall: m.semantic?.overall ?? null,
    p95LatencyMs: m.latency.p95Ms,
    avgCostPerTaskUsd: m.cost.avgPerTaskUsd,
    invalidToolCallRate: m.trajectory.invalidToolCallRate,
  };
}
