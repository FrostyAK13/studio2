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

        // CRITICAL: Extract the raw quote string BEFORE parsing as JSON.
        // JSON.parse() strips trailing zeros, which breaks last-digit analysis.
        let rawQuote = "";
        
        // Use a more specific regex to find the quote within the tick object
        // This looks for "quote": followed by digits/dots, capturing the exact literal string
        const tickQuoteMatch = rawData.match(/"tick"\s*:\s*\{[^}]*"quote"\s*:\s*(\d+\.?\d*)/);
        if (tickQuoteMatch && tickQuoteMatch[1]) {
          rawQuote = tickQuoteMatch[1];
        }

        const data = JSON.parse(rawData);

        if (data.msg_type === 'tick' && data.tick) {
          const symbol = data.tick.symbol;
          
          // Fallback if regex failed, using pip_size to reconstruct the intended precision
          if (!rawQuote) {
            rawQuote = data.tick.pip_size !== undefined 
              ? data.tick.quote.toFixed(data.tick.pip_size) 
              : data.tick.quote.toString();
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
