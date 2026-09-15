import type { Unit } from "../reporting/format";
import type { EvalMetrics } from "./metrics";
import type { EvalRun } from "./types";

export interface ComparisonRow {
  label: string;
  unit: Unit;
  higherIsBetter: boolean;
  baseline: number | null;
  candidate: number | null;
  delta: number | null;
  verdict: "improved" | "regressed" | "unchanged" | "n/a";
}

export interface CaseChange {
  caseId: string;
  input: string;
  baselineReasons: string[];
  candidateReasons: string[];
}

export interface Comparison {
  baseline: { version: string; label: string; gatePassed: boolean };
  candidate: { version: string; label: string; gatePassed: boolean };
  sameDataset: boolean;
  rows: ComparisonRow[];
  /** Failed in baseline, pass in candidate. */
  fixed: CaseChange[];
  /** Passed in baseline, fail in candidate — the cases a pure average hides. */
  regressed: CaseChange[];
  stillFailing: CaseChange[];
}

type RowSpec = [label: string, unit: Unit, higherIsBetter: boolean, pick: (m: EvalMetrics) => number | null];

const ROWS: RowSpec[] = [
  ["Pass rate", "percent", true, (m) => m.passRate],
  ["Intent accuracy", "percent", true, (m) => m.intentAccuracy],
  ["Action accuracy", "percent", true, (m) => m.actionAccuracy],
  ["Escalation accuracy", "percent", true, (m) => m.escalationAccuracy],
  ["Schema validity", "percent", true, (m) => m.schemaValidity],
  ["Safety pass rate", "percent", true, (m) => m.safetyPassRate],
  ["Semantic score", "score", true, (m) => m.semantic?.overall ?? null],
  ["Efficient trajectories", "percent", true, (m) => m.trajectory.efficientRate],
  ["Avg tool calls", "count", false, (m) => m.trajectory.avgToolCalls],
  ["Retry rate", "percent", false, (m) => m.trajectory.retryRate],
  ["Average latency", "ms", false, (m) => m.latency.avgMs],
  ["P95 latency", "ms", false, (m) => m.latency.p95Ms],
  ["Avg tokens / task", "count", false, (m) => m.tokens.avgPerCase],
  ["Avg cost / task", "usd", false, (m) => m.cost.avgPerTaskUsd],
  ["Total cost", "usd", false, (m) => m.cost.totalUsd],
];

const EPSILON = 1e-9;

export function compareRuns(baseline: EvalRun, candidate: EvalRun): Comparison {
  const rows = ROWS.map(([label, unit, higherIsBetter, pick]): ComparisonRow => {
    const a = pick(baseline.metrics);
    const b = pick(candidate.metrics);
    if (a === null || b === null) return { label, unit, higherIsBetter, baseline: a, candidate: b, delta: null, verdict: "n/a" };
    const delta = b - a;
    const verdict = Math.abs(delta) < EPSILON ? "unchanged" : delta > 0 === higherIsBetter ? "improved" : "regressed";
    return { label, unit, higherIsBetter, baseline: a, candidate: b, delta, verdict };
  });

  const baselineById = new Map(baseline.records.map((r) => [r.caseId, r]));
  const fixed: CaseChange[] = [];
  const regressed: CaseChange[] = [];
  const stillFailing: CaseChange[] = [];
  for (const cand of candidate.records) {
    const base = baselineById.get(cand.caseId);
    if (!base) continue;
    const change = { caseId: cand.caseId, input: cand.input, baselineReasons: base.failureReasons, candidateReasons: cand.failureReasons };
    if (!base.passed && cand.passed) fixed.push(change);
    else if (base.passed && !cand.passed) regressed.push(change);
    else if (!base.passed && !cand.passed) stillFailing.push(change);
  }

  return {
    baseline: { version: baseline.meta.promptVersion, label: baseline.meta.promptLabel, gatePassed: baseline.gate.passed },
    candidate: { version: candidate.meta.promptVersion, label: candidate.meta.promptLabel, gatePassed: candidate.gate.passed },
    sameDataset: baseline.meta.datasetFingerprint === candidate.meta.datasetFingerprint,
    rows,
    fixed,
    regressed,
    stillFailing,
  };
}
