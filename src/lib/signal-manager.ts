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
    
    const signals = SignalManager.getSignals();
    const newSignal: Signal = {
      ...signal,
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      synced: false,
      // EMPORER Rule: Randomized runs (1-3) for risk distribution
      runs: Math.floor(Math.random() * 3) + 1,
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
    
    // Maintain deeper history for precision filters (30 ticks to accommodate 8-digit streaks)
    if (digitHistory[symbol].length > 30) digitHistory[symbol].shift();
    if (tickHistory[symbol].length > 30) tickHistory[symbol].shift();

    // EMPORER Rule: Only process during standard clock intervals (:00, :05, :10...)
    if (!SignalManager.isTargetInterval(intervalMinutes)) return null;
    
    // EMPORER Rule: Never miss a signal, but never duplicate one for the same bucket
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

    // Only "consume" the bucket if a valid signal is actually produced by the precision filter
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