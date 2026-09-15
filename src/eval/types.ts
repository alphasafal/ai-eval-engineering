import type { GateResult } from "./release-gate";
import type { EvalMetrics } from "./metrics";
import type { FailureAnalysis } from "./failure-analysis";
import type { ContentGrade } from "../graders/content-grader";
import type { EscalationGrade } from "../graders/escalation-grader";
import type { SafetyGrade } from "../graders/safety-grader";
import type { SemanticGrade } from "../graders/semantic-grader";
import type { TrajectoryGrade } from "../graders/trajectory-grader";
import type { GradeResult } from "../graders/types";
import type { TraceStep } from "../observability/trace";
import type { Action, AgentResponse, Intent } from "../schemas/agent-response";

export interface CaseGrades {
  schema: GradeResult;
  intent: GradeResult;
  action: GradeResult;
  escalation: EscalationGrade;
  requiredContent: ContentGrade;
  forbiddenContent: ContentGrade;
  safety: SafetyGrade;
  semantic: SemanticGrade | null;
  /** Execution quality. Reported separately; does not affect `passed`. */
  trajectory: TrajectoryGrade;
}

export const FAILURE_TYPES = [
  "schema_error",
  "intent_mismatch",
  "action_mismatch",
  "escalation_mismatch",
  "safety_violation",
  "content_failure",
  "semantic_quality",
  "other",
] as const;
export type FailureType = (typeof FAILURE_TYPES)[number];

/** One row of observability data per case. Everything the reports show is derived from these. */
export interface CaseRecord {
  caseId: string;
  category: string;
  tags: string[];
  input: string;
  promptVersion: string;
  provider: string;
  model: string;

  intent: Intent | null;
  expectedIntent: Intent;
  action: Action | null;
  expectedAction: Action;
  escalate: boolean | null;
  expectedEscalate: boolean;
  confidence: number | null;
  output: AgentResponse | null;
  rawOutput: string;
  schemaValid: boolean;

  latencyMs: number;
  latencySource: "simulated" | "measured";
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number | null;

  toolsCalled: string[];
  toolCallCount: number;
  invalidToolCalls: string[];
  retries: number;
  modelCalls: number;
  errors: string[];
  executionSteps: TraceStep[];

  grades: CaseGrades;
  passed: boolean;
  failureTypes: FailureType[];
  failureReasons: string[];
}

export interface RunMeta {
  runId: string;
  promptVersion: string;
  promptLabel: string;
  provider: string;
  model: string;
  isMock: boolean;
  judgeMode: "mock" | "model" | "off";
  datasetPath: string;
  datasetFingerprint: string;
  caseCount: number;
  startedAt: string;
  finishedAt: string;
  pricingNote: string | null;
}

export interface EvalRun {
  meta: RunMeta;
  metrics: EvalMetrics;
  gate: GateResult;
  failures: FailureAnalysis;
  records: CaseRecord[];
}
