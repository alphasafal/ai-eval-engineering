import type { GradeResult, GraderInput } from "./types";

export function gradeAction({ testCase, run }: GraderInput): GradeResult {
  const actual = run.output?.action;
  const expected = testCase.expected.action;
  if (actual === expected) return { passed: true };
  return { passed: false, reason: `expected action ${expected}, got ${actual ?? "none"}` };
}
