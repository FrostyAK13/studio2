'use server';
/**
 * @fileOverview FrostyTraders Signal Dispatcher Flow.
 * 
 * Uses Genkit to format market signals with the custom FROSTYTRADERS template.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const DispatchInputSchema = z.object({
  botToken: z.string().describe('The Telegram Bot API token.'),
  chatId: z.string().describe('The destination Telegram Chat ID.'),
  symbol: z.string().describe('The market symbol.'),
  strategy: z.string().describe('The strategy name.'),
  type: z.string().describe('The specific signal (RISE, FALL, OVER 2, etc.).'),
  price: z.number().describe('The execution price.'),
  duration: z.string().optional().describe('Signal duration.'),
  runs: z.number().optional().describe('Number of runs.'),
  recovery: z.string().optional().describe('Recovery strategy.'),
  confidence: z.string().optional().describe('Confidence level.'),
  contact: z.string().optional().describe('Contact information.'),
  notes: z.string().optional().describe('Additional notes.'),
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
  prompt: `🚨 **FROSTYTRADERS – DERIV SIGNAL**

📊 **Market:** {{{symbol}}}
🤖 **Bot / Strategy:** {{{strategy}}}
🎯 **Signal :** {{{type}}}
📲 **Entry Point:** {{{price}}}
⏱ **Signal Duration:** {{#if duration}}{{{duration}}}{{else}}Instant{{/if}}
🔁 **Number of Runs:** {{#if runs}}{{{runs}}}{{else}}1{{/if}}
🔄 **Recovery:** {{#if recovery}}{{{recovery}}}{{else}}None{{/if}}
💪 **Confidence Level:** {{#if confidence}}{{{confidence}}}{{else}}95%{{/if}}

🚫 **Contact:** {{#if contact}}{{{contact}}}{{else}}@FrostyTradersSupport{{/if}}

📝 **Additional Notes:** {{#if notes}}{{{notes}}}{{else}}Follow risk management.{{/if}}


🔗 **Create a Deriv Trading Account** (https://deriv.com/signup?sidc=808C8BC1-CA13-4AE4-83EE-0A6513B55687&utm_campaign=dynamicworks&utm_medium=affiliate&utm_source=CU31372)

Instructions:
- Use the exact structure above.
- Do not add extra text outside the template.
- Ensure the referral link is preserved at the bottom.`,
});

const dispatchSignalFlow = ai.defineFlow(
  {
    name: 'dispatchSignalFlow',
    inputSchema: DispatchInputSchema,
    outputSchema: DispatchOutputSchema,
  },
  async (input) => {
    try {
      const { text: formattedMessage } = await formatPrompt(input);

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
