export type UserType = 'light' | 'heavy' | 'stdDev' | 'heavyDev';

export interface UserRatioState {
  light: number;
  heavy: number;
  stdDev: number;
  heavyDev: number;
}

export class UIStateAgent {
  // Keeps track of the adjustment history to determine the oldest unmodified field.
  // The first element is the oldest; the last element is the newest (most recently modified).
  private history: UserType[] = ['light', 'heavy', 'stdDev', 'heavyDev'];

  constructor(initialHistory?: UserType[]) {
    if (initialHistory) {
      this.history = [...initialHistory];
    }
  }

  /**
   * Adjusts the ratios based on user input, ensuring the sum remains exactly 100%.
   * It finds the oldest unmodified ratio field to absorb the difference.
   * If the sum exceeds 100%, it bounds the updated field value so that no field becomes negative.
   *
   * @param currentRatios The current ratio state of the 4 user types.
   * @param updatedType The key of the user type currently being updated by the user.
   * @param newValue The new percentage value for the updated type (0 - 100).
   * @returns An object containing the new ratios and the updated history list.
   */
  public adjustRatios(
    currentRatios: UserRatioState,
    updatedType: UserType,
    newValue: number
  ): { newRatios: UserRatioState; newHistory: UserType[] } {
    // 1. Bound the input value between 0 and 100.
    let val = Math.max(0, Math.min(100, newValue));

    // 2. Update the modification history. Move the updatedType to the end (most recent).
    const nextHistory = this.history.filter(t => t !== updatedType);
    nextHistory.push(updatedType);

    // 3. The target field that will absorb the adjustment is the first element of history
    // (excluding the updatedType, which is already at the end).
    const targetType = nextHistory[0];

    // 4. The other 2 fields are fixed in this turn.
    const fixedTypes = nextHistory.slice(1, 3); // index 1 and 2

    // Sum of the fixed fields.
    const fixedSum = fixedTypes.reduce((sum, t) => sum + currentRatios[t], 0);

    // The target value absorbs the rest to make the sum 100.
    let targetVal = 100 - fixedSum - val;

    // If target value falls below 0, it means the input value is too high for the other fixed values.
    // We must cap the input value to prevent the target field from going negative.
    if (targetVal < 0) {
      val = 100 - fixedSum;
      targetVal = 0;
    }

    // 5. Build the new ratios state, rounding to one decimal place to avoid float precision issues.
    const newRatios: UserRatioState = {
      ...currentRatios,
      [updatedType]: Math.round(val * 10) / 10,
      [targetType]: Math.round(targetVal * 10) / 10,
    };

    // Ensure the final sum is exactly 100. Due to rounding, there might be tiny discrepancies.
    const sum = newRatios.light + newRatios.heavy + newRatios.stdDev + newRatios.heavyDev;
    if (sum !== 100) {
      const diff = 100 - sum;
      newRatios[targetType] = Math.max(0, Math.round((newRatios[targetType] + diff) * 10) / 10);
    }

    return {
      newRatios,
      newHistory: nextHistory,
    };
  }

  /**
   * Getter for the current history order.
   */
  public getHistory(): UserType[] {
    return [...this.history];
  }

  /**
   * Adjusts a 2-option model mix (high vs mid tier) for a provider.
   * Ensures the two values sum to exactly 100%.
   */
  public adjustModelMix(
    currentMix: ModelMixRatio,
    updatedTier: 'high' | 'mid',
    newValue: number
  ): ModelMixRatio {
    const val = Math.max(0, Math.min(100, newValue));
    const targetTier = updatedTier === 'high' ? 'mid' : 'high';
    const targetVal = 100 - val;

    return {
      [updatedTier]: Math.round(val * 10) / 10,
      [targetTier]: Math.round(targetVal * 10) / 10,
    } as unknown as ModelMixRatio;
  }
}

export interface ModelMixRatio {
  high: number;
  mid: number;
}

export interface ProviderMixState {
  OpenAI: ModelMixRatio;
  Anthropic: ModelMixRatio;
  Google: ModelMixRatio;
}
