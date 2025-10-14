// /src/commands/rag-admin.js
// English-only code & comments.
//
// Slash command: /rag-admin export|purge
// NOTE: keep this handler thin; business logic lives in services.

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { exportData, purge } from '../services/ai/rag_admin.js';
import { logger } from '../util/logger.js';

export const data = new SlashCommandBuilder()
  .setName('rag-admin')
  .setDescription('RAG maintenance utilities (export/purge).')
  .addSubcommand(sub =>
    sub.setName('export')
      .setDescription('Export RAG documents for auditing.')
      .addIntegerOption(o => o.setName('limit').setDescription('Max docs to export (default 200).').setMinValue(1).setMaxValue(2000))
  )
  .addSubcommand(sub =>
    sub.setName('purge')
      .setDescription('Purge documents by age/source. Use carefully!')
      .addIntegerOption(o => o.setName('older_days').setDescription('Delete docs older than N days.').setMinValue(1))
      .addStringOption(o => o.setName('source').setDescription('Filter by source tag (optional).'))
      .addBooleanOption(o => o.setName('confirm').setDescription('Set true to confirm deletion.'))
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const meta = { guildId: interaction.guildId, channelId: interaction.channelId, userId: interaction.user.id };

  await interaction.deferReply({ ephemeral: true }).catch(() => {});

  try {
    if (sub === 'export') {
      const limit = interaction.options.getInteger('limit') ?? 200;
      const res = await exportData({ limit, format: 'json' });
      if (!res.ok) {
        logger.error({ ...meta, err: res.error }, '[CMD] /rag-admin export failed');
        return interaction.editReply(`❌ Export failed: ${res.error.code} – ${res.error.message}`);
      }
      const d = res.data;
      const stats = d.stats || {};
      const embed = new EmbedBuilder()
        .setTitle('RAG Export')
        .setColor(0x2196f3)
        .setDescription('Export completed.')
        .addFields(
          { name: 'Docs', value: String(stats.docs ?? d.count ?? 'n/a'), inline: true },
          { name: 'Chunks', value: String(stats.chunks ?? 'n/a'), inline: true },
          { name: 'Unique sources', value: String((stats.sources && stats.sources.length) || 'n/a'), inline: true },
        )
        .setFooter({ text: 'Data is provided inline or stored server-side depending on sidecar config.' })
        .setTimestamp(new Date());

      // If sidecar returned a sample (first N records), show a compact snippet
      let content = '';
      if (Array.isArray(d.sample) && d.sample.length) {
        const preview = d.sample.slice(0, 3).map((x, i) => `#${i + 1} • source=${x.source || 'n/a'} • len=${(x.text || '').length}`).join('\n');
        content = '```text\n' + preview + '\n```';
      }
      return interaction.editReply({ embeds: [embed], content });
    }

    if (sub === 'purge') {
      const olderThanDays = interaction.options.getInteger('older_days') ?? undefined;
      const source = interaction.options.getString('source') ?? undefined;
      const confirm = interaction.options.getBoolean('confirm') ?? false;

      const res = await purge({ olderThanDays, source, confirm });
      if (!res.ok) {
        logger.error({ ...meta, err: res.error }, '[CMD] /rag-admin purge failed');
        return interaction.editReply(`❌ Purge failed: ${res.error.code} – ${res.error.message}`);
      }
      const d = res.data;
      const embed = new EmbedBuilder()
        .setTitle('RAG Purge')
        .setColor(confirm ? 0xff7043 : 0xffc107)
        .setDescription(confirm ? 'Deletion executed.' : 'Dry-run preview (set confirm=true to delete).')
        .addFields(
          { name: 'Matched docs', value: String(d.matched_docs ?? 'n/a'), inline: true },
          { name: 'Matched chunks', value: String(d.matched_chunks ?? 'n/a'), inline: true },
          { name: 'Deleted', value: String(d.deleted ?? 0), inline: true },
        )
        .setFooter({ text: source ? `filter: source=${source}` : (olderThanDays ? `older_than_days=${olderThanDays}` : 'no filters') })
        .setTimestamp(new Date());

      return interaction.editReply({ embeds: [embed] });
    }

    return interaction.editReply('Unknown subcommand.');
  } catch (err) {
    logger.error({ ...meta, err }, '[CMD] /rag-admin crashed');
    return interaction.editReply('❌ Internal error.');
  }
}
