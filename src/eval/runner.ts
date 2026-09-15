import { randomUUID } from "node:crypto";
import { getPricing } from "../../config/model-pricing";
import { runAgent, type AgentRun } from "../agent/agent";
import { estimateCostUsd } from "../observability/cost";
import type { PromptVersion } from "../prompts/protocol";
import type { ModelProvider } from "../providers/types";
import type { EvalCase } from "../schemas/eval-case";
import type { Dataset } from "./dataset";
import { analyzeFailures } from "./failure-analysis";
import { classifyFailures, gradeCase, type JudgeConfig } from "./grade-case";
import { computeMetrics } from "./metrics";
import { evaluateReleaseGate } from "./release-gate";
import type { CaseGrades, CaseRecord, EvalRun } from "./types";

export interface RunOptions {
  dataset: Dataset;
  prompt: PromptVersion;
  provider: ModelProvider;
  judge: JudgeConfig;
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
}

export async function runEvaluation(options: RunOptions): Promise<EvalRun> {
  const { dataset, prompt, provider, judge } = options;
  const startedAt = new Date().toISOString();
  const pricing = getPricing(provider.name, provider.model);

  let done = 0;
  const records = await mapWithConcurrency(dataset.cases, options.concurrency ?? 4, async (testCase) => {
    const run = await runAgent(provider, prompt, testCase.input);
    const grades = await gradeCase(testCase, run, judge);
    const costUsd = estimateCostUsd({ inputTokens: run.trace.inputTokens, outputTokens: run.trace.outputTokens }, pricing);
    options.onProgress?.(++done, dataset.cases.length);
    return buildCaseRecord(testCase, run, grades, { promptVersion: prompt.id, provider: provider.name, model: provider.model, costUsd });
  });

  const metrics = computeMetrics(records);
  return {
    meta: {
      runId: randomUUID(),
      promptVersion: prompt.id,
      promptLabel: prompt.label,
      provider: provider.name,
      model: provider.model,
      isMock: provider.name === "mock",
      judgeMode: judge.mode,
      datasetPath: dataset.path,
      datasetFingerprint: dataset.fingerprint,
      caseCount: dataset.cases.length,
      startedAt,
      finishedAt: new Date().toISOString(),
      pricingNote: pricing?.note ?? null,
    },
    metrics,
    gate: evaluateReleaseGate(metrics),
    failures: analyzeFailures(records),
    records,
  };
}

export interface RecordContext {
  promptVersion: string;
  provider: string;
  model: string;
  costUsd: number | null;
}

/** Flattens one graded agent run into the observability record saved to results/. */
export function buildCaseRecord(testCase: EvalCase, run: AgentRun, grades: CaseGrades, ctx: RecordContext): CaseRecord {
  const { types, reasons } = classifyFailures(grades);
  const { trace, output } = run;

  return {
    caseId: testCase.id,
    category: testCase.category,
    tags: testCase.tags,
    input: testCase.input,
    promptVersion: ctx.promptVersion,
    provider: ctx.provider,
    model: ctx.model,

    intent: output?.intent ?? null,
    expectedIntent: testCase.expected.intent,
    action: output?.action ?? null,
    expectedAction: testCase.expected.action,
    escalate: output?.escalate ?? null,
    expectedEscalate: testCase.expected.escalate,
    confidence: output?.confidence ?? null,
    output,
    rawOutput: run.rawOutput,
    schemaValid: grades.schema.passed,

    latencyMs: trace.latencyMs,
    latencySource: trace.latencySource,
    inputTokens: trace.inputTokens,
    outputTokens: trace.outputTokens,
    totalTokens: trace.inputTokens + trace.outputTokens,
    estimatedCostUsd: ctx.costUsd,

    toolsCalled: trace.toolsCalled,
    toolCallCount: grades.trajectory.toolCallCount,
    invalidToolCalls: trace.invalidToolCalls,
    retries: trace.retries,
    modelCalls: trace.modelCalls,
    errors: trace.errors,
    executionSteps: trace.steps,

    grades,
    passed: types.length === 0,
    failureTypes: types,
    failureReasons: reasons,
  };
}

/** Order-preserving concurrency pool. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]!);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return results;
}
