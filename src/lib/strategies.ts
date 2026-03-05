/**
 * @fileOverview Shared Technical Analysis Strategies for SignalPulse.
 * This logic is used by both the Client Engine and the Server-side Cron Engine.
 */

export type SignalType = 'RISE' | 'FALL' | 'EVEN' | 'ODD' | 'OVER 2' | 'UNDER 7' | 'OVER 4' | 'UNDER 5' | 'MATCH 0' | 'DIFFERS 0';

export interface StrategyResult {
  type: SignalType;
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
        rationale: `Over 2 Precision Alert: Detected a sequence of 4 consecutive digits [${last4.join(', ')}] all exceeding threshold 2. High-probability trend confirmed.`
      };
    }
    if (last4.every(d => d < 7)) {
      return {
        type: 'UNDER 7',
        lastDigit,
        rationale: `Under 7 Precision Alert: Detected a sequence of 4 consecutive digits [${last4.join(', ')}] below threshold 7. Mathematical cluster confirms bias.`
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
        rationale: `Upper Threshold Analysis: 4 consecutive digits [${last4.join(', ')}] above 4 detected. Bullish pressure confirmed on high-tier digits.`
      };
    }
    if (last4.every(d => d < 5)) {
      return {
        type: 'UNDER 5',
        lastDigit,
        rationale: `Lower Threshold Analysis: 4 consecutive digits [${last4.join(', ')}] below 5 detected. Bearish containment confirmed on low-tier digits.`
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
        rationale: `Momentum Trend Analysis: 5 consecutive ticks in one direction. Zero-retracement trend-line confirmed in the immediate tick window.`
      };
    }
    if (isFalling) {
      return {
        type: 'FALL',
        lastDigit,
        rationale: `Momentum Trend Analysis: 5 consecutive ticks downward. Zero-retracement bearish trend confirmed in the immediate tick window.`
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
        rationale: `Parity Sequence Analysis: Detected 4 consecutive EVEN digits [${last4.join(', ')}]. Mathematical equilibrium shift detected.`
      };
    }
    if (last4.every(d => d % 2 !== 0)) {
      return {
        type: 'ODD',
        lastDigit,
        rationale: `Parity Sequence Analysis: Detected 4 consecutive ODD digits [${last4.join(', ')}]. Mathematical equilibrium shift detected.`
      };
    }
    return null;
  },

  /**
   * Matches Only: Looking for patterns of zero.
   */
  evaluateMatches: (digits: number[]): StrategyResult | null => {
    if (digits.length < 4) return null;
    const last4 = digits.slice(-4);
    const lastDigit = last4[3].toString();
    const zeroCount = last4.filter(d => d === 0).length;

    if (zeroCount >= 3) {
      return {
        type: 'MATCH 0',
        lastDigit,
        rationale: `Zero Alignment Analysis: High-fidelity pattern of zeros [${last4.join(', ')}] observed in the last 4 ticks. Statistical match probability at maximum.`
      };
    }
    return null;
  }
};
