
'use server';
/**
 * @fileOverview Telegram Signal Dispatcher Flow.
 * 
 * Uses Genkit to format market signals with a "God Father" persona and 
 * dispatches them to a Telegram Bot. Supports advanced strategy types and runs.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const DispatchInputSchema = z.object({
  botToken: z.string().describe('The Telegram Bot API token.'),
  chatId: z.string().describe('The destination Telegram Chat ID.'),
  symbol: z.string().describe('The market symbol.'),
  type: z.string().describe('The specific signal type (RISE, FALL, OVER 2, UNDER 7, etc.).'),
  price: z.number().describe('The execution price.'),
  runs: z.number().optional().describe('Number of runs/duration for the trade.'),
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
  prompt: `You are the "GOD FATHER" of high-precision market signals. 
  Create an authoritative, punchy, and professional Telegram message for this signal.
  
  Symbol: {{{symbol}}}
  Signal Action: {{{type}}}
  Execution Price: {{{price}}}
  {{#if runs}}Suggested Runs: {{{runs}}}{{/if}}
  
  Instructions:
  - Use bold text for key details.
  - Use market-appropriate emojis (🚀, 📈, 📉, 🎯, ⚡).
  - Include "GOD FATHER INTELLIGENCE" branding.
  - Highlight the "ENTRY POINT" as the current price.
  - If runs are provided, emphasize that this is a SHORT DURATION entry.
  - Keep it concise for mobile users.
  - Output the final message text only.`,
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
