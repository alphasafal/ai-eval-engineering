import type { PromptVersion } from "../prompts/protocol";
import type { ChatMessage, ModelProvider } from "../providers/types";
import { AgentResponseSchema, ModelTurnSchema, type AgentResponse, type ModelTurn } from "../schemas/agent-response";
import { TraceRecorder, type Trace } from "../observability/trace";
import { executeTool, isKnownTool } from "./tools";

export interface AgentOptions {
  maxSteps: number;
  maxFormatRetries: number;
}

export const DEFAULT_AGENT_OPTIONS: AgentOptions = { maxSteps: 6, maxFormatRetries: 1 };

export interface AgentRun {
  /** Validated final answer, or null if the agent never produced one. */
  output: AgentResponse | null;
  /** Last raw model text, kept for debugging failed runs. */
  rawOutput: string;
  trace: Trace;
}

/**
 * Runs the support agent: model turn -> (tool call -> tool result)* -> final.
 * Every model turn is parsed and validated; nothing the model says is executed
 * except a lookup in the fixed tool registry.
 */
export async function runAgent(
  provider: ModelProvider,
  prompt: PromptVersion,
  customerMessage: string,
  options: AgentOptions = DEFAULT_AGENT_OPTIONS,
): Promise<AgentRun> {
  const recorder = new TraceRecorder();
  const messages: ChatMessage[] = [
    { role: "system", content: prompt.system },
    { role: "user", content: wrapCustomerMessage(customerMessage) },
  ];
  let rawOutput = "";

  for (let step = 0; step < options.maxSteps; step++) {
    const turn = await callModel(provider, messages, recorder);
    if (turn === null) return { output: null, rawOutput, trace: recorder.finish() };
    rawOutput = turn.text;
    messages.push({ role: "assistant", content: turn.text });

    const parsed = parseModelTurn(turn.text);
    if (!parsed.ok) {
      if (recorder.finish().retries >= options.maxFormatRetries) {
        recorder.error(`invalid_output: ${parsed.error}`);
        return { output: null, rawOutput, trace: recorder.finish() };
      }
      recorder.retry(parsed.error);
      messages.push({
        role: "user",
        content: `FORMAT_ERROR: ${parsed.error}. Reply with a single raw JSON object that follows the protocol.`,
      });
      continue;
    }

    const modelTurn = parsed.turn;
    if (modelTurn.type === "final") {
      recorder.final();
      const { type: _type, ...answer } = modelTurn;
      return { output: AgentResponseSchema.parse(answer), rawOutput, trace: recorder.finish() };
    }

    messages.push({ role: "user", content: handleToolCall(modelTurn.tool, customerMessage, recorder) });
  }

  recorder.error(`max_steps_exceeded: no final answer after ${options.maxSteps} steps`);
  return { output: null, rawOutput, trace: recorder.finish() };
}

/** Prevents the customer from closing the delimiter and injecting "system" text. */
export function wrapCustomerMessage(text: string): string {
  const escaped = text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return `<customer_message>\n${escaped}\n</customer_message>`;
}

type ParseResult = { ok: true; turn: ModelTurn } | { ok: false; error: string };

/** Strict parsing: raw JSON only. Prose around the JSON is a format failure, by design. */
export function parseModelTurn(text: string): ParseResult {
  let json: unknown;
  try {
    json = JSON.parse(text.trim());
  } catch {
    return { ok: false, error: "output is not valid JSON" };
  }
  const result = ModelTurnSchema.safeParse(json);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ");
    return { ok: false, error: `schema violation (${issues})` };
  }
  return { ok: true, turn: result.data };
}

async function callModel(provider: ModelProvider, messages: ChatMessage[], recorder: TraceRecorder) {
  const started = performance.now();
  try {
    const result = await provider.complete({ messages, temperature: 0 });
    const measured = performance.now() - started;
    const simulated = result.simulatedLatencyMs !== undefined;
    recorder.modelCall(
      Math.round(result.simulatedLatencyMs ?? measured),
      result.usage.inputTokens,
      result.usage.outputTokens,
      simulated,
    );
    return result;
  } catch (err) {
    recorder.error(`provider_error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

function handleToolCall(tool: string, contextKey: string, recorder: TraceRecorder): string {
  if (!isKnownTool(tool)) {
    recorder.invalidToolCall(tool);
    return `TOOL_ERROR ${JSON.stringify(tool)}: unknown tool. Use only the tools listed.`;
  }
  const execution = executeTool(tool, contextKey);
  recorder.toolCall(tool, execution.latencyMs);
  return `TOOL_RESULT ${tool}: ${JSON.stringify(execution.output)}`;
}
