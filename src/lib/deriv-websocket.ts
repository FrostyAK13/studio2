
/**
 * @fileOverview Deriv WebSocket Service
 * Handles real-time connection to Deriv API for market ticks.
 */

export type Tick = {
  quote: number;
  epoch: number;
  symbol: string;
  rawQuote: string; // Keep the raw string to preserve exact digits
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
      // Re-subscribe to all active symbols on reconnect
      this.subscribers.forEach((_, symbol) => {
        this.sendSubscribe(symbol);
      });
    };

    this.ws.onmessage = (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data.msg_type === 'tick' && data.tick) {
          const symbol = data.tick.symbol;
          const tick: Tick = {
            quote: data.tick.quote,
            epoch: data.tick.epoch,
            symbol: data.tick.symbol,
            rawQuote: data.tick.quote.toString(),
          };
          
          const symbolSubscribers = this.subscribers.get(symbol);
          if (symbolSubscribers) {
            symbolSubscribers.forEach(cb => cb(tick));
          }
        }
      } catch (e) {
        console.error("Failed to parse WebSocket message", e);
      }
    };

    this.ws.onclose = () => {
      this.isConnecting = false;
      setTimeout(() => this.connect(), 5000);
    };

    this.ws.onerror = (err) => {
      this.isConnecting = false;
      console.error("WebSocket error", err);
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
