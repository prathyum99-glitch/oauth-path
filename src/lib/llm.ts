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
    create: (params) => client.messages.stream(params).finalMessage(),
  };
}
