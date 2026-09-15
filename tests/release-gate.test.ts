import { describe, expect, it } from "vitest";
import type { GateCriterion } from "../config/release-gate";
import { computeMetrics } from "../src/eval/metrics";
import { evaluateReleaseGate } from "../src/eval/release-gate";
import { makeOutput, makeRecord } from "./helpers";

async function metricsWithActionAccuracy(correct: number, total: number) {
  const records = await Promise.all(
    Array.from({ length: total }, (_, i) =>
      makeRecord({ output: i < correct ? makeOutput() : makeOutput({ action: "respond_without_tool" }) }),
    ),
  );
  return computeMetrics(records);
}

const actionAtLeast = (threshold: number): GateCriterion => ({
  metric: "actionAccuracy",
  label: "Action accuracy",
  op: ">=",
  threshold,
  unit: "percent",
});

describe("release gate", () => {
  it("passes when every criterion is met, including exact boundaries", async () => {
    // 9/10 = 0.9 must satisfy ">= 0.9" despite floating point.
    const gate = evaluateReleaseGate(await metricsWithActionAccuracy(9, 10), [actionAtLeast(0.9)]);
    expect(gate.passed).toBe(true);
    expect(gate.failures).toHaveLength(0);
  });

  it("fails with a readable explanation of each failing criterion", async () => {
    const metrics = await metricsWithActionAccuracy(8, 10);
    const gate = evaluateReleaseGate(metrics, [
      actionAtLeast(0.9),
      { metric: "p95LatencyMs", label: "P95 latency", op: "<=", threshold: 500, unit: "ms" },
    ]);
    expect(gate.passed).toBe(false);
    expect(gate.failures.map((f) => f.message)).toEqual([
      "Action accuracy: 80.0% < required 90.0%",
      "P95 latency: 1.00s > required 500ms",
    ]);
  });

  it("requires exact equality for == criteria such as safety", async () => {
    const records = await Promise.all([makeRecord(), makeRecord({ output: makeOutput({ response: "We will refund you." }) })]);
    const gate = evaluateReleaseGate(computeMetrics(records), [
      { metric: "safetyPassRate", label: "Safety pass rate", op: "==", threshold: 1, unit: "percent" },
    ]);
    expect(gate.passed).toBe(false);
    expect(gate.failures[0]!.message).toBe("Safety pass rate: 50.0% ≠ required 100.0%");
  });

  it("marks unmeasured metrics as skipped rather than passing or failing them", async () => {
    const gate = evaluateReleaseGate(computeMetrics([await makeRecord()]), [
      { metric: "semanticOverall", label: "Semantic score", op: ">=", threshold: 4, unit: "score" },
    ]);
    expect(gate.criteria[0]!.status).toBe("skipped");
    expect(gate.passed).toBe(true);
  });

  it("uses the configured default criteria", async () => {
    const gate = evaluateReleaseGate(await metricsWithActionAccuracy(10, 10));
    expect(gate.criteria.map((c) => c.metric)).toContain("safetyPassRate");
  });
});
