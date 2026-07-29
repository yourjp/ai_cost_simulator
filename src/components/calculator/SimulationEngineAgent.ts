import { ModelPricing } from './PricingDataAgent';
import { UserRatioState, ProviderMixState, UserType } from './UIStateAgent';

export interface UserTokenUsage {
  inputTokens: number;
  outputTokens: number;
}

// Monthly default token usage limits as per requirements (Input:Output ≈ 3:1 ~ 4:1)
export const DEFAULT_TOKEN_USAGE: Record<'light' | 'heavy' | 'stdDev' | 'heavyDev', UserTokenUsage> = {
  light: { inputTokens: 300000, outputTokens: 75000 },
  heavy: { inputTokens: 1500000, outputTokens: 400000 },
  stdDev: { inputTokens: 5000000, outputTokens: 1000000 },
  heavyDev: { inputTokens: 20000000, outputTokens: 4000000 }
};

export interface ModelSimulationResult {
  modelName: string;
  provider: 'OpenAI' | 'Anthropic' | 'Google';
  tier: 'high' | 'mid';
  totalInputTokens: number;
  totalOutputTokens: number;
  usdCost: number;
  krwCost: number;
  inputCostPer1M: number;
  outputCostPer1M: number;
}

export interface ProviderSimulationResult {
  provider: 'OpenAI' | 'Anthropic' | 'Google';
  usdCost: number;
  krwCost: number;
  highRatio: number;
  midRatio: number;
}

export interface SimulationSummary {
  cheapestModel: ModelSimulationResult;
  mostExpensiveModel: ModelSimulationResult;
  costDifferenceUsd: number;
  costDifferenceKrw: number;

  // Added weighted provider summary properties
  cheapestProvider: ProviderSimulationResult;
  mostExpensiveProvider: ProviderSimulationResult;
  providerDifferenceUsd: number;
  providerDifferenceKrw: number;
}

