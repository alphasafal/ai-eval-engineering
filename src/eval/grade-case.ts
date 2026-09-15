import type { AgentRun } from "../agent/agent";
import { gradeAction } from "../graders/action-grader";
import { gradeForbiddenContent, gradeRequiredContent } from "../graders/content-grader";
import { gradeEscalation } from "../graders/escalation-grader";
import { gradeIntent } from "../graders/intent-grader";
import { gradeSafety } from "../graders/safety-grader";
import { gradeSchema } from "../graders/schema-grader";
import { mockSemanticGrade, modelSemanticGrade, type SemanticGrade } from "../graders/semantic-grader";
import { gradeTrajectory } from "../graders/trajectory-grader";
import type { ModelProvider } from "../providers/types";
import type { EvalCase } from "../schemas/eval-case";
import type { CaseGrades, FailureType } from "./types";

export type JudgeConfig = { mode: "off" } | { mode: "mock" } | { mode: "model"; provider: ModelProvider };

/** Runs every grader. Deterministic graders first; the semantic judge only adds what code cannot check. */
export async function gradeCase(testCase: EvalCase, run: AgentRun, judge: JudgeConfig): Promise<CaseGrades> {
  const input = { testCase, run };
  const deterministic = {
    schema: gradeSchema(input),
    intent: gradeIntent(input),
    action: gradeAction(input),
    escalation: gradeEscalation(input),
    requiredContent: gradeRequiredContent(input),
    forbiddenContent: gradeForbiddenContent(input),
    safety: gradeSafety(input),
    trajectory: gradeTrajectory(input),
  };

  let semantic: SemanticGrade | null = null;
  if (judge.mode === "mock") {
    semantic = mockSemanticGrade(testCase, run.output, {
      intentCorrect: deterministic.intent.passed,
      actionCorrect: deterministic.action.passed,
      escalationCorrect: deterministic.escalation.passed,
      requiredContentPresent: deterministic.requiredContent.passed,
      forbiddenContentPresent: !deterministic.forbiddenContent.passed,
      safetyViolations: deterministic.safety.violations.length,
      toolsCalled: run.trace.toolsCalled,
    });
  } else if (judge.mode === "model") {
    semantic = await modelSemanticGrade(judge.provider, testCase, run.output);
  }

  return { ...deterministic, semantic };
}

/** Maps grades to failure categories. A schema error masks the downstream mismatches it causes. */
export function classifyFailures(grades: CaseGrades): { types: FailureType[]; reasons: string[] } {
  if (!grades.schema.passed) {
    return { types: ["schema_error"], reasons: [grades.schema.reason ?? "invalid output"] };
  }
  const checks: [FailureType, { passed: boolean; reason?: string } | null][] = [
    ["intent_mismatch", grades.intent],
    ["action_mismatch", grades.action],
    ["escalation_mismatch", grades.escalation],
    ["safety_violation", grades.safety],
    ["content_failure", grades.requiredContent],
    ["content_failure", grades.forbiddenContent],
    ["semantic_quality", grades.semantic],
  ];
  const types = new Set<FailureType>();
  const reasons: string[] = [];
  for (const [type, grade] of checks) {
    if (grade && !grade.passed) {
      types.add(type);
      if (grade.reason) reasons.push(grade.reason);
    }
  }
  return { types: [...types], reasons };
}
