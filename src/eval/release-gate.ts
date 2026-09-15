import { releaseGate as defaultCriteria, type GateCriterion } from "../../config/release-gate";
import { formatUnit } from "../reporting/format";
import { gateMetricValues, type EvalMetrics } from "./metrics";

export interface CriterionResult extends GateCriterion {
  actual: number | null;
  status: "pass" | "fail" | "skipped";
  message: string;
}

export interface GateResult {
  passed: boolean;
  criteria: CriterionResult[];
  failures: CriterionResult[];
}

const EPSILON = 1e-9;

function meets(actual: number, op: GateCriterion["op"], threshold: number): boolean {
  switch (op) {
    case ">=":
      return actual >= threshold - EPSILON;
    case "<=":
      return actual <= threshold + EPSILON;
    case "==":
      return Math.abs(actual - threshold) <= EPSILON;
  }
}

const FAILED_OP: Record<GateCriterion["op"], string> = { ">=": "<", "<=": ">", "==": "≠" };

/**
 * A metric the run did not produce (e.g. semantic score with the judge off)
 * is reported as skipped — visible, but not silently passed or failed.
 */
export function evaluateReleaseGate(metrics: EvalMetrics, criteria: GateCriterion[] = defaultCriteria): GateResult {
  const values = gateMetricValues(metrics);
  const results = criteria.map((criterion): CriterionResult => {
    const actual = values[criterion.metric];
    const required = formatUnit(criterion.unit, criterion.threshold);
    if (actual === null) {
      return { ...criterion, actual, status: "skipped", message: `${criterion.label}: not measured in this run` };
    }
    const shown = formatUnit(criterion.unit, actual);
    return meets(actual, criterion.op, criterion.threshold)
      ? { ...criterion, actual, status: "pass", message: `${criterion.label}: ${shown} ${criterion.op} ${required}` }
      : { ...criterion, actual, status: "fail", message: `${criterion.label}: ${shown} ${FAILED_OP[criterion.op]} required ${required}` };
  });
  const failures = results.filter((r) => r.status === "fail");
  return { passed: failures.length === 0, criteria: results, failures };
}
