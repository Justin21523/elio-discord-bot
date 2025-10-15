// /src/commands/scheduler.js
// English-only code & comments.
// Slash command: /schedule set|list|remove|reload
// - set: upsert DB schedule and arm in memory
// - list: show schedules from DB for this guild
// - remove: disable + disarm
// - reload: disarm all for guild then arm from DB

import { SlashCommandBuilder, ChannelType, EmbedBuilder } from 'discord.js';
import { ensureDeferred, safeEdit, formatErrorEmbed } from '../util/replies.js';
import { collections } from '../db/mongo.js';
import Scheduler from '../services/scheduler.js';
import { incCounter, startTimer, METRIC_NAMES } from '../util/metrics.js';
import { logger } from '../util/logger.js';

const log = logger.child({ cmd: 'schedule' });

export const data = new SlashCommandBuilder()
  .setName('schedule')
  .setDescription('Manage scheduled jobs for this guild.')
  .addSubcommand(sc =>
    sc.setName('set')
      .setDescription('Create or update a daily schedule (UTC).')
      .addStringOption(o =>
        o.setName('kind')
          .setDescription('Job kind')
          .addChoices({ name: 'drop', value: 'drop' }, { name: 'greet', value: 'greet' })
          .setRequired(true)
      )
      .addStringOption(o => o.setName('hhmm').setDescription('HH:MM (UTC)').setRequired(true))
      .addChannelOption(o => o.setName('channel').setDescription('Target channel').addChannelTypes(ChannelType.GuildText).setRequired(true))
  )
  .addSubcommand(sc =>
    sc.setName('list')
      .setDescription('List current schedules for this guild.')
  )
  .addSubcommand(sc =>
    sc.setName('remove')
      .setDescription('Disable and remove a schedule')
      .addStringOption(o =>
        o.setName('kind')
          .setDescription('Job kind to remove')
          .addChoices({ name: 'drop', value: 'drop' }, { name: 'greet', value: 'greet' })
          .setRequired(true)
      )
  )
  .addSubcommand(sc =>
    sc.setName('reload')
      .setDescription('Reload schedules from DB for this guild.')
  )
  .setDMPermission(false);

export async function execute(interaction) {
  const stop = startTimer(METRIC_NAMES.command_latency_seconds, { command: 'schedule' });
  try {
    await ensureDeferred(interaction, true);
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    if (sub === 'set') {
      const kind = interaction.options.getString('kind', true);
      const hhmm = interaction.options.getString('hhmm', true);
      const channel = interaction.options.getChannel('channel', true);

      // Write to DB
      await collections('schedules').updateOne(
        { guildId: String(guildId), kind },
        {
          $set: {
            guildId: String(guildId),
            channelId: String(channel.id),
            kind,
            hhmm: String(hhmm),
            enabled: true,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() }
        },
        { upsert: true }
      );

      // Arm
      const armed = await Scheduler.arm({ guildId: String(guildId), channelId: String(channel.id), kind, hhmm });
      if (!armed.ok) return safeEdit(interaction, formatErrorEmbed(armed.error, 'Arm failed'));

      await safeEdit(interaction, { content: `🗓️ **${kind}** scheduled at **${hhmm} UTC** → <#${channel.id}>` });
      incCounter(METRIC_NAMES.commands_total, { command: 'schedule.set' }, 1);
      stop(); return;
    }

    if (sub === 'list') {
      const rows = await collections('schedules').find({ guildId: String(guildId) }).sort({ kind: 1 }).toArray();
      if (!rows.length) {
        await safeEdit(interaction, { content: 'No schedules found.' });
        stop(); return;
      }
      const desc = rows.map(r => `• **${r.kind}** → <#${r.channelId}> at \`${r.hhmm} UTC\`  (${r.enabled ? 'enabled' : 'disabled'})`).join('\n');
      const embed = new EmbedBuilder().setTitle('Schedules').setColor(0x00bcd4).setDescription(desc);
      await safeEdit(interaction, { embeds: [embed] });
      incCounter(METRIC_NAMES.commands_total, { command: 'schedule.list' }, 1);
      stop(); return;
    }

    if (sub === 'remove') {
      const kind = interaction.options.getString('kind', true);
      await collections('schedules').updateOne(
        { guildId: String(guildId), kind },
        { $set: { enabled: false, updatedAt: new Date() } }
      );
      await Scheduler.disarm({ guildId: String(guildId), kind });
      await safeEdit(interaction, { content: `🧹 Removed schedule **${kind}** (disabled + disarmed).` });
      incCounter(METRIC_NAMES.commands_total, { command: 'schedule.remove' }, 1);
      stop(); return;
    }

    if (sub === 'reload') {
      const res = await Scheduler.reloadForGuild(String(guildId));
      if (!res.ok) return safeEdit(interaction, formatErrorEmbed(res.error, 'Reload failed'));
      await safeEdit(interaction, { content: `♻️ Reloaded schedules for this guild (armed: ${res.data.armed}).` });
      incCounter(METRIC_NAMES.commands_total, { command: 'schedule.reload' }, 1);
      stop(); return;
    }

    await safeEdit(interaction, { content: 'Unknown subcommand.' });
    stop();
  } catch (e) {
    log.error('schedule command failed', { e: String(e), guildId: interaction.guildId, userId: interaction.user?.id });
    await safeEdit(interaction, { content: '⚠️ Something went wrong with /schedule.' });
    stop();
  }
}

export default { data, execute };
