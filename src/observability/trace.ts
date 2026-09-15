/**
 * Execution trace for a single agent run. The outcome tells you WHAT the
 * agent answered; the trace tells you HOW it got there (Lesson 5).
 */

export type TraceStepType = "model_call" | "tool_call" | "invalid_tool_call" | "format_retry" | "error" | "final";

export interface TraceStep {
  type: TraceStepType;
  name?: string;
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
  detail?: string;
}

export interface Trace {
  steps: TraceStep[];
  toolsCalled: string[];
  invalidToolCalls: string[];
  retries: number;
  errors: string[];
  modelCalls: number;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  latencySource: "simulated" | "measured";
}

export class TraceRecorder {
  private readonly trace: Trace = {
    steps: [],
    toolsCalled: [],
    invalidToolCalls: [],
    retries: 0,
    errors: [],
    modelCalls: 0,
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
    latencySource: "measured",
  };

  modelCall(latencyMs: number, inputTokens: number, outputTokens: number, simulated: boolean): void {
    this.trace.modelCalls++;
    this.trace.inputTokens += inputTokens;
    this.trace.outputTokens += outputTokens;
    if (simulated) this.trace.latencySource = "simulated";
    this.push({ type: "model_call", latencyMs, inputTokens, outputTokens });
  }

  toolCall(name: string, latencyMs: number): void {
    this.trace.toolsCalled.push(name);
    this.push({ type: "tool_call", name, latencyMs });
  }

  invalidToolCall(name: string): void {
    this.trace.invalidToolCalls.push(name);
    this.push({ type: "invalid_tool_call", name, latencyMs: 0 });
  }

  retry(detail: string): void {
    this.trace.retries++;
    this.push({ type: "format_retry", latencyMs: 0, detail });
  }

  error(detail: string): void {
    this.trace.errors.push(detail);
    this.push({ type: "error", latencyMs: 0, detail });
  }

  final(): void {
    this.push({ type: "final", latencyMs: 0 });
  }

  finish(): Trace {
    return this.trace;
  }

  private push(step: TraceStep): void {
    this.trace.steps.push(step);
    this.trace.latencyMs += step.latencyMs;
  }
}
