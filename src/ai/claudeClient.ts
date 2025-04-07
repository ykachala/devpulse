/**
 * Anthropic Claude API client.
 * Supports both streaming (for SSE endpoints) and non-streaming completions.
 */
import Anthropic from '@anthropic-ai/sdk';

export class ClaudeClient {
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Streams a Claude response token by token.
   * Yields text delta strings as they arrive from the API.
   */
  async *stream(prompt: string): AsyncGenerator<string> {
    const stream = this.client.messages.stream({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        yield event.delta.text;
      }
    }
  }

  /**
   * Returns a complete non-streamed response from Claude.
   */
  async complete(prompt: string): Promise<string> {
    const message = await this.client.messages.create({
      model: 'claude-sonnet-4-5',
      max_tokens: 2048,
      messages: [{ role: 'user', content: prompt }],
    });
    const block = message.content[0];
    return block && block.type === 'text' ? block.text : '';
  }
}
