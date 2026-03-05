
export interface Signal {
  id: string;
  symbol: string;
  type: string; // e.g., 'RISE', 'FALL', 'EVEN', 'ODD', 'OVER 2', 'UNDER 7'
  strategy: string;
  timestamp: string;
  price: number;
  rawPrice?: string; // High-precision string from Deriv
  lastDigit?: string;
  synced: boolean;
  runs?: number;
  interval?: string;
  rationale?: string;
}

const STORAGE_KEY = 'signalpulse_signals';
const LAST_SIGNAL_TIMES = 'signalpulse_last_times';
const GLOBAL_COOLDOWN_KEY = 'signalpulse_global_cooldown';

// Persistent history for pattern detection per symbol
const digitHistory: Record<string, number[]> = {};
const tickHistory: Record<string, number[]> = {};

export const SignalManager = {
  saveSignal: (signal: Omit<Signal, 'id' | 'timestamp' | 'synced'>): Signal => {
    if (typeof window === 'undefined') {
       return { ...signal, id: 'mock', timestamp: new Date().toISOString(), synced: false };
    }
    
    const signals = SignalManager.getSignals();
    
    // De-duplication check for very rapid signals
    const lastSignal = signals[0];
    if (lastSignal && 
        lastSignal.symbol === signal.symbol && 
        lastSignal.type === signal.type &&
        Date.now() - new Date(lastSignal.timestamp).getTime() < 10000) {
      return lastSignal;
    }

    const newSignal: Signal = {
      ...signal,
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      synced: false,
    };
    
    const updatedSignals = [newSignal, ...signals].slice(0, 100);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedSignals));
    return newSignal;
  },

  getSignals: (): Signal[] => {
    if (typeof window === 'undefined') return [];
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  },

  markAsSynced: (signalId: string): void => {
    if (typeof window === 'undefined') return;
    const signals = SignalManager.getSignals();
    const updated = signals.map(s => s.id === signalId ? { ...s, synced: true } : s);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  },

  shouldProcessSignal: (symbol: string, strategy: string, intervalMinutes: number, isScanner: boolean): boolean => {
    if (typeof window === 'undefined') return false;
    
    const now = Date.now();
    const intervalMs = intervalMinutes * 60 * 1000;

    if (isScanner) {
      const lastGlobal = parseInt(localStorage.getItem(GLOBAL_COOLDOWN_KEY) || '0');
      if (now - lastGlobal >= intervalMs) {
        localStorage.setItem(GLOBAL_COOLDOWN_KEY, now.toString());
        return true;
      }
      return false;
    } else {
      const storedTimes = localStorage.getItem(LAST_SIGNAL_TIMES);
      const times = storedTimes ? JSON.parse(storedTimes) : {};
      const key = `${symbol}_${strategy}`;
      const lastTime = times[key] || 0;
      
      if (now - lastTime >= intervalMs) {
        times[key] = now;
        localStorage.setItem(LAST_SIGNAL_TIMES, JSON.stringify(times));
        return true;
      }
      return false;
    }
  },

  processSignalsFromData: (
    symbol: string, 
    currentPrice: number, 
    lastDigit: string, 
    prevPrice: number | null,
    strategy: string,
    rawPrice: string,
    intervalStr: string,
    isScanner: boolean
  ): Signal | null => {
    const dVal = parseInt(lastDigit);
    if (isNaN(dVal)) return null;

    let intervalMinutes = 5;
    if (intervalStr.endsWith('h')) {
      intervalMinutes = parseInt(intervalStr) * 60;
    } else {
      intervalMinutes = parseInt(intervalStr) || 5;
    }

    // Initialize histories
    if (!digitHistory[symbol]) digitHistory[symbol] = [];
    if (!tickHistory[symbol]) tickHistory[symbol] = [];
    
    digitHistory[symbol].push(dVal);
    tickHistory[symbol].push(currentPrice);
    
    if (digitHistory[symbol].length > 10) digitHistory[symbol].shift();
    if (tickHistory[symbol].length > 10) tickHistory[symbol].shift();

    const hDigits = digitHistory[symbol];
    const hTicks = tickHistory[symbol];
    
    // Check global or per-market interval cooldown
    if (!SignalManager.shouldProcessSignal(symbol, strategy, intervalMinutes, isScanner)) {
      return null;
    }
    
    let result: Signal | null = null;

    switch (strategy) {
      case 'RISE_FALL':
        // High Precision: Require a 5-tick continuous trend
        if (hTicks.length >= 5) {
          const last5 = hTicks.slice(-5);
          const isRising = last5.every((val, i) => i === 0 || val > last5[i - 1]);
          const isFalling = last5.every((val, i) => i === 0 || val < last5[i - 1]);

          if (isRising) {
            result = SignalManager.saveSignal({ 
              symbol, type: 'RISE', strategy, price: currentPrice, rawPrice, lastDigit, interval: intervalStr,
              rationale: "Sharp bullish momentum: 5 consecutive higher ticks detected."
            });
          } else if (isFalling) {
            result = SignalManager.saveSignal({ 
              symbol, type: 'FALL', strategy, price: currentPrice, rawPrice, lastDigit, interval: intervalStr,
              rationale: "Sharp bearish momentum: 5 consecutive lower ticks detected."
            });
          }
        }
        break;

      case 'EVEN_ODD':
        // High Probability: Wait for a 4-digit streak of the same parity
        if (hDigits.length >= 4) {
          const last4 = hDigits.slice(-4);
          const allEven = last4.every(d => d % 2 === 0);
          const allOdd = last4.every(d => d % 2 !== 0);

          if (allEven) {
            result = SignalManager.saveSignal({ 
              symbol, type: 'EVEN', strategy, price: currentPrice, rawPrice, lastDigit, interval: intervalStr,
              rationale: "Strong parity streak: 4 consecutive EVEN digits confirmed."
            });
          } else if (allOdd) {
            result = SignalManager.saveSignal({ 
              symbol, type: 'ODD', strategy, price: currentPrice, rawPrice, lastDigit, interval: intervalStr,
              rationale: "Strong parity streak: 4 consecutive ODD digits confirmed."
            });
          }
        }
        break;

      case 'OVER_UNDER':
        // Professional Edge: Use a 4-digit safety streak
        if (hDigits.length >= 4) {
          const last4 = hDigits.slice(-4);
          const allOver2 = last4.every(d => d > 2);
          const allUnder7 = last4.every(d => d < 7);

          if (allOver2) {
            result = SignalManager.saveSignal({ 
              symbol, type: 'OVER 2', strategy, price: currentPrice, rawPrice, lastDigit, interval: intervalStr, runs: 1,
              rationale: "Bullish pattern confirmed: 4 consecutive digits above 2."
            });
          } else if (allUnder7) {
            result = SignalManager.saveSignal({ 
              symbol, type: 'UNDER 7', strategy, price: currentPrice, rawPrice, lastDigit, interval: intervalStr, runs: 1,
              rationale: "Bearish pattern confirmed: 4 consecutive digits below 7."
            });
          }
        }
        break;

      case 'MATCHES_DIFFERS':
        // Reversal/Breakout: Detect extended zero-absence or zero-hit
        if (dVal === 0) {
          result = SignalManager.saveSignal({ 
            symbol, type: 'MATCH 0', strategy, price: currentPrice, rawPrice, lastDigit, interval: intervalStr,
            rationale: "Zero hit detected. High reversal probability on current volatility."
          });
        } else if (hDigits.length >= 6 && hDigits.slice(-6).every(d => d !== 0)) {
          result = SignalManager.saveSignal({ 
            symbol, type: 'DIFFERS 0', strategy, price: currentPrice, rawPrice, lastDigit, interval: intervalStr,
            rationale: "Extended zero-absence detected (6 ticks). Low probability of zero hit next."
          });
        }
        break;
    }
    
    return result;
  }
};
