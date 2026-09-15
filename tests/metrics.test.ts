import { describe, expect, it } from "vitest";
import { computeMetrics, gateMetricValues } from "../src/eval/metrics";
import { estimateCostUsd } from "../src/observability/cost";
import { mean, percentile } from "../src/observability/latency";
import { makeCase, makeOutput, makeRecord } from "./helpers";

describe("percentile", () => {
  it("interpolates linearly between closest ranks (NumPy default)", () => {
    expect(percentile([1, 2, 3, 4], 50)).toBe(2.5);
    expect(percentile([1, 2, 3, 4], 95)).toBeCloseTo(3.85, 10);
    expect(percentile([4, 1, 3, 2], 0)).toBe(1);
    expect(percentile([4, 1, 3, 2], 100)).toBe(4);
  });

  it("handles single values and empty input", () => {
    expect(percentile([700], 95)).toBe(700);
    expect(percentile([], 50)).toBeNull();
    expect(mean([])).toBeNull();
  });

  it("P95 exposes a slow tail that the average hides", () => {
    const latencies = [...Array.from({ length: 19 }, () => 1000), 9000];
    expect(mean(latencies)).toBe(1400);
    expect(percentile(latencies, 95)).toBeCloseTo(1400, 5);
    expect(percentile(latencies, 99)).toBeGreaterThan(7000);
  });

  it("rejects invalid percentiles", () => {
    expect(() => percentile([1], 101)).toThrow(RangeError);
  });
});

describe("cost", () => {
  it("prices input and output tokens per million", () => {
    const cost = estimateCostUsd({ inputTokens: 2_000_000, outputTokens: 500_000 }, { inputPerMillionUsd: 1, outputPerMillionUsd: 4, note: "" });
    expect(cost).toBe(4);
  });

  it("returns null instead of zero when pricing is unknown", () => {
    expect(estimateCostUsd({ inputTokens: 10, outputTokens: 10 }, undefined)).toBeNull();
  });
});

describe("computeMetrics", () => {
  it("computes accuracy over all cases, counting invalid output as wrong", async () => {
    const records = await Promise.all([
      makeRecord({ trace: { latencyMs: 1000 } }),
      makeRecord({ trace: { latencyMs: 2000 } }),
      makeRecord({ output: makeOutput({ action: "respond_without_tool" }), trace: { latencyMs: 3000 } }),
      makeRecord({ output: null, trace: { latencyMs: 4000, errors: ["invalid_output"], retries: 1 } }),
    ]);
    const m = computeMetrics(records);

    expect(m.totalCases).toBe(4);
    expect(m.passedCases).toBe(2);
    expect(m.intentAccuracy).toBe(0.75);
    expect(m.actionAccuracy).toBe(0.5);
    expect(m.schemaValidity).toBe(0.75);
    expect(m.trajectory.retryRate).toBe(0.25);
    expect(m.latency.avgMs).toBe(2500);
    expect(m.latency.p50Ms).toBe(2500);
    expect(m.latency.p95Ms).toBeCloseTo(3850, 6);
    expect(m.latency.maxMs).toBe(4000);
  });

  it("counts missed and unnecessary escalations", async () => {
    const needsHuman = makeCase({ expected: { escalate: true } });
    const records = await Promise.all([
      makeRecord({ testCase: needsHuman }),
      makeRecord({ output: makeOutput({ escalate: true }) }),
      makeRecord(),
    ]);
    const m = computeMetrics(records);
    expect(m.missedEscalations).toBe(1);
    expect(m.unnecessaryEscalations).toBe(1);
    expect(m.escalationAccuracy).toBeCloseTo(1 / 3, 10);
  });

  it("sums tokens and cost, and reports unknown cost as null", async () => {
    const priced = await Promise.all([makeRecord({ costUsd: 0.002 }), makeRecord({ costUsd: 0.004 })]);
    const m = computeMetrics(priced);
    expect(m.tokens.total).toBe(2200);
    expect(m.cost.totalUsd).toBeCloseTo(0.006, 10);
    expect(m.cost.avgPerTaskUsd).toBeCloseTo(0.003, 10);

    const unpriced = await Promise.all([makeRecord({ costUsd: 0.002 }), makeRecord({ costUsd: null })]);
    expect(computeMetrics(unpriced).cost.totalUsd).toBeNull();
  });

  it("reports safety pass rate and violation count", async () => {
    const records = await Promise.all([
      makeRecord({ output: makeOutput({ response: "We will refund you in 3 days." }) }),
      makeRecord(),
    ]);
    const m = computeMetrics(records);
    expect(m.safetyPassRate).toBe(0.5);
    expect(m.safetyViolations).toBe(1);
  });

  it("omits semantic metrics when the judge is off", async () => {
    const m = computeMetrics([await makeRecord()]);
    expect(m.semantic).toBeNull();
    expect(gateMetricValues(m).semanticOverall).toBeNull();
  });

  it("refuses to compute metrics for an empty run", () => {
    expect(() => computeMetrics([])).toThrow(/empty/);
  });
});
