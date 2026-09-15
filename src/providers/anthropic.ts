import { ProviderError, type CompletionRequest, type CompletionResult, type ModelProvider } from "./types";

/** Minimal Anthropic Messages API client (fetch, no SDK). */
export class AnthropicProvider implements ModelProvider {
  readonly name = "anthropic";

  constructor(
    readonly model: string,
    private readonly apiKey: string,
  ) {}

  async complete({ messages, temperature = 0, maxTokens = 600 }: CompletionRequest): Promise<CompletionResult> {
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const conversation = messages.filter((m) => m.role !== "system");

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: this.model, system, messages: conversation, temperature, max_tokens: maxTokens }),
    });
    if (!res.ok) {
      throw new ProviderError(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`, this.name, res.status);
    }
    const body = (await res.json()) as {
      content?: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    return {
      text: (body.content ?? []).filter((c) => c.type === "text").map((c) => c.text ?? "").join(""),
      usage: { inputTokens: body.usage?.input_tokens ?? 0, outputTokens: body.usage?.output_tokens ?? 0 },
    };
  }
}
