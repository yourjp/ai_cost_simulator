export interface ModelPricing {
  modelName: string;
  provider: 'OpenAI' | 'Anthropic' | 'Google';
  tier: 'high' | 'mid';
  inputCostPer1M: number; // 1M tokens in USD
  outputCostPer1M: number; // 1M tokens in USD
}

export const FALLBACK_PRICING: ModelPricing[] = [
  // 3사 대표 실거래 단가
  {
    modelName: 'GPT-5.6 Sol',
    provider: 'OpenAI',
    tier: 'high',
    inputCostPer1M: 5.00,
    outputCostPer1M: 30.00
  },
  {
    modelName: 'GPT-5.6 Terra',
    provider: 'OpenAI',
    tier: 'high',
    inputCostPer1M: 2.00,
    outputCostPer1M: 12.00
  },
  {
    modelName: 'GPT-5.6 Luna',
    provider: 'OpenAI',
    tier: 'mid',
    inputCostPer1M: 0.20,
    outputCostPer1M: 1.20
  },
  {
    modelName: 'Claude 3 Opus',
    provider: 'Anthropic',
    tier: 'high',
    inputCostPer1M: 15.00,
    outputCostPer1M: 75.00
  },
  {
    modelName: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    tier: 'high',
    inputCostPer1M: 3.00,
    outputCostPer1M: 15.00
  },
  {
    modelName: 'Claude 3 Haiku',
    provider: 'Anthropic',
    tier: 'mid',
    inputCostPer1M: 0.25,
    outputCostPer1M: 1.25
  },
  {
    modelName: 'Gemini 1.5 Pro',
    provider: 'Google',
    tier: 'high',
    inputCostPer1M: 1.25,
    outputCostPer1M: 5.00
  },
  {
    modelName: 'Gemini 1.5 Flash',
    provider: 'Google',
    tier: 'mid',
    inputCostPer1M: 0.075,
    outputCostPer1M: 0.30
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
