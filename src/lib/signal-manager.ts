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
      // Randomize runs between 1 and 3 as requested
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
   * Aligns to standard clock intervals (5, 10, 15... 00).
   * Ensuring 100% reliable dispatching even if the engine starts close to the interval.
   */
  shouldProcessStandardInterval: (intervalMinutes: number): boolean => {
    if (typeof window === 'undefined') return false;
    
    const now = new Date();
    const currentMinute = now.getMinutes();

    // EMPORER Rule: Dispatch exactly once when the minute matches the standard interval bucket.
    // We remove the seconds restriction to ensure that the first available tick in that target minute triggers the signal.
    if (currentMinute % intervalMinutes === 0) {
      const bucketId = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}-${currentMinute}`;
      const lastBucket = localStorage.getItem(LAST_BUCKET_KEY);
      
      if (lastBucket !== bucketId) {
        localStorage.setItem(LAST_BUCKET_KEY, bucketId);
        return true;
      }
    }
    return false;
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

    if (!digitHistory[symbol]) digitHistory[symbol] = [];
    if (!tickHistory[symbol]) tickHistory[symbol] = [];
    
    digitHistory[symbol].push(dVal);
    tickHistory[symbol].push(currentPrice);
    
    if (digitHistory[symbol].length > 20) digitHistory[symbol].shift();
    if (tickHistory[symbol].length > 20) tickHistory[symbol].shift();

    // EMPORER Precision: Check for standard clock alignment
    if (!SignalManager.shouldProcessStandardInterval(intervalMinutes)) {
      return null;
    }
    
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