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

const STORAGE_KEY = 'signalpulse_signals';
const LAST_BUCKET_KEY = 'signalpulse_last_bucket';

const digitHistory: Record<string, number[]> = {};
const tickHistory: Record<string, number[]> = {};

export const SignalManager = {
  saveSignal: (signal: Omit<Signal, 'id' | 'timestamp' | 'synced'>): Signal => {
    if (typeof window === 'undefined') {
       return { ...signal, id: 'mock', timestamp: new Date().toISOString(), synced: false };
    }
    
    const signals = SignalManager.getSignals();
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
   * Aligns signal processing to standard clock intervals (e.g., :00, :05, :10).
   */
  shouldProcessStandardInterval: (intervalMinutes: number): boolean => {
    if (typeof window === 'undefined') return false;
    
    const now = new Date();
    const currentMinute = now.getMinutes();
    const currentSeconds = now.getSeconds();

    // Check if we are at a standard interval (e.g., minute 5, 10, 15...)
    // We allow a small 15-second window to catch the signal at the start of the interval
    if (currentMinute % intervalMinutes === 0 && currentSeconds < 15) {
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
    if (intervalStr.endsWith('h')) {
      intervalMinutes = parseInt(intervalStr) * 60;
    } else {
      intervalMinutes = parseInt(intervalStr) || 5;
    }

    if (!digitHistory[symbol]) digitHistory[symbol] = [];
    if (!tickHistory[symbol]) tickHistory[symbol] = [];
    
    digitHistory[symbol].push(dVal);
    tickHistory[symbol].push(currentPrice);
    
    if (digitHistory[symbol].length > 10) digitHistory[symbol].shift();
    if (tickHistory[symbol].length > 10) tickHistory[symbol].shift();

    // Force standard interval check
    if (!SignalManager.shouldProcessStandardInterval(intervalMinutes)) {
      return null;
    }
    
    let strategyResult = null;
    switch (strategy) {
      case 'OVER_UNDER':
        strategyResult = SignalStrategies.evaluateOverUnder(digitHistory[symbol]);
        break;
      case 'RISE_FALL':
        strategyResult = SignalStrategies.evaluateRiseFall(tickHistory[symbol], digitHistory[symbol]);
        break;
      case 'EVEN_ODD':
        strategyResult = SignalStrategies.evaluateEvenOdd(digitHistory[symbol]);
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
        rationale: strategyResult.rationale,
        runs: 1
      });
    }
    
    return null;
  }
};
