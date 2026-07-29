export interface ModelPricing {
  modelName: string;
  provider: 'OpenAI' | 'Anthropic' | 'Google';
  tier: 'high' | 'mid';
  inputCostPer1M: number; // 1M tokens in USD
  outputCostPer1M: number; // 1M tokens in USD
}

export const FALLBACK_PRICING: ModelPricing[] = [
  {
    modelName: 'GPT-5.6 Sol',
    provider: 'OpenAI',
    tier: 'high',
    inputCostPer1M: 5.00,
    outputCostPer1M: 30.00
  },
  {
    modelName: 'GPT-5.6 Luna',
    provider: 'OpenAI',
    tier: 'mid',
    inputCostPer1M: 1.00,
    outputCostPer1M: 6.00
  },
  {
    modelName: 'Claude 4.8 Opus',
    provider: 'Anthropic',
    tier: 'high',
    inputCostPer1M: 5.00,
    outputCostPer1M: 25.00
  },
  {
    modelName: 'Claude Fable 5',
    provider: 'Anthropic',
    tier: 'high',
    inputCostPer1M: 10.00,
    outputCostPer1M: 50.00
  },
  {
    modelName: 'Claude Sonnet 5',
    provider: 'Anthropic',
    tier: 'mid',
    inputCostPer1M: 2.00,
    outputCostPer1M: 10.00
  },
  {
    modelName: 'Gemini 3.1 Pro (Preview)',
    provider: 'Google',
    tier: 'high',
    inputCostPer1M: 2.00,
    outputCostPer1M: 12.00
  },
  {
    modelName: 'Gemini 3.6 Flash',
    provider: 'Google',
    tier: 'mid',
    inputCostPer1M: 1.50,
    outputCostPer1M: 7.50
  }
];

export class PricingDataAgent {
  private pricingData: ModelPricing[] = [...FALLBACK_PRICING];

  /**
   * Simulates fetching pricing data from an external API endpoint.
   * Incorporates a chance of failure to demonstrate the backup fallback logic.
   *
   * @param forceFail Optional parameter to force API call failure for testing.
   * @returns A promise that resolves to the array of pricing details.
   */
  public async fetchPricingData(forceFail: boolean = false): Promise<ModelPricing[]> {
    try {
      // Simulate network delay
      await new Promise((resolve) => setTimeout(resolve, 800));

      if (forceFail || Math.random() < 0.15) {
        throw new Error('API request failed due to rate limits or network issues.');
      }

      // Simulate receiving fresh data (which is identical to current rates)
      this.pricingData = [...FALLBACK_PRICING];
      return this.pricingData;
    } catch (error) {
      console.warn(
        'PricingDataAgent: Failed to fetch online pricing. Loading fallback local constants.',
        error
      );
      this.pricingData = [...FALLBACK_PRICING];
      return this.pricingData;
    }
  }

  /**
   * Retrieves currently cached pricing data.
   */
  public getPricingData(): ModelPricing[] {
    return [...this.pricingData];
  }
}
