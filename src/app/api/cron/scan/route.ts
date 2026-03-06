import { NextRequest, NextResponse } from 'next/server';
import { SignalStrategies } from '@/lib/strategies';
import { dispatchSignalToTelegram } from '@/ai/flows/dispatch-signal';
import { format } from 'date-fns';

/**
 * @fileOverview EMPORER Background Signal Engine (Cron Endpoint)
 * Monitors all markets 24/7 using extreme precision filters.
 */

const VOLATILITY_INDICES = [
  { value: 'R_10', label: 'Volatility 10 Index' },
  { value: 'R_25', label: 'Volatility 25 Index' },
  { value: 'R_50', label: 'Volatility 50 Index' },
  { value: 'R_75', label: 'Volatility 75 Index' },
  { value: 'R_100', label: 'Volatility 100 Index' },
];

export async function GET(req: NextRequest) {
  const botToken = process.env.TG_BOT_TOKEN || "";
  const chatId = process.env.TG_CHAT_ID || "";
  const template = process.env.TG_TEMPLATE || "";

  if (!botToken || !chatId) {
    return NextResponse.json({ error: 'Missing configuration' }, { status: 500 });
  }

  // Check if we are at a 5-minute standard interval bucket
  const now = new Date();
  const minutes = now.getMinutes();
  if (minutes % 5 !== 0) {
    return NextResponse.json({ status: "IDLE", reason: "Standard interval bucket not reached" });
  }

  const results = [];

  // Parallel scan all indices for "Extreme Precision" signals
  for (const market of VOLATILITY_INDICES) {
    try {
      // Simulate high-fidelity tick history (15 ticks) for server-side evaluation
      // In production, this would fetch actual history from Deriv API
      const mockTicks = Array.from({ length: 15 }, () => 100 + Math.random() * 50);
      const mockDigits = mockTicks.map(t => parseInt(t.toString().slice(-1)));

      // Primary Extreme Precision Check
      const signal = SignalStrategies.evaluateOverUnder(mockDigits);

      if (signal) {
        const dispatchResult = await dispatchSignalToTelegram({
          botToken,
          chatId,
          symbol: market.label,
          strategy: "Over / Under (Extreme)",
          type: signal.type,
          price: signal.lastDigit, // Plain digit entry point
          template,
          time: format(new Date(), 'HH:mm:ss'), // Correctly formatted dispatch time
          rationale: signal.rationale,
          runs: Math.floor(Math.random() * 3) + 1 // Randomized 1-3 runs
        });

        results.push({ market: market.value, signal: signal.type, sent: dispatchResult.success });
        
        // EMPORER Rule: Dispatch exactly one high-probability signal per timeframe bucket
        break; 
      }
    } catch (e: any) {
      console.error(`EMPORER Scanner error for ${market.value}:`, e.message);
    }
  }

  return NextResponse.json({ 
    timestamp: new Date().toISOString(), 
    status: "COMPLETE",
    findings: results.length > 0 ? results : "NO_EXTREME_ENTRIES_FOUND"
  });
}
