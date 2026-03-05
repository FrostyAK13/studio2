
export interface Signal {
  id: string;
  symbol: string;
  type: string; // e.g., 'RISE', 'FALL', 'EVEN', 'ODD', 'OVER 4', 'MATCH 0'
  strategy: string;
  timestamp: string;
  price: number;
  lastDigit?: string;
  synced: boolean;
}

const STORAGE_KEY = 'signalpulse_signals';

export const SignalManager = {
  saveSignal: (signal: Omit<Signal, 'id' | 'timestamp' | 'synced'>): Signal => {
    const signals = SignalManager.getSignals();
    
    // Check if we already have a very recent signal for this symbol and type to avoid spamming
    const lastSignal = signals[0];
    if (lastSignal && 
        lastSignal.symbol === signal.symbol && 
        lastSignal.type === signal.type &&
        Date.now() - new Date(lastSignal.timestamp).getTime() < 2000) {
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
    strategy: string
  ): Signal | null => {
    
    switch (strategy) {
      case 'RISE_FALL':
        if (prevPrice !== null) {
          if (currentPrice > prevPrice) {
            return SignalManager.saveSignal({ symbol, type: 'RISE', strategy, price: currentPrice, lastDigit });
          } else if (currentPrice < prevPrice) {
            return SignalManager.saveSignal({ symbol, type: 'FALL', strategy, price: currentPrice, lastDigit });
          }
        }
        break;

      case 'EVEN_ODD':
        const digit = parseInt(lastDigit);
        if (!isNaN(digit)) {
          const isEven = digit % 2 === 0;
          return SignalManager.saveSignal({ 
            symbol, 
            type: isEven ? 'EVEN' : 'ODD', 
            strategy, 
            price: currentPrice, 
            lastDigit 
          });
        }
        break;

      case 'OVER_UNDER':
        const val = parseInt(lastDigit);
        if (!isNaN(val)) {
          // Threshold is 4 (Standard Deriv pattern)
          if (val > 4) {
            return SignalManager.saveSignal({ symbol, type: 'OVER 4', strategy, price: currentPrice, lastDigit });
          } else if (val < 5) {
             return SignalManager.saveSignal({ symbol, type: 'UNDER 5', strategy, price: currentPrice, lastDigit });
          }
        }
        break;

      case 'MATCHES_DIFFERS':
        const d = parseInt(lastDigit);
        if (!isNaN(d)) {
          // Target is 0 (Standard Deriv pattern)
          if (d === 0) {
            return SignalManager.saveSignal({ symbol, type: 'MATCH 0', strategy, price: currentPrice, lastDigit });
          } else {
            return SignalManager.saveSignal({ symbol, type: 'DIFFERS 0', strategy, price: currentPrice, lastDigit });
          }
        }
        break;
    }
    
    return null;
  }
};
