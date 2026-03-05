
'use server';
/**
 * @fileOverview FROSTYTRADERS Signal Dispatcher Flow.
 * 
 * Uses Genkit to format market signals using a customizable template.
 * Now dynamically handles the {notes} placeholder for signal rationale.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const DispatchInputSchema = z.object({
  botToken: z.string().describe('The Telegram Bot API token.'),
  chatId: z.string().describe('The destination Telegram Chat ID.'),
  symbol: z.string().describe('The market symbol.'),
  strategy: z.string().describe('The strategy name.'),
  type: z.string().describe('The specific signal type.'),
  price: z.string().describe('The execution price (plain last digit).'),
  runs: z.number().optional().describe('Number of runs.'),
  template: z.string().describe('The custom template string with placeholders.'),
  time: z.string().describe('The formatted local time.'),
  rationale: z.string().optional().describe('The reason for the signal.'),
});

const DispatchOutputSchema = z.object({
  success: z.boolean(),
  messageId: z.string().optional(),
  error: z.string().optional(),
});

/**
 * Server Action wrapper with robust error handling for the Next.js environment.
 */
export async function dispatchSignalToTelegram(input: z.infer<typeof DispatchInputSchema>) {
  try {
    return await dispatchSignalFlow(input);
  } catch (e: any) {
    console.error("Signal Dispatch Error:", e);
    return { 
      success: false, 
      error: e.message || "An unexpected error occurred during dispatch." 
    };
  }
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
       * Dynamically replace placeholders in the template.
       */
      let message = input.template;
      message = message.replace(/{market}/g, input.symbol);
      message = message.replace(/{strategy}/g, input.strategy);
      message = message.replace(/{signal}/g, input.type);
      message = message.replace(/{entry}/g, input.price);
      message = message.replace(/{time}/g, input.time);
      message = message.replace(/{runs}/g, input.runs?.toString() || "1");
      
      // Default mappings if missing in specific inputs
      message = message.replace(/{timeframe}/g, "5m");
      message = message.replace(/{recovery}/g, "Martingale");
      message = message.replace(/{confidence}/g, "98%");
      message = message.replace(/{contact}/g, "@FrostyTradersSupport");
      
      // Inject the dynamic rationale into the {notes} placeholder
      message = message.replace(/{notes}/g, input.rationale || "Follow strict risk management.");

      const botToken = input.botToken.trim();
      const chatId = input.chatId.trim();

      if (!botToken || !chatId) {
        return { success: false, error: "Bot Token or Chat ID is missing." };
      }

      const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: false
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const result = await response.json();

      if (!result.ok) {
        return { 
          success: false, 
          error: `Telegram Error: ${result.description}` 
        };
      }

      return { success: true, messageId: result.result.message_id.toString() };
    } catch (e: any) {
      if (e.name === 'AbortError') {
        return { success: false, error: "Telegram API request timed out." };
      }
      return { success: false, error: `System Error: ${e.message}` };
    }
  }
);
