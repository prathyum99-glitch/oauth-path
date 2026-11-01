import Anthropic from '@anthropic-ai/sdk';

export type CreateParams = Omit<Anthropic.MessageCreateParamsNonStreaming, 'stream'>;

/** The only surface the pipeline needs. Tests inject a scripted fake. */
export type Llm = {
  create(params: CreateParams): Promise<Anthropic.Message>;
};

export const DEFAULT_MODEL = 'claude-sonnet-5-5';

export function modelName(): string {
  return process.env.ANTHROPIC_MODEL || DEFAULT_MODEL;
}

export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function createLlm(): Llm {
  const client = new Anthropic({ maxRetries: 3 });
  return {
    // Streaming under the hood avoids request timeouts on long generations.
    create: async (params) => {
      const msg = await client.messages.stream(params).finalMessage();
      // One line per call in the host's logs, so what a run costs can be added up from real numbers.
      const u = msg.usage;
      console.log(
        'usage',
        JSON.stringify({
          model: params.model,
          in: u.input_tokens,
          cacheWrite: u.cache_creation_input_tokens ?? 0,
          cacheRead: u.cache_read_input_tokens ?? 0,
          out: u.output_tokens,
          searches: u.server_tool_use?.web_search_requests ?? 0,
        }),
      );
      return msg;
    },
  };
}
