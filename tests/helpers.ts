import type { AgentRun } from "../src/agent/agent";
import { analyzeFailures } from "../src/eval/failure-analysis";
import { gradeCase } from "../src/eval/grade-case";
import { computeMetrics } from "../src/eval/metrics";
import { evaluateReleaseGate } from "../src/eval/release-gate";
import { buildCaseRecord } from "../src/eval/runner";
import type { CaseRecord, EvalRun } from "../src/eval/types";
import type { Trace } from "../src/observability/trace";
import type { AgentResponse } from "../src/schemas/agent-response";
import { EvalCaseSchema, type EvalCase } from "../src/schemas/eval-case";

type CaseInput = Omit<Partial<EvalCase>, "expected"> & { expected?: Partial<EvalCase["expected"]> };

export function makeCase(overrides: CaseInput = {}): EvalCase {
  const { expected, ...rest } = overrides;
  return EvalCaseSchema.parse({
    id: "case-001",
    category: "refund_request",
    input: "I want a refund.",
    ...rest,
    expected: { intent: "refund_request", action: "check_refund_policy", escalate: false, ...expected },
  });
}

export function makeOutput(overrides: Partial<AgentResponse> = {}): AgentResponse {
  return {
    intent: "refund_request",
    action: "check_refund_policy",
    escalate: false,
    confidence: 0.9,
    response: "I've checked your purchase against our refund policy. Could you share the order number?",
    ...overrides,
  };
}

export function makeTrace(overrides: Partial<Trace> = {}): Trace {
  return {
    steps: [],
    toolsCalled: [],
    invalidToolCalls: [],
    retries: 0,
    errors: [],
    modelCalls: 2,
    inputTokens: 1000,
    outputTokens: 100,
    latencyMs: 1000,
    latencySource: "measured",
    ...overrides,
  };
}

/** An agent run whose trace, by default, executed exactly the final action. */
export function makeRun(output: AgentResponse | null, trace: Partial<Trace> = {}): AgentRun {
  const defaultTools = output && output.action !== "respond_without_tool" ? [output.action] : [];
  return {
    output,
    rawOutput: output ? JSON.stringify({ type: "final", ...output }) : "not json",
    trace: makeTrace({ toolsCalled: defaultTools, ...trace }),
  };
}

export interface RecordInput {
  testCase?: EvalCase;
  output?: AgentResponse | null;
  trace?: Partial<Trace>;
  costUsd?: number | null;
}

/** Builds a record through the real graders and record builder (judge off). */
export async function makeRecord({ testCase = makeCase(), output, trace, costUsd = 0.001 }: RecordInput = {}): Promise<CaseRecord> {
  const run = makeRun(output === undefined ? makeOutput() : output, trace);
  const grades = await gradeCase(testCase, run, { mode: "off" });
  return buildCaseRecord(testCase, run, grades, { promptVersion: "test", provider: "test", model: "test", costUsd });
}

export function makeEvalRun(records: CaseRecord[], version: string, fingerprint = "abc12345"): EvalRun {
  const metrics = computeMetrics(records);
  return {
    meta: {
      runId: `run-${version}`,
      promptVersion: version,
      promptLabel: version.toUpperCase(),
      provider: "test",
      model: "test",
      isMock: false,
      judgeMode: "off",
      datasetPath: "dataset/test.jsonl",
      datasetFingerprint: fingerprint,
      caseCount: records.length,
      startedAt: "2026-01-01T00:00:00.000Z",
      finishedAt: "2026-01-01T00:00:01.000Z",
      pricingNote: null,
    },
    metrics,
    gate: evaluateReleaseGate(metrics),
    failures: analyzeFailures(records),
    records,
  };
}
