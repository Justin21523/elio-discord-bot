// Slash command: /web "query" [n]
// English-only.

import { SlashCommandBuilder } from 'discord.js';
import { search } from '../services/ai/web.js';
import { incCounter, observeHistogram } from '../util/metrics.js';

export const data = new SlashCommandBuilder()
  .setName('web')
  .setDescription('Quick web search (allowlisted domains).')
  .addStringOption(o => o.setName('query').setDescription('Search query').setRequired(true))
  .addIntegerOption(o => o.setName('n').setDescription('Max results (1..10)').setMinValue(1).setMaxValue(10));

export async function execute(interaction) {
  const t0 = Date.now();
  await interaction.deferReply({ ephemeral: false });

  const q = interaction.options.getString('query', true);
  const n = interaction.options.getInteger('n') ?? 6;
  const res = await search(q, n);

  if (!res.ok) {
    incCounter('commands_total', { command: 'web', outcome: 'error' });
    await interaction.editReply('❌ Web search failed.');
  } else {
    incCounter('commands_total', { command: 'web', outcome: 'ok' });
    const items = res.data.results ?? [];
    const lines = items.map((x, i) => `**${i + 1}.** ${x.title}\n<${x.url}>`);
    await interaction.editReply(lines.join('\n\n') || 'No results.');
  }

  observeHistogram('command_latency_seconds', (Date.now() - t0) / 1000, { command: 'web' });
}
