
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
}

const STORAGE_KEY = 'signalpulse_signals';
const LAST_SIGNAL_TIMES = 'signalpulse_last_times';

// Persistent history for pattern detection
const digitHistory: Record<string, number[]> = {};

export const SignalManager = {
  saveSignal: (signal: Omit<Signal, 'id' | 'timestamp' | 'synced'>): Signal => {
    const signals = SignalManager.getSignals();
    
    // Check if we already have a very recent signal for this symbol and type to avoid spamming
    // This provides 24/7 stability by preventing duplicates from rapid ticks
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
      synced: false, // Starts as unsynced for the offline queue logic
    };
    
    const updatedSignals = [newSignal, ...signals].slice(0, 100); // Maintain larger history for 24/7 view
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedSignals));
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

  /**
   * Checks if enough time has passed based on the selected interval.
   * This ensures 24/7 consistency across browser refreshes.
   */
  shouldProcessSignal: (symbol: string, strategy: string, intervalMinutes: number): boolean => {
    if (typeof window === 'undefined') return false;
    const storedTimes = localStorage.getItem(LAST_SIGNAL_TIMES);
    const times = storedTimes ? JSON.parse(storedTimes) : {};
    const key = `${symbol}_${strategy}`;
    const lastTime = times[key] || 0;
    
    const now = Date.now();
    const intervalMs = intervalMinutes * 60 * 1000;
    
    if (now - lastTime >= intervalMs) {
      times[key] = now;
      localStorage.setItem(LAST_SIGNAL_TIMES, JSON.stringify(times));
      return true;
    }
    return false;
  },

  processSignalsFromData: (
    symbol: string, 
    currentPrice: number, 
    lastDigit: string, 
    prevPrice: number | null,
    strategy: string,
    rawPrice: string,
    intervalStr: string
  ): Signal | null => {
    const dVal = parseInt(lastDigit);
    if (isNaN(dVal)) return null;

    // Convert interval string (e.g., '5m', '1h') to minutes
    let intervalMinutes = 5;
    if (intervalStr.endsWith('h')) {
      intervalMinutes = parseInt(intervalStr) * 60;
    } else {
      intervalMinutes = parseInt(intervalStr) || 5;
    }

    // Track digit history for pattern-based strategies
    if (!digitHistory[symbol]) digitHistory[symbol] = [];
    digitHistory[symbol].push(dVal);
    if (digitHistory[symbol].length > 10) digitHistory[symbol].shift();

    const history = digitHistory[symbol];
    
    // Check if we should even look for a signal based on the timeframe
    if (!SignalManager.shouldProcessSignal(symbol, strategy, intervalMinutes)) {
      return null;
    }
    
    let result: Signal | null = null;

    switch (strategy) {
      case 'RISE_FALL':
        if (prevPrice !== null) {
          if (currentPrice > prevPrice) {
            result = SignalManager.saveSignal({ symbol, type: 'RISE', strategy, price: currentPrice, rawPrice, lastDigit, interval: intervalStr });
          } else if (currentPrice < prevPrice) {
            result = SignalManager.saveSignal({ symbol, type: 'FALL', strategy, price: currentPrice, rawPrice, lastDigit, interval: intervalStr });
          }
        }
        break;

      case 'EVEN_ODD':
        const isEven = dVal % 2 === 0;
        // Even/Odd pattern detection (confirming 2-streak)
        if (history.length >= 2 && history[history.length-2] % 2 === (isEven ? 0 : 1)) {
           result = SignalManager.saveSignal({ 
            symbol, 
            type: isEven ? 'EVEN' : 'ODD', 
            strategy, 
            price: currentPrice, 
            rawPrice,
            lastDigit,
            interval: intervalStr
          });
        }
        break;

      case 'OVER_UNDER':
        // HIGH PRECISION OVER 2 / UNDER 7 STRATEGY
        // Requirement: 3 consecutive digits meeting the condition (streak confirm)
        if (history.length >= 3) {
          const last3 = history.slice(-3);
          const allOver2 = last3.every(d => d > 2);
          const allUnder7 = last3.every(d => d < 7);

          if (allOver2) {
            result = SignalManager.saveSignal({ 
              symbol, 
              type: 'OVER 2', 
              strategy, 
              price: currentPrice, 
              rawPrice,
              lastDigit,
              runs: 1, // Optimized for 1-run entry
              interval: intervalStr
            });
          } else if (allUnder7) {
            result = SignalManager.saveSignal({ 
              symbol, 
              type: 'UNDER 7', 
              strategy, 
              price: currentPrice, 
              rawPrice,
              lastDigit,
              runs: 1, // Optimized for 1-run entry
              interval: intervalStr
            });
          }
        }
        break;

      case 'MATCHES_DIFFERS':
        if (dVal === 0) {
          result = SignalManager.saveSignal({ symbol, type: 'MATCH 0', strategy, price: currentPrice, rawPrice, lastDigit, interval: intervalStr });
        } else if (history.length >= 4 && history.slice(-4).every(d => d !== 0)) {
          result = SignalManager.saveSignal({ symbol, type: 'DIFFERS 0', strategy, price: currentPrice, rawPrice, lastDigit, interval: intervalStr });
        }
        break;
    }
    
    return result;
  }
};
