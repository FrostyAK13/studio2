/**
 * @fileOverview Shared Technical Analysis Strategies for SignalPulse.
 * This logic is used by both the Client Engine and the Server-side Cron Engine.
 */

export type SignalType = 'RISE' | 'FALL' | 'EVEN' | 'ODD' | 'OVER 2' | 'UNDER 7' | 'MATCH 0' | 'DIFFERS 0';

export interface StrategyResult {
  type: SignalType;
  rationale: string;
  lastDigit: string;
}

export const SignalStrategies = {
  /**
   * Over / Under Strategy: Requires a 4-digit confirmation streak.
   * Enhanced rationale provides deeper technical context.
   */
  evaluateOverUnder: (digits: number[]): StrategyResult | null => {
    if (digits.length < 4) return null;
    const last4 = digits.slice(-4);
    const lastDigit = last4[3].toString();

    if (last4.every(d => d > 2)) {
      return {
        type: 'OVER 2',
        lastDigit,
        rationale: `Precision Alert: Detected a sequence of 4 consecutive digits [${last4.join(', ')}] all exceeding the threshold of 2. This statistical anomaly indicates a strong localized 'Over' trend on the high-volatility stream.`
      };
    }
    if (last4.every(d => d < 7)) {
      return {
        type: 'UNDER 7',
        lastDigit,
        rationale: `Precision Alert: Detected a sequence of 4 consecutive digits [${last4.join(', ')}] all remaining below the threshold of 7. This mathematical cluster confirms a high-probability 'Under' bias in the current tick stream.`
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
        rationale: `Momentum Breakout: 5 consecutive higher ticks detected. Trend line analysis shows consistent bullish pressure with zero retracement in the immediate tick window.`
      };
    }
    if (isFalling) {
      return {
        type: 'FALL',
        lastDigit,
        rationale: `Momentum Breakout: 5 consecutive lower ticks detected. Trend line analysis confirms aggressive bearish liquidation with zero upward correction in the immediate tick window.`
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
        rationale: `Parity Sequence: Mathematical streak of 4 consecutive EVEN digits [${last4.join(', ')}]. High-fidelity parity sync detected.`
      };
    }
    if (last4.every(d => d % 2 !== 0)) {
      return {
        type: 'ODD',
        lastDigit,
        rationale: `Parity Sequence: Mathematical streak of 4 consecutive ODD digits [${last4.join(', ')}]. High-fidelity parity sync detected.`
      };
    }
    return null;
  }
};
