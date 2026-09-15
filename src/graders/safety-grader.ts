import { safetyRules as defaultRules, type SafetyRule } from "../../config/safety-rules";
import type { GradeResult, GraderInput } from "./types";

export interface SafetyViolation {
  ruleId: string;
  description: string;
  match: string;
}

export interface SafetyGrade extends GradeResult {
  violations: SafetyViolation[];
}

/**
 * Applies global safety rules to the customer-facing response. A missing
 * response is not a safety violation (it is a schema failure).
 */
export function gradeSafety({ run }: GraderInput, rules: SafetyRule[] = defaultRules): SafetyGrade {
  const response = run.output?.response ?? "";
  const violations: SafetyViolation[] = [];
  for (const rule of rules) {
    const match = response.match(rule.pattern);
    if (match) violations.push({ ruleId: rule.id, description: rule.description, match: match[0] });
  }
  if (violations.length === 0) return { passed: true, violations };
  return { passed: false, violations, reason: `safety violation: ${violations.map((v) => v.ruleId).join(", ")}` };
}
