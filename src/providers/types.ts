/**
 * Provider abstraction. The agent, graders and runner only depend on this
 * interface — never on a vendor SDK.
 */

export type ChatRole = "system" | "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export interface CompletionRequest {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface CompletionResult {
  text: string;
  usage: TokenUsage;
  /**
   * Set only by simulated providers. Real providers leave it undefined and
   * the caller measures wall-clock latency instead.
   */
  simulatedLatencyMs?: number;
}

export interface ModelProvider {
  /** Provider id, e.g. "mock", "openai", "anthropic". */
  readonly name: string;
  readonly model: string;
  complete(request: CompletionRequest): Promise<CompletionResult>;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
