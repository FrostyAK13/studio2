'use server';
/**
 * @fileOverview FROSTYTRADERS Signal Dispatcher Flow.
 * 
 * Uses Genkit to format market signals using a customizable template exactly as requested.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const DispatchInputSchema = z.object({
  botToken: z.string().describe('The Telegram Bot API token.'),
  chatId: z.string().describe('The destination Telegram Chat ID.'),
  symbol: z.string().describe('The market symbol.'),
  strategy: z.string().describe('The strategy name.'),
  type: z.string().describe('The specific signal type (direction).'),
  price: z.string().describe('The execution price (Entry Point).'),
  runs: z.number().optional().describe('Number of runs.'),
  template: z.string().describe('The custom template string with placeholders.'),
  time: z.string().describe('The formatted local time.'),
});

const DispatchOutputSchema = z.object({
  success: z.boolean(),
  messageId: z.string().optional(),
  error: z.string().optional(),
});

export async function dispatchSignalToTelegram(input: z.infer<typeof DispatchInputSchema>) {
  return dispatchSignalFlow(input);
}

const dispatchSignalFlow = ai.defineFlow(
  {
    name: 'dispatchSignalFlow',
    inputSchema: DispatchInputSchema,
    outputSchema: DispatchOutputSchema,
  },
  async (input) => {
    try {
      /**
       * Dynamically replace placeholders in the user-provided template.
       * This gives the user 100% control over the message format while the system
       * provides the high-precision data.
       */
      let message = input.template;
      message = message.replace(/{market}/g, input.symbol);
      message = message.replace(/{strategy}/g, input.strategy);
      message = message.replace(/{signal}/g, input.type);
      message = message.replace(/{entry}/g, input.price);
      message = message.replace(/{time}/g, input.time);
      message = message.replace(/{runs}/g, input.runs?.toString() || "1");
      message = message.replace(/{symbol}/g, input.symbol);
      
      // Handle remaining placeholders with defaults if needed
      message = message.replace(/{recovery}/g, "Martingale");
      message = message.replace(/{confidence}/g, "98%");
      message = message.replace(/{contact}/g, "@FrostyTradersSupport");
      message = message.replace(/{notes}/g, "Follow strict risk management.");

      const url = `https://api.telegram.org/bot${input.botToken}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: input.chatId,
          text: message,
          // Use Markdown to ensure links like the referral link work correctly
          parse_mode: 'Markdown',
        }),
      });

      const result = await response.json();

      if (!result.ok) {
        return { success: false, error: result.description };
      }

      return { success: true, messageId: result.result.message_id.toString() };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }
);
