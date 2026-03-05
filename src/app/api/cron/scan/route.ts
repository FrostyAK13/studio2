
import { NextRequest, NextResponse } from 'next/server';
import { SignalStrategies } from '@/lib/strategies';
import { dispatchSignalToTelegram } from '@/ai/flows/dispatch-signal';
import { format } from 'date-fns';

/**
 * @fileOverview Background Signal Engine (Cron Endpoint)
 * This endpoint is triggered 24/7 to monitor markets and send signals.
 * It does not require a browser session.
 */

const VOLATILITY_INDICES = [
  { value: 'R_10', label: 'Volatility 10 Index' },
  { value: 'R_25', label: 'Volatility 25 Index' },
  { value: 'R_50', label: 'Volatility 50 Index' },
  { value: 'R_75', label: 'Volatility 75 Index' },
  { value: 'R_100', label: 'Volatility 100 Index' },
];

export async function GET(req: NextRequest) {
  // Authorization check for Cron (Use a secret header or API key in production)
  const authHeader = req.headers.get('authorization');
  // if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  //   return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  // }

  console.log("GOD FATHER: Server Engine Pulse Starting...");

  // In a real environment, you'd fetch these from a database/cache
  // For the prototype, we assume these are passed or stored centrally
  const botToken = process.env.TG_BOT_TOKEN || "";
  const chatId = process.env.TG_CHAT_ID || "";
  const template = process.env.TG_TEMPLATE || "";

  if (!botToken || !chatId) {
    return NextResponse.json({ error: 'Missing configuration' }, { status: 500 });
  }

  const results = [];

  // Parallel scan all indices
  for (const market of VOLATILITY_INDICES) {
    try {
      // Simulate fetching latest 10 ticks for strategy evaluation
      // In production, use the Deriv REST API or a managed WS bridge
      const mockTicks = Array.from({ length: 10 }, () => 100 + Math.random() * 50);
      const mockDigits = mockTicks.map(t => parseInt(t.toString().slice(-1)));

      // Check primary strategy: OVER/UNDER
      const signal = SignalStrategies.evaluateOverUnder(mockDigits);

      if (signal) {
        const dispatchResult = await dispatchSignalToTelegram({
          botToken,
          chatId,
          symbol: market.label,
          strategy: "OVER_UNDER (Scanner)",
          type: signal.type,
          price: signal.lastDigit,
          template,
          time: format(new Date(), 'HH:mm:ss'),
          rationale: signal.rationale,
          runs: 1
        });

        results.push({ market: market.value, signal: signal.type, sent: dispatchResult.success });
        
        // Break after one "Perfect Signal" per interval as requested
        break; 
      }
    } catch (e: any) {
      console.error(`Scanner error for ${market.value}:`, e.message);
    }
  }

  return NextResponse.json({ 
    timestamp: new Date().toISOString(), 
    status: "COMPLETE",
    findings: results.length > 0 ? results : "NO_PERFECT_SIGNALS_DETECTED"
  });
}
