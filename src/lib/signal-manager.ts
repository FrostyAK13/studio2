import { SignalStrategies } from './strategies';

export interface Signal {
  id: string;
  symbol: string;
  type: string;
  strategy: string;
  timestamp: string;
  price: number;
  rawPrice?: string;
  lastDigit?: string;
  synced: boolean;
  runs?: number;
  interval?: string;
  rationale?: string;
}

const STORAGE_KEY = 'emporer_signals';
const LAST_BUCKET_KEY = 'emporer_last_bucket';

const digitHistory: Record<string, number[]> = {};
const tickHistory: Record<string, number[]> = {};

export const SignalManager = {
  /**
   * Saves a signal with randomized runs (1-3) and current timestamp.
   */
  saveSignal: (signal: Omit<Signal, 'id' | 'timestamp' | 'synced' | 'runs'>): Signal => {
    if (typeof window === 'undefined') {
       return { ...signal, id: 'mock', timestamp: new Date().toISOString(), synced: false, runs: 1 };
    }
    
    const signals = SignalManager.getSignalsInternal();
    const newSignal: Signal = {
      ...signal,
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      synced: false,
      runs: Math.floor(Math.random() * 3) + 1,
    };
    
    const updatedSignals = [newSignal, ...signals].slice(0, 100);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedSignals));
    return newSignal;
  },

  /**
   * Gets all signals from storage.
   */
  getSignalsInternal: (): Signal[] => {
    if (typeof window === 'undefined') return [];
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  },

  /**
   * Returns only successfully dispatched (sent) signals.
   */
  getSignals: (): Signal[] => {
    return SignalManager.getSignalsInternal().filter(s => s.synced);
  },

  /**
   * Clears the entire signal history.
   */
  clearSignals: (): void => {
    if (typeof window === 'undefined') return;
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(LAST_BUCKET_KEY);
  },

  markAsSynced: (signalId: string): void => {
    if (typeof window === 'undefined') return;
    const signals = SignalManager.getSignalsInternal();
    const updated = signals.map(s => s.id === signalId ? { ...s, synced: true } : s);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  },

  /**
   * Checks if the current time matches a standard interval bucket (e.g., :00, :05, :10).
   */
  isTargetInterval: (intervalMinutes: number): boolean => {
    const now = new Date();
    const minutes = now.getMinutes();
    return minutes % intervalMinutes === 0;
  },

  /**
   * Checks if a signal has already been successfully dispatched for the current clock bucket.
   */
  hasDispatchedForCurrentBucket: (): boolean => {
    if (typeof window === 'undefined') return false;
    const now = new Date();
    const bucketId = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
    const lastBucket = localStorage.getItem(LAST_BUCKET_KEY);
    return lastBucket === bucketId;
  },

  /**
   * Marks the current minute bucket as completed to prevent duplicate signals.
   */
  markBucketAsDispatched: (): void => {
    if (typeof window === 'undefined') return;
    const now = new Date();
    const bucketId = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${now.getMinutes()}`;
    localStorage.setItem(LAST_BUCKET_KEY, bucketId);
  },

  processSignalsFromData: (
    symbol: string, 
    currentPrice: number, 
    lastDigitStr: string, 
    prevPrice: number | null,
    strategy: string,
    rawPrice: string,
    intervalStr: string,
    isScanner: boolean
  ): Signal | null => {
    const dVal = parseInt(lastDigitStr);
    if (isNaN(dVal)) return null;

    let intervalMinutes = 5;
    if (intervalStr.includes('h')) {
      intervalMinutes = parseInt(intervalStr) * 60;
    } else {
      intervalMinutes = parseInt(intervalStr.replace('m', '')) || 5;
    }

    // Maintain history per symbol
    if (!digitHistory[symbol]) digitHistory[symbol] = [];
    if (!tickHistory[symbol]) tickHistory[symbol] = [];
    
    digitHistory[symbol].push(dVal);
    tickHistory[symbol].push(currentPrice);
    
    if (digitHistory[symbol].length > 40) digitHistory[symbol].shift();
    if (tickHistory[symbol].length > 40) tickHistory[symbol].shift();

    if (!SignalManager.isTargetInterval(intervalMinutes)) return null;
    if (SignalManager.hasDispatchedForCurrentBucket()) return null;
    
    let strategyResult = null;
    switch (strategy) {
      case 'OVER_UNDER':
        strategyResult = SignalStrategies.evaluateOverUnder(digitHistory[symbol]);
        break;
      case 'OVER_UNDER_ADV':
        strategyResult = SignalStrategies.evaluateOverUnderAdvanced(digitHistory[symbol]);
        break;
      case 'RISE_FALL':
        strategyResult = SignalStrategies.evaluateRiseFall(tickHistory[symbol], digitHistory[symbol]);
        break;
      case 'EVEN_ODD':
        strategyResult = SignalStrategies.evaluateEvenOdd(digitHistory[symbol]);
        break;
      case 'MATCHES':
        strategyResult = SignalStrategies.evaluateMatches(digitHistory[symbol]);
        break;
    }

    if (strategyResult) {
      SignalManager.markBucketAsDispatched();
      return SignalManager.saveSignal({ 
        symbol, 
        type: strategyResult.type, 
        strategy, 
        price: currentPrice, 
        rawPrice, 
        lastDigit: strategyResult.lastDigit, 
        interval: intervalStr,
        rationale: strategyResult.rationale
      });
    }
    
    return null;
  }
};
