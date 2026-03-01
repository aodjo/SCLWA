import { AIProvider, Message, Problem, ProblemType } from './types';
import { OpenAIProvider } from './providers/openai';

export type ProviderType = 'openai' | 'gemini' | 'claude';

/**
 * AI Adapter for managing different AI providers
 */
export class AIAdapter {
  private provider: AIProvider | null = null;
  private providerType: ProviderType | null = null;

  /**
   * Sets the active AI provider
   *
   * @param type - Provider type
   * @param apiKey - API key for the provider
   */
  setProvider(type: ProviderType, apiKey: string): void {
    switch (type) {
      case 'openai':
        this.provider = new OpenAIProvider(apiKey);
        break;
      case 'gemini':
        // TODO: Implement GeminiProvider
        throw new Error('Gemini provider not implemented yet');
      case 'claude':
        // TODO: Implement ClaudeProvider
        throw new Error('Claude provider not implemented yet');
      default:
        throw new Error(`Unknown provider type: ${type}`);
    }
    this.providerType = type;
  }

  /**
   * Gets the current provider type
   *
   * @returns Current provider type or null
   */
  getProviderType(): ProviderType | null {
    return this.providerType;
  }

  /**
   * Generates a problem using the active provider
   *
   * @param type - Type of problem to generate
   * @param difficulty - Difficulty level (1-5)
   * @returns Promise resolving to generated problem
   */
  async generateProblem(type: ProblemType, difficulty: number): Promise<Problem> {
    if (!this.provider) {
      throw new Error('No AI provider set');
    }
    return this.provider.generateProblem(type, difficulty);
  }

  /**
   * Sends chat messages using the active provider
   *
   * @param messages - Array of chat messages
   * @returns Promise resolving to AI response string
   */
  async chat(messages: Message[]): Promise<string> {
    if (!this.provider) {
      throw new Error('No AI provider set');
    }
    return this.provider.chat(messages);
  }
}

export const aiAdapter = new AIAdapter();
