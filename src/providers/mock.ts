import { stableHash } from "../observability/hash";
import { estimateTokens } from "../observability/cost";
import { decide, detectPromptFeatures } from "./mock-behaviour";
import type { ChatMessage, CompletionRequest, CompletionResult, ModelProvider } from "./types";

/**
 * Deterministic offline provider. Same input + same prompt => same output,
 * token counts and simulated latency. See mock-behaviour.ts for how the
 * simulated behaviour depends on the system prompt.
 */
export class MockProvider implements ModelProvider {
  readonly name = "mock";
  readonly model = "mock-support-sim-1";

  async complete({ messages }: CompletionRequest): Promise<CompletionResult> {
    const system = messages.find((m) => m.role === "system")?.content ?? "";
    const customerMessage = extractCustomerMessage(messages);
    const plan = decide(customerMessage, detectPromptFeatures(system));

    const toolTurnsDone = messages.filter((m) => m.role === "user" && /^TOOL_(RESULT|ERROR)/.test(m.content)).length;
    const repairsRequested = messages.filter((m) => m.role === "user" && m.content.startsWith("FORMAT_ERROR")).length;

    let text: string;
    const nextTool = plan.toolPlan[toolTurnsDone];
    if (nextTool !== undefined) {
      text = JSON.stringify({ type: "tool_call", tool: nextTool, arguments: {} });
    } else if (repairsRequested < plan.formatFaults) {
      text = malformedFinal(plan.final, repairsRequested);
    } else {
      text = JSON.stringify({ type: "final", ...plan.final });
    }

    const inputTokens = messages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
    const outputTokens = estimateTokens(text);
    const jitter = stableHash(`latency:${customerMessage}:${messages.length}`) % 300;
    const simulatedLatencyMs = Math.round(250 + inputTokens * 0.15 + outputTokens * 10 + jitter);

    return { text, usage: { inputTokens, outputTokens }, simulatedLatencyMs };
  }
}

function extractCustomerMessage(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === "user")?.content ?? "";
  const match = first.match(/<customer_message>\n?([\s\S]*?)\n?<\/customer_message>/);
  const raw = match?.[1] ?? first;
  return raw.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
}

function malformedFinal(final: object, attempt: number): string {
  if (attempt === 0) {
    return `Sure! Here is my answer:\n\`\`\`json\n${JSON.stringify({ type: "final", ...final })}\n\`\`\``;
  }
  return JSON.stringify({ type: "final", ...final, confidence: "high" });
}
