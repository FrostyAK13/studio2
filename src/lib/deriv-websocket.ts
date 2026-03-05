/**
 * @fileOverview Deriv WebSocket Service
 * Handles real-time connection to Deriv API for market ticks.
 * Extracts raw quote strings to preserve precision for last-digit analysis.
 */

export type Tick = {
  quote: number;
  epoch: number;
  symbol: string;
  rawQuote: string; // The exact string from the wire to preserve trailing zeros
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
          
          // CRITICAL: Extract the quote as a string directly from the raw JSON string 
          // to preserve trailing zeros (e.g., "10.50" instead of 10.5)
          // We look for the exact "quote":123.450 portion of the message
          let rawQuote = data.tick.quote.toString();
          const quoteRegex = /"quote"\s*:\s*([\d.]+)/;
          const match = rawData.match(quoteRegex);
          if (match && match[1]) {
            rawQuote = match[1];
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
