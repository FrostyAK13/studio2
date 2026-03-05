
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
const LAST_SIGNAL_TIMES = 'signalpulse_last_times';
const GLOBAL_COOLDOWN_KEY = 'signalpulse_global_cooldown';

const digitHistory: Record<string, number[]> = {};
const tickHistory: Record<string, number[]> = {};

export const SignalManager = {
  saveSignal: (signal: Omit<Signal, 'id' | 'timestamp' | 'synced'>): Signal => {
    if (typeof window === 'undefined') {
       return { ...signal, id: 'mock', timestamp: new Date().toISOString(), synced: false };
    }
    
    const signals = SignalManager.getSignals();
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

    if (!SignalManager.shouldProcessSignal(symbol, strategy, intervalMinutes, isScanner)) {
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
