// Slash command: /ingest "url"
// English-only.

import { SlashCommandBuilder } from 'discord.js';
import { upsertUrl } from '../services/ai/dataset.js';
import { incCounter, observeHistogram } from '../util/metrics.js';

export const data = new SlashCommandBuilder()
  .setName('ingest')
  .setDescription('Ingest a URL into the RAG dataset.')
  .addStringOption(o => o.setName('url').setDescription('HTTP/HTTPS URL').setRequired(true));

export async function execute(interaction) {
  const t0 = Date.now();
  await interaction.deferReply({ ephemeral: false });

  const url = interaction.options.getString('url', true);
  const res = await upsertUrl(url);

  if (!res.ok) {
    incCounter('commands_total', { command: 'ingest', outcome: 'error' });
    await interaction.editReply(`❌ Ingest failed: ${res.error.message}`);
  } else {
    incCounter('commands_total', { command: 'ingest', outcome: 'ok' });
    await interaction.editReply(`✅ Ingested: **${res.data.doc_id}** (chunks=${res.data.chunks})`);
  }

  observeHistogram('command_latency_seconds', (Date.now() - t0) / 1000, { command: 'ingest' });
}
