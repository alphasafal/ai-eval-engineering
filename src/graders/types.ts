import type { AgentRun } from "../agent/agent";
import type { EvalCase } from "../schemas/eval-case";

export interface GradeResult {
  passed: boolean;
  reason?: string;
}

export interface GraderInput {
  testCase: EvalCase;
  run: AgentRun;
}
