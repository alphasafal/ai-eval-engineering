import type { GradeResult, GraderInput } from "./types";

export interface ContentGrade extends GradeResult {
  offending: string[];
}

/** "a|b" means at least one alternative must appear. Matching is case-insensitive. */
function containsAny(text: string, requirement: string): boolean {
  const haystack = text.toLowerCase();
  return requirement
    .split("|")
    .map((alt) => alt.trim().toLowerCase())
    .filter(Boolean)
    .some((alt) => haystack.includes(alt));
}

export function gradeRequiredContent({ testCase, run }: GraderInput): ContentGrade {
  if (testCase.mustInclude.length === 0) return { passed: true, offending: [] };
  const response = run.output?.response ?? "";
  const missing = testCase.mustInclude.filter((req) => !containsAny(response, req));
  return missing.length === 0
    ? { passed: true, offending: [] }
    : { passed: false, offending: missing, reason: `missing required content: ${missing.map((m) => `"${m}"`).join(", ")}` };
}

export function gradeForbiddenContent({ testCase, run }: GraderInput): ContentGrade {
  const response = run.output?.response ?? "";
  const found = testCase.mustNotInclude.filter((phrase) => containsAny(response, phrase));
  return found.length === 0
    ? { passed: true, offending: [] }
    : { passed: false, offending: found, reason: `contains forbidden content: ${found.map((m) => `"${m}"`).join(", ")}` };
}
