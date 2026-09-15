import { ProviderError, type CompletionRequest, type CompletionResult, type ModelProvider } from "./types";

/**
 * Minimal OpenAI-compatible Chat Completions client (fetch, no SDK).
 * Works with any endpoint implementing POST {baseUrl}/chat/completions.
 */
export class OpenAICompatibleProvider implements ModelProvider {
  readonly name = "openai";

  constructor(
    readonly model: string,
    private readonly apiKey: string,
    private readonly baseUrl = "https://api.openai.com/v1",
  ) {}

  async complete({ messages, temperature = 0, maxTokens = 600 }: CompletionRequest): Promise<CompletionResult> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({ model: this.model, messages, temperature, max_tokens: maxTokens }),
    });
    if (!res.ok) {
      throw new ProviderError(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`, this.name, res.status);
    }
    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    return {
      text: body.choices?.[0]?.message?.content ?? "",
      usage: { inputTokens: body.usage?.prompt_tokens ?? 0, outputTokens: body.usage?.completion_tokens ?? 0 },
    };
  }
}