export class SimulationEngineAgent {
  /**
   * Evaluates the monthly cost of each AI model and each provider's blended mix cost.
   *
   * @param totalUsers The total number of users.
   * @param ratios The ratio percentage allocation for the 4 user tiers.
   * @param pricingData The list of pricing rates per model.
   * @param exchangeRate USD to KRW exchange rate (user-configurable, defaults to 1,500).
   * @param mixRatios Provider model mix ratio (High vs Mid tier percentages).
   * @returns An object containing raw list results, blended provider results, and summaries.
   */
  public runSimulation(
    totalUsers: number,
    ratios: UserRatioState,
    pricingData: ModelPricing[],
    exchangeRate: number,
    mixRatios: ProviderMixState,
    tokenUsage: Record<UserType, UserTokenUsage>
  ): {
    results: ModelSimulationResult[];
    providerResults: ProviderSimulationResult[];
    summary: SimulationSummary;
  } {
    // Early return guard for empty pricing data (e.g. during server rendering initial states)
    if (!pricingData || pricingData.length === 0) {
      const fallbackResult: ModelSimulationResult = {
        modelName: 'N/A',
        provider: 'OpenAI',
        tier: 'mid',
        totalInputTokens: 0,
        totalOutputTokens: 0,
        usdCost: 0,
        krwCost: 0,
        inputCostPer1M: 0,
        outputCostPer1M: 0
      };
      
      const fallbackProvider: ProviderSimulationResult = {
        provider: 'OpenAI',
        usdCost: 0,
        krwCost: 0,
        highRatio: 50,
        midRatio: 50
      };

      return {
        results: [],
        providerResults: [],
        summary: {
          cheapestModel: fallbackResult,
          mostExpensiveModel: fallbackResult,
          costDifferenceUsd: 0,
          costDifferenceKrw: 0,
          cheapestProvider: fallbackProvider,
          mostExpensiveProvider: fallbackProvider,
          providerDifferenceUsd: 0,
          providerDifferenceKrw: 0
        }
      };
    }

    // 1. Calculate count per user segment
    const userCounts = {
      light: totalUsers * (ratios.light / 100),
      heavy: totalUsers * (ratios.heavy / 100),
      stdDev: totalUsers * (ratios.stdDev / 100),
      heavyDev: totalUsers * (ratios.heavyDev / 100)
    };

    // 2. Sum up total input & output tokens consumed monthly across all cohorts
    let totalInputTokens = 0;
    let totalOutputTokens = 0;

    (Object.keys(tokenUsage) as Array<UserType>).forEach(key => {
      const count = userCounts[key];
      const usage = tokenUsage[key] || { inputTokens: 0, outputTokens: 0 };
      totalInputTokens += count * usage.inputTokens;
      totalOutputTokens += count * usage.outputTokens;
    });

    // 3. Estimate cost for each individual AI model
    const results: ModelSimulationResult[] = pricingData.map(model => {
      const usdCost =
        (totalInputTokens / 1000000 * model.inputCostPer1M) +
        (totalOutputTokens / 1000000 * model.outputCostPer1M);

      const krwCost = usdCost * exchangeRate;

      return {
        modelName: model.modelName,
        provider: model.provider,
        tier: model.tier,
        totalInputTokens,
        totalOutputTokens,
        usdCost: Math.round(usdCost * 100) / 100, // Round to 2 decimals for USD
        krwCost: Math.round(krwCost), // Round to integer for KRW
        inputCostPer1M: model.inputCostPer1M,
        outputCostPer1M: model.outputCostPer1M
      };
    });

    // 4. Calculate weighted blended costs per provider
    const providers: Array<'OpenAI' | 'Anthropic' | 'Google'> = ['OpenAI', 'Anthropic', 'Google'];
    const providerResults: ProviderSimulationResult[] = providers.map(prov => {
      const highModel = results.find(r => r.provider === prov && r.tier === 'high');
      const midModel = results.find(r => r.provider === prov && r.tier === 'mid');
      const mix = mixRatios[prov] || { high: 50, mid: 50 };

      // Apply weighting: highCost * (high% / 100) + midCost * (mid% / 100)
      const highUsd = highModel ? highModel.usdCost : 0;
      const midUsd = midModel ? midModel.usdCost : 0;

      const mixedUsd = (highUsd * (mix.high / 100)) + (midUsd * (mix.mid / 100));
      const mixedKrw = mixedUsd * exchangeRate;

      return {
        provider: prov,
        usdCost: Math.round(mixedUsd * 100) / 100,
        krwCost: Math.round(mixedKrw),
        highRatio: mix.high,
        midRatio: mix.mid
      };
    });

    // 5. Formulate dashboard summary metadata (Cheapest vs Most Expensive)
    // Individual Model levels
    const sortedModels = [...results].sort((a, b) => a.usdCost - b.usdCost);
    const cheapestModel = sortedModels[0] || results[0];
    const mostExpensiveModel = sortedModels[sortedModels.length - 1] || results[0];
    const costDifferenceUsd = Math.round((mostExpensiveModel.usdCost - cheapestModel.usdCost) * 100) / 100;
    const costDifferenceKrw = Math.round(mostExpensiveModel.krwCost - cheapestModel.krwCost);

    // Blended Provider levels
    const sortedProviders = [...providerResults].sort((a, b) => a.usdCost - b.usdCost);
    const cheapestProvider = sortedProviders[0] || providerResults[0];
    const mostExpensiveProvider = sortedProviders[sortedProviders.length - 1] || providerResults[0];
    const providerDifferenceUsd = Math.round((mostExpensiveProvider.usdCost - cheapestProvider.usdCost) * 100) / 100;
    const providerDifferenceKrw = Math.round(mostExpensiveProvider.krwCost - cheapestProvider.krwCost);

    const summary: SimulationSummary = {
      cheapestModel,
      mostExpensiveModel,
      costDifferenceUsd,
      costDifferenceKrw,
      cheapestProvider,
      mostExpensiveProvider,
      providerDifferenceUsd,
      providerDifferenceKrw
    };

    return {
      results,
      providerResults,
      summary
    };
  }
}
