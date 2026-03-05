/**
 * @fileOverview Deriv WebSocket Service
 * Handles real-time connection to Deriv API for market ticks.
 * Uses pip_size to ensure absolute precision, preserving trailing zeros for last-digit analysis.
 */

export type Tick = {
  quote: number;
  epoch: number;
  symbol: string;
  rawQuote: string; // The exact string with forced precision
};

class DerivWebsocket {
  private ws: WebSocket | null = null;
  private appId: string = '84799';
  private subscribers: Map<string, Set<(tick: Tick) => void>> = new Map();
  private isConnecting: boolean = false;

  private connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return;
    if (this.isConnecting) return;

    this.isConnecting = true;
    this.ws = new WebSocket(`wss://ws.derivws.com/websockets/v3?app_id=${this.appId}`);

    this.ws.onopen = () => {
      this.isConnecting = false;
      this.subscribers.forEach((_, symbol) => {
        this.sendSubscribe(symbol);
      });
    };

    this.ws.onmessage = (msg) => {
      try {
        const rawData = msg.data;
        if (typeof rawData !== 'string') return;

        const data = JSON.parse(rawData);

        if (data.msg_type === 'tick' && data.tick) {
          const symbol = data.tick.symbol;
          const pipSize = data.tick.pip_size;
          
          /**
           * CRITICAL: Deriv's pip_size defines the expected decimal precision.
           * Standard JSON.parse() strips trailing zeros, so we use toFixed(pipSize)
           * to reconstruct the string EXACTLY as it appears on the platform.
           */
          let rawQuote = "";
          if (pipSize !== undefined) {
            rawQuote = data.tick.quote.toFixed(pipSize);
          } else {
            rawQuote = data.tick.quote.toString();
          }

          const tick: Tick = {
            quote: data.tick.quote,
            epoch: data.tick.epoch,
            symbol: data.tick.symbol,
            rawQuote: rawQuote,
          };
          
          const symbolSubscribers = this.subscribers.get(symbol);
          if (symbolSubscribers) {
            symbolSubscribers.forEach(cb => cb(tick));
          }
        }
      } catch (e) {
        // Silently catch errors in real-time stream processing
      }
    };

    this.ws.onclose = () => {
      this.isConnecting = false;
      setTimeout(() => this.connect(), 5000);
    };

    this.ws.onerror = () => {
      this.isConnecting = false;
    };
  }

  private sendSubscribe(symbol: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ ticks: symbol }));
    }
  }

  private sendUnsubscribe(symbol: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ forget_all: 'ticks' }));
    }
  }

  subscribe(symbol: string, callback: (tick: Tick) => void) {
    if (!this.subscribers.has(symbol)) {
      this.subscribers.set(symbol, new Set());
      this.sendSubscribe(symbol);
    }
    
    this.subscribers.get(symbol)!.add(callback);
    this.connect();

    return () => {
      const symbolSubscribers = this.subscribers.get(symbol);
      if (symbolSubscribers) {
        symbolSubscribers.delete(callback);
        if (symbolSubscribers.size === 0) {
          this.subscribers.delete(symbol);
          this.sendUnsubscribe(symbol);
        }
      }
    };
  }
}

export const derivWs = new DerivWebsocket();
