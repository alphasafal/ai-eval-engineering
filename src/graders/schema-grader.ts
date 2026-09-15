import type { GradeResult, GraderInput } from "./types";

/**
 * Did the agent produce a final answer that passed schema validation?
 * The agent validates each turn with Zod; a null output means it never did.
 */
export function gradeSchema({ run }: GraderInput): GradeResult {
  if (run.output !== null) return { passed: true };
  const cause = run.trace.errors.at(-1) ?? "no final answer";
  return { passed: false, reason: cause };
}
