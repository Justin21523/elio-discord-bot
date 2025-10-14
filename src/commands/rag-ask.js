// Slash command: /rag-ask "question" [top_k] [mode]
// English-only code/comments.

import { SlashCommandBuilder } from 'discord.js';
import { answer as ragAnswer } from '../services/ai/rag.js';
import { incCounter, observeHistogram } from '../util/metrics.js';
import { logError } from '../util/logger.js';

export const data = new SlashCommandBuilder()
  .setName('rag-ask')
  .setDescription('Ask a question with RAG (advanced by default).')
  .addStringOption(o => o.setName('question').setDescription('Your question').setRequired(true))
  .addIntegerOption(o => o.setName('top_k').setDescription('Number of chunks (default 8)'))
  .addStringOption(o =>
    o.setName('mode').setDescription('Retrieval mode').addChoices(
      { name: 'advanced', value: 'advanced' },
      { name: 'hybrid', value: 'hybrid' },
      { name: 'semantic', value: 'semantic' },
      { name: 'bm25', value: 'bm25' },
    ),
  );

export async function execute(interaction) {
  const t0 = Date.now();
  await interaction.deferReply({ ephemeral: false });

  const question = interaction.options.getString('question', true);
  const top_k = interaction.options.getInteger('top_k') ?? 8;
  const mode = interaction.options.getString('mode') ?? 'advanced';

  const ctx = { guildId: interaction.guildId, channelId: interaction.channelId, userId: interaction.user.id };

  const res = await ragAnswer(question, { top_k, mode });
  if (!res.ok) {
    incCounter('commands_total', { command: 'rag-ask', outcome: 'error' });
    logError('[CMD]', { ...ctx, command: 'rag-ask', error: res.error });
    await interaction.editReply(`❌ RAG error: ${res.error.message}`);
  } else {
    incCounter('commands_total', { command: 'rag-ask', outcome: 'ok' });
    const ans = res.data.answer ?? '(no answer)';
    const ctxLines = (res.data.context ?? []).slice(0, 5).map((c, i) => `[\`${(c.score ?? 0).toFixed(3)}\`] ${String(c.metadata?.source_url ?? c.id)} `);
    await interaction.editReply(`${ans}\n\n**Context**\n${ctxLines.join('\n')}`);
  }

  observeHistogram('command_latency_seconds', (Date.now() - t0) / 1000, { command: 'rag-ask' });
}
