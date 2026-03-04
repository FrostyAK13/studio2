
export interface Signal {
  id: string;
  symbol: string;
  type: 'BUY' | 'SELL' | 'HOLD';
  timestamp: string;
  price: number;
  synced: boolean;
}

const STORAGE_KEY = 'signalpulse_signals';

export const SignalManager = {
  saveSignal: (signal: Omit<Signal, 'id' | 'timestamp' | 'synced'>): Signal => {
    const signals = SignalManager.getSignals();
    
    // Check if we already have a very recent signal for this symbol to avoid spamming
    const lastSignal = signals[0];
    if (lastSignal && lastSignal.symbol === signal.symbol && 
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

  syncSignals: async (): Promise<number> => {
    // This is now handled by the UI calling the dispatch flow
    return 0;
  },

  processSignalsFromData: (symbol: string, data: { price: number }[]): Signal | null => {
    if (data.length < 1) return null;
    
    // More sensitive real-time detection for ticks
    const currentPrice = data[data.length - 1].price;
    
    // Mock algo: Trigger on specific price endings or patterns if needed
    const randomFactor = Math.random();
    if (randomFactor > 0.995) {
      return SignalManager.saveSignal({ symbol, type: 'BUY', price: currentPrice });
    } else if (randomFactor < 0.005) {
      return SignalManager.saveSignal({ symbol, type: 'SELL', price: currentPrice });
    }
    
    return null;
  }
};
