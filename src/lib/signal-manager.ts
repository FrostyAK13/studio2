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
}

const STORAGE_KEY = 'signalpulse_signals';

// Persistent history for pattern detection
const digitHistory: Record<string, number[]> = {};

export const SignalManager = {
  saveSignal: (signal: Omit<Signal, 'id' | 'timestamp' | 'synced'>): Signal => {
    const signals = SignalManager.getSignals();
    
    // Check if we already have a very recent signal for this symbol and type to avoid spamming
    const lastSignal = signals[0];
    if (lastSignal && 
        lastSignal.symbol === signal.symbol && 
        lastSignal.type === signal.type &&
        Date.now() - new Date(lastSignal.timestamp).getTime() < 3000) {
      return lastSignal;
    }

    const newSignal: Signal = {
      ...signal,
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      synced: false,
    };
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify([newSignal, ...signals].slice(0, 50)));
    return newSignal;
  },

  getSignals: (): Signal[] => {
    if (typeof window === 'undefined') return [];
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  },

  markAsSynced: (signalId: string): void => {
    const signals = SignalManager.getSignals();
    const updated = signals.map(s => s.id === signalId ? { ...s, synced: true } : s);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  },

  processSignalsFromData: (
    symbol: string, 
    currentPrice: number, 
    lastDigit: string, 
    prevPrice: number | null,
    strategy: string,
    rawPrice: string
  ): Signal | null => {
    const dVal = parseInt(lastDigit);
    if (isNaN(dVal)) return null;

    // Track digit history for pattern-based strategies
    if (!digitHistory[symbol]) digitHistory[symbol] = [];
    digitHistory[symbol].push(dVal);
    if (digitHistory[symbol].length > 10) digitHistory[symbol].shift();

    const history = digitHistory[symbol];
    
    switch (strategy) {
      case 'RISE_FALL':
        if (prevPrice !== null) {
          if (currentPrice > prevPrice) {
            return SignalManager.saveSignal({ symbol, type: 'RISE', strategy, price: currentPrice, rawPrice, lastDigit });
          } else if (currentPrice < prevPrice) {
            return SignalManager.saveSignal({ symbol, type: 'FALL', strategy, price: currentPrice, rawPrice, lastDigit });
          }
        }
        break;

      case 'EVEN_ODD':
        const isEven = dVal % 2 === 0;
        // Require 2 consecutive same parity for "High Prob" signal
        if (history.length >= 2 && history[history.length-2] % 2 === (isEven ? 0 : 1)) {
           return SignalManager.saveSignal({ 
            symbol, 
            type: isEven ? 'EVEN' : 'ODD', 
            strategy, 
            price: currentPrice, 
            rawPrice,
            lastDigit 
          });
        }
        break;

      case 'OVER_UNDER':
        /**
         * SPECIALIZED OVER 2 / UNDER 7 STRATEGY
         * Strategy: Wait for 3 consecutive digits meeting the condition (Safe Entry).
         * Runs: Optimized for 1 Run.
         */
        if (history.length >= 3) {
          const last3 = history.slice(-3);
          const allOver2 = last3.every(d => d > 2);
          const allUnder7 = last3.every(d => d < 7);

          if (allOver2) {
            return SignalManager.saveSignal({ 
              symbol, 
              type: 'OVER 2', 
              strategy, 
              price: currentPrice, 
              rawPrice,
              lastDigit,
              runs: 1 
            });
          } else if (allUnder7) {
            return SignalManager.saveSignal({ 
              symbol, 
              type: 'UNDER 7', 
              strategy, 
              price: currentPrice, 
              rawPrice,
              lastDigit,
              runs: 1
            });
          }
        }
        break;

      case 'MATCHES_DIFFERS':
        // Target is 0
        if (dVal === 0) {
          return SignalManager.saveSignal({ symbol, type: 'MATCH 0', strategy, price: currentPrice, rawPrice, lastDigit });
        } else if (history.length >= 4 && history.slice(-4).every(d => d !== 0)) {
           // Differ signal after 4 non-zero ticks
          return SignalManager.saveSignal({ symbol, type: 'DIFFERS 0', strategy, price: currentPrice, rawPrice, lastDigit });
        }
        break;
    }
    
    return null;
  }
};
