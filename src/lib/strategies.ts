/**
 * @fileOverview Shared Technical Analysis Strategies for SignalPulse.
 * This logic is used by both the Client Engine and the Server-side Cron Engine.
 */

export type SignalType = 'RISE' | 'FALL' | 'EVEN' | 'ODD' | 'OVER 2' | 'UNDER 7' | 'OVER 4' | 'UNDER 5' | string;

export interface StrategyResult {
  type: string;
  rationale: string;
  lastDigit: string;
}

export const SignalStrategies = {
  /**
   * Over / Under Strategy: Requires a 4-digit confirmation streak.
   */
  evaluateOverUnder: (digits: number[]): StrategyResult | null => {
    if (digits.length < 4) return null;
    const last4 = digits.slice(-4);
    const lastDigit = last4[3].toString();

    if (last4.every(d => d > 2)) {
      return {
        type: 'OVER 2',
        lastDigit,
        rationale: `Precision Alert: Detected a sequence of 4 consecutive digits [${last4.join(', ')}] all exceeding threshold 2. High-probability bullish trend confirmed for Over 2 contracts.`
      };
    }
    if (last4.every(d => d < 7)) {
      return {
        type: 'UNDER 7',
        lastDigit,
        rationale: `Precision Alert: Detected a sequence of 4 consecutive digits [${last4.join(', ')}] strictly below threshold 7. Mathematical cluster confirms high-probability Under 7 environment.`
      };
    }
    return null;
  },

  /**
   * Advanced Over / Under Strategy: Threshold 4 and 5.
   */
  evaluateOverUnderAdvanced: (digits: number[]): StrategyResult | null => {
    if (digits.length < 4) return null;
    const last4 = digits.slice(-4);
    const lastDigit = last4[3].toString();

    if (last4.every(d => d > 4)) {
      return {
        type: 'OVER 4',
        lastDigit,
        rationale: `Upper Threshold Analysis: 4-digit confirmation streak [${last4.join(', ')}] above threshold 4. Significant bullish pressure detected on high-tier digits.`
      };
    }
    if (last4.every(d => d < 5)) {
      return {
        type: 'UNDER 5',
        lastDigit,
        rationale: `Lower Threshold Analysis: 4-digit confirmation streak [${last4.join(', ')}] below threshold 5. Significant bearish containment detected on low-tier digits.`
      };
    }
    return null;
  },

  /**
   * Rise / Fall Strategy: Requires a 5-tick continuous momentum trend.
   */
  evaluateRiseFall: (ticks: number[], digits: number[]): StrategyResult | null => {
    if (ticks.length < 5) return null;
    const last5 = ticks.slice(-5);
    const lastDigit = digits[digits.length - 1]?.toString() || "0";

    const isRising = last5.every((val, i) => i === 0 || val > last5[i - 1]);
    const isFalling = last5.every((val, i) => i === 0 || val < last5[i - 1]);

    if (isRising) {
      return {
        type: 'RISE',
        lastDigit,
        rationale: `Momentum Trend Analysis: Detected 5 consecutive ticks with positive price delta. Zero-retracement bullish momentum confirmed. Recommendation: RISE.`
      };
    }
    if (isFalling) {
      return {
        type: 'FALL',
        lastDigit,
        rationale: `Momentum Trend Analysis: Detected 5 consecutive ticks with negative price delta. Zero-retracement bearish momentum confirmed. Recommendation: FALL.`
      };
    }
    return null;
  },

  /**
   * Even / Odd Strategy: Requires a 4-digit parity streak.
   */
  evaluateEvenOdd: (digits: number[]): StrategyResult | null => {
    if (digits.length < 4) return null;
    const last4 = digits.slice(-4);
    const lastDigit = last4[3].toString();

    if (last4.every(d => d % 2 === 0)) {
      return {
        type: 'EVEN',
        lastDigit,
        rationale: `Parity Equilibrium Analysis: Sequence of 4 consecutive EVEN digits [${last4.join(', ')}] detected. Statistical bias shifted toward Even results.`
      };
    }
    if (last4.every(d => d % 2 !== 0)) {
      return {
        type: 'ODD',
        lastDigit,
        rationale: `Parity Equilibrium Analysis: Sequence of 4 consecutive ODD digits [${last4.join(', ')}] detected. Statistical bias shifted toward Odd results.`
      };
    }
    return null;
  },

  /**
   * Best Matches Strategy: Frequency Cluster Analysis for digits 0-9.
   * Scans for a "Gravity Cluster" where any digit appears 3+ times in a window of 10.
   */
  evaluateMatches: (digits: number[]): StrategyResult | null => {
    if (digits.length < 10) return null;
    const last10 = digits.slice(-10);
    const lastDigit = last10[9].toString();

    // Frequency map for all digits 0-9
    const counts: Record<number, number> = {};
    for (const d of last10) {
      counts[d] = (counts[d] || 0) + 1;
    }

    // Find the digit with the highest frequency
    let bestDigit = -1;
    let maxCount = 0;

    for (let i = 0; i <= 9; i++) {
      if ((counts[i] || 0) > maxCount) {
        maxCount = counts[i];
        bestDigit = i;
      }
    }

    // Trigger if a digit has appeared at least 3 times (Standard Gravity Threshold)
    if (bestDigit !== -1 && maxCount >= 3) {
      return {
        type: `MATCH ${bestDigit}`,
        lastDigit,
        rationale: `Frequency Cluster Analysis (MATCH ${bestDigit}): Detected a "Gravity Cluster" where the digit ${bestDigit} appeared ${maxCount} times in the last 10 ticks. High statistical alignment for a Matches ${bestDigit} contract.`
      };
    }
    return null;
  }
};
