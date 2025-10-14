// /schedule set|list|remove|reload
// English-only. SLO: defer ≤3s; structured logs/metrics.

import { SlashCommandBuilder, ChannelType } from 'discord.js';
import * as scheduler from '../services/scheduler.js';
import { incCounter, observeHistogram } from '../util/metrics.js';
import { logError } from '../util/logger.js';

export const data = new SlashCommandBuilder()
  .setName('schedule')
  .setDescription('Manage scheduled jobs (daily).')
  .addSubcommand(sc =>
    sc.setName('set')
      .setDescription('Create/update a job (daily HH:MM).')
      .addStringOption(o => o.setName('kind').setDescription('Job kind').setRequired(true)
        .addChoices(
          { name: 'heartbeat', value: 'heartbeat' },
          { name: 'cosmic_digest', value: 'cosmic_digest' },
          { name: 'rag_digest', value: 'rag_digest' },
        ))
      .addStringOption(o => o.setName('hhmm').setDescription('24h time, e.g., 09:30').setRequired(true))
      .addChannelOption(o => o.setName('channel').setDescription('Target channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
      .addStringOption(o => o.setName('query').setDescription('query for cosmic_digest (optional)'))
      .addStringOption(o => o.setName('namespace').setDescription('namespace for rag_digest (optional)')))
  .addSubcommand(sc => sc.setName('list').setDescription('List jobs for this guild.'))
  .addSubcommand(sc => sc.setName('remove').setDescription('Remove a job').addStringOption(o => o.setName('kind').setDescription('Job kind').setRequired(true)))
  .addSubcommand(sc => sc.setName('reload').setDescription('Reload all jobs for this guild.'));

export async function execute(interaction) {
  const t0 = Date.now();
  await interaction.deferReply({ ephemeral: true });
  const guildId = interaction.guildId;

  try {
    const sub = interaction.options.getSubcommand(true);

    if (sub === 'set') {
      const kind = interaction.options.getString('kind', true);
      const hhmm = interaction.options.getString('hhmm', true);
      const channel = interaction.options.getChannel('channel', true);
      const query = interaction.options.getString('query');
      const namespace = interaction.options.getString('namespace');
      const meta = {};
      if (query) meta.query = query;
      if (namespace) meta.namespace = namespace;

      const res = await scheduler.arm({ guildId, channelId: channel.id, kind, hhmm, meta });
      if (!res.ok) throw new Error(`${res.error.code}: ${res.error.message}`);
      await interaction.editReply(`✅ Armed **${kind}** at **${hhmm}** → <#${channel.id}>`);
      incCounter('commands_total', { command: 'schedule_set', outcome: 'ok' });
      return;
    }

    if (sub === 'list') {
      const res = await scheduler.list(guildId);
      if (!res.ok) throw new Error(`${res.error.code}: ${res.error.message}`);
      const lines = res.data.map(j => `• **${j.kind}** at **${j.hhmm}** → <#${j.channelId}> ${j.enabled ? 'ON' : 'OFF'} ${j.meta ? '`meta`' : ''}`).join('\n') || '(none)';
      await interaction.editReply(lines);
      incCounter('commands_total', { command: 'schedule_list', outcome: 'ok' });
      return;
    }

    if (sub === 'remove') {
      const kind = interaction.options.getString('kind', true);
      const res = await scheduler.remove({ guildId, kind });
      if (!res.ok) throw new Error(`${res.error.code}: ${res.error.message}`);
      await interaction.editReply(res.data.deleted ? `🗑️ Removed **${kind}**` : `⚠️ Not found: ${kind}`);
      incCounter('commands_total', { command: 'schedule_remove', outcome: 'ok' });
      return;
    }

    if (sub === 'reload') {
      const res = await scheduler.reloadForGuild(guildId);
      if (!res.ok) throw new Error(`${res.error.code}: ${res.error.message}`);
      await interaction.editReply(`🔄 Reloaded ${res.data.count} job(s).`);
      incCounter('commands_total', { command: 'schedule_reload', outcome: 'ok' });
      return;
    }
  } catch (e) {
    logError('[CMD]', { guildId, command: 'schedule', error: String(e) });
    await interaction.editReply('❌ Schedule command failed.');
    incCounter('commands_total', { command: 'schedule', outcome: 'error' });
  } finally {
    observeHistogram('command_latency_seconds', (Date.now() - t0) / 1000, { command: 'schedule' });
  }
}
