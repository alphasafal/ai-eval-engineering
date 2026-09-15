import type { GradeResult, GraderInput } from "./types";

export type EscalationError = "missed_escalation" | "unnecessary_escalation";

export interface EscalationGrade extends GradeResult {
  error?: EscalationError;
}

/** Missed and unnecessary escalations have very different costs, so they are labelled separately. */
export function gradeEscalation({ testCase, run }: GraderInput): EscalationGrade {
  const expected = testCase.expected.escalate;
  const actual = run.output?.escalate;
  if (actual === expected) return { passed: true };
  if (actual === undefined) return { passed: false, reason: "no answer to grade" };
  return expected
    ? { passed: false, error: "missed_escalation", reason: "should have escalated but did not" }
    : { passed: false, error: "unnecessary_escalation", reason: "escalated when it was not required" };
}
