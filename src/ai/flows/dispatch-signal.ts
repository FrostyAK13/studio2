'use server';
/**
 * @fileOverview EMPORER Signal Dispatcher Flow.
 * 
 * Uses Genkit to format market signals using a customizable template.
 * Optimized for robustness in Next.js Server Action environments.
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
 * Ensures the response is always a plain serializable object.
 */
export async function dispatchSignalToTelegram(input: z.infer<typeof DispatchInputSchema>) {
  try {
    // Basic input sanitation
    const cleanInput = {
      ...input,
      botToken: input.botToken?.trim(),
      chatId: input.chatId?.trim(),
    };

    if (!cleanInput.botToken || !cleanInput.chatId) {
      return { success: false, error: "Configuration Missing: Bot Token or Chat ID not found." };
    }

    const result = await dispatchSignalFlow(cleanInput);
    return JSON.parse(JSON.stringify(result)); // Force serializable plain object
  } catch (e: any) {
    console.error("EMPORER Signal Dispatch Error:", e);
    return { 
      success: false, 
      error: e.message || "An unexpected error occurred during dispatch. Please check your bot settings." 
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
      message = message.replace(/{recovery}/g, "Martingale @ 2.5");
      message = message.replace(/{confidence}/g, "98.4%");
      message = message.replace(/{contact}/g, "@FrostyTradersSupport");
      
      // Inject the dynamic rationale into the {notes} placeholder
      message = message.replace(/{notes}/g, input.rationale || "Follow strict risk management. One-shot entry.");

      const url = `https://api.telegram.org/bot${input.botToken}/sendMessage`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000); // 12s timeout for Server Actions

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: input.chatId,
          text: message,
          parse_mode: 'HTML',
          disable_web_page_preview: false
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        return { 
          success: false, 
          error: `Telegram API responded with error: ${response.status} ${errorText}` 
        };
      }

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
        return { success: false, error: "Telegram API request timed out. High network latency detected." };
      }
      return { success: false, error: `System Dispatch Error: ${e.message}` };
    }
  }
);