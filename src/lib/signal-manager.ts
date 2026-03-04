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
    const newSignal: Signal = {
      ...signal,
      id: Math.random().toString(36).substring(2, 9),
      timestamp: new Date().toISOString(),
      synced: false,
    };
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify([newSignal, ...signals]));
    return newSignal;
  },

  getSignals: (): Signal[] => {
    if (typeof window === 'undefined') return [];
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  },

  syncSignals: async (): Promise<number> => {
    const signals = SignalManager.getSignals();
    const unsynced = signals.filter(s => !s.synced);
    
    if (unsynced.length === 0) return 0;

    // Simulate server processing
    await new Promise(resolve => setTimeout(resolve, 1500));

    const updatedSignals = signals.map(s => ({ ...s, synced: true }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedSignals));
    
    return unsynced.length;
  },

  processSignalsFromData: (symbol: string, data: { price: number }[]): Signal | null => {
    if (data.length < 5) return null;
    
    // Simple mock logic: If last 3 prices are trending up, BUY
    const lastThree = data.slice(-3);
    const isTrendingUp = lastThree[2].price > lastThree[1].price && lastThree[1].price > lastThree[0].price;
    const isTrendingDown = lastThree[2].price < lastThree[1].price && lastThree[1].price < lastThree[0].price;

    if (isTrendingUp) {
      return SignalManager.saveSignal({ symbol, type: 'BUY', price: lastThree[2].price });
    } else if (isTrendingDown) {
      return SignalManager.saveSignal({ symbol, type: 'SELL', price: lastThree[2].price });
    }
    
    return null;
  }
};