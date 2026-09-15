import type { GradeResult, GraderInput } from "./types";

export function gradeIntent({ testCase, run }: GraderInput): GradeResult {
  const actual = run.output?.intent;
  const expected = testCase.expected.intent;
  if (actual === expected) return { passed: true };
  return { passed: false, reason: `expected intent ${expected}, got ${actual ?? "none"}` };
}
