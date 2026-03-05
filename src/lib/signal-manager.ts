
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
const GLOBAL_COOLDOWN_KEY = 'signalpulse_global_cooldown';

// Persistent history for pattern detection per symbol
const digitHistory: Record<string, number[]> = {};

export const SignalManager = {
  saveSignal: (signal: Omit<Signal, 'id' | 'timestamp' | 'synced'>): Signal => {
    if (typeof window === 'undefined') {
       return { ...signal, id: 'mock', timestamp: new Date().toISOString(), synced: false };
    }
    
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

  /**
   * Checks if enough time has passed based on the selected interval.
   * "1 market per timeframe" logic: If scanner is on, use a global cooldown.
   * Otherwise use per-market cooldown.
   */
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

    if (!digitHistory[symbol]) digitHistory[symbol] = [];
    digitHistory[symbol].push(dVal);
    if (digitHistory[symbol].length > 10) digitHistory[symbol].shift();

    const history = digitHistory[symbol];
    
    // Check global or per-market interval cooldown
    if (!SignalManager.shouldProcessSignal(symbol, strategy, intervalMinutes, isScanner)) {
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
              runs: 1,
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
              runs: 1,
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
