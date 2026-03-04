'use server';
/**
 * @fileOverview Telegram Signal Dispatcher Flow.
 * 
 * Uses Genkit to format market signals with a "God Father" persona and 
 * dispatches them to a Telegram Bot.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const DispatchInputSchema = z.object({
  botToken: z.string().describe('The Telegram Bot API token.'),
  chatId: z.string().describe('The destination Telegram Chat ID.'),
  symbol: z.string().describe('The market symbol (e.g., Volatility 100 Index).'),
  type: z.enum(['BUY', 'SELL', 'HOLD']).describe('The trading signal type.'),
  price: z.number().describe('The execution price.'),
});

const DispatchOutputSchema = z.object({
  success: z.boolean(),
  messageId: z.string().optional(),
  error: z.string().optional(),
});

export async function dispatchSignalToTelegram(input: z.infer<typeof DispatchInputSchema>) {
  return dispatchSignalFlow(input);
}

const formatPrompt = ai.definePrompt({
  name: 'formatSignalPrompt',
  input: { schema: DispatchInputSchema },
  prompt: `You are the "GOD FATHER" of market signals. Create a short, authoritative, and catchy Telegram message for the following signal.
  
  Symbol: {{{symbol}}}
  Action: {{{type}}}
  Price: {{{price}}}
  
  Use emojis and bold text. Include "GOD FATHER" branding. Output the final message text only.`,
});

const dispatchSignalFlow = ai.defineFlow(
  {
    name: 'dispatchSignalFlow',
    inputSchema: DispatchInputSchema,
    outputSchema: DispatchOutputSchema,
  },
  async (input) => {
    try {
      // 1. Format the message using AI
      const { text: formattedMessage } = await formatPrompt(input);

      // 2. Dispatch to Telegram API
      const url = `https://api.telegram.org/bot${input.botToken}/sendMessage`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: input.chatId,
          text: formattedMessage,
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
