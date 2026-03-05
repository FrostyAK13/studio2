
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
   */
  evaluateOverUnder: (digits: number[]): StrategyResult | null => {
    if (digits.length < 4) return null;
    const last4 = digits.slice(-4);
    const lastDigit = last4[3].toString();

    if (last4.every(d => d > 2)) {
      return {
        type: 'OVER 2',
        lastDigit,
        rationale: "Bullish precision: 4 consecutive digits above 2 confirmed on high-volatility stream."
      };
    }
    if (last4.every(d => d < 7)) {
      return {
        type: 'UNDER 7',
        lastDigit,
        rationale: "Bearish precision: 4 consecutive digits below 7 confirmed on high-volatility stream."
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
        rationale: "Aggressive bullish momentum: 5 consecutive higher ticks detected on trend line."
      };
    }
    if (isFalling) {
      return {
        type: 'FALL',
        lastDigit,
        rationale: "Aggressive bearish momentum: 5 consecutive lower ticks detected on trend line."
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
        rationale: "Mathematical parity streak: 4 consecutive EVEN digits detected."
      };
    }
    if (last4.every(d => d % 2 !== 0)) {
      return {
        type: 'ODD',
        lastDigit,
        rationale: "Mathematical parity streak: 4 consecutive ODD digits detected."
      };
    }
    return null;
  }
};
