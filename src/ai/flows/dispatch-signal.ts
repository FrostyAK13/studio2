'use server';
/**
 * @fileOverview EMPORER Signal Dispatcher Flow.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const DispatchInputSchema = z.object({
  botToken: z.string(),
  chatId: z.string(),
  symbol: z.string(),
  strategy: z.string(),
  type: z.string(),
  price: z.string(),
  runs: z.number().optional(),
  template: z.string(),
  time: z.string(),
  rationale: z.string().optional(),
});

const DispatchOutputSchema = z.object({
  success: z.boolean(),
  messageId: z.string().optional(),
  error: z.string().optional(),
});

export async function dispatchSignalToTelegram(input: z.infer<typeof DispatchInputSchema>) {
  try {
    const result = await dispatchSignalFlow(input);
    // Return a simple plain object to avoid serialization errors in Next.js Server Actions
    return {
      success: !!result.success,
      messageId: result.messageId || undefined,
      error: result.error || undefined
    };
  } catch (e: any) {
    return { success: false, error: e.message || "Unknown error" };
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
      let message = input.template;
      message = message.replace(/{market}/g, input.symbol);
      message = message.replace(/{strategy}/g, input.strategy);
      message = message.replace(/{signal}/g, input.type);
      message = message.replace(/{entry}/g, input.price);
      message = message.replace(/{time}/g, input.time);
      message = message.replace(/{runs}/g, input.runs?.toString() || "1");
      message = message.replace(/{notes}/g, input.rationale || "Follow strict risk management. One-shot entry.");

      const url = `https://api.telegram.org/bot${input.botToken}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: input.chatId,
          text: message,
          parse_mode: 'HTML',
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        return { success: false, error: `Telegram Error: ${response.status} ${err}` };
      }

      const result = await response.json();
      if (!result.ok) return { success: false, error: result.description };

      return { success: true, messageId: result.result.message_id.toString() };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }
);
