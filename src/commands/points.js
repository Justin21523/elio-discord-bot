// English-only code & comments.
// Slash command: /points (show, add, set, reset-season)
// - Uses services/points.js
// - Defers within 3s, friendly errors, embeds for nicer output.

import { SlashCommandBuilder, EmbedBuilder, userMention } from 'discord.js';
import * as Points from '../services/points.js';
import { ensureDeferred, safeEdit, formatErrorEmbed } from '../util/replies.js';
import { incCounter, startTimer, METRIC_NAMES } from '../util/metrics.js';
import { logger as baseLogger } from '../util/logger.js';

const log = baseLogger.child({ cmd: 'points' });

export const data = new SlashCommandBuilder()
  .setName('points')
  .setDescription('Show or manage points.')
  .addSubcommand(sc =>
    sc.setName('show')
      .setDescription('Show your (or someone else’s) profile.')
      .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(false))
  )
  .addSubcommand(sc =>
    sc.setName('add')
      .setDescription('Add points to a user (admin).')
      .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
      .addIntegerOption(o => o.setName('delta').setDescription('Points to add').setRequired(true))
  )
  .addSubcommand(sc =>
    sc.setName('set')
      .setDescription('Set user’s points directly (admin).')
      .addUserOption(o => o.setName('user').setDescription('Target user').setRequired(true))
      .addIntegerOption(o => o.setName('points').setDescription('New points').setRequired(true))
  )
  .addSubcommand(sc =>
    sc.setName('reset-season')
      .setDescription('Reset all points/levels for this guild (admin).')
  )
  .setDMPermission(false);

export async function execute(interaction) {
  const startedAt = Date.now();
  const stop = startTimer(METRIC_NAMES.command_latency_seconds, { command: 'points' });

  try {
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();
    await ensureDeferred(interaction, true);

    if (sub === 'show') {
      const target = interaction.options.getUser('user') || interaction.user;
      const res = await Points.getProfile(guildId, target.id);
      if (!res.ok) return safeEdit(interaction, formatErrorEmbed(res.error, 'Profile unavailable'));

      const p = res.data;
      const embed = new EmbedBuilder()
        .setColor(0x8be9fd)
        .setTitle('Points Profile')
        .setDescription(`${userMention(target.id)} in this guild`)
        .addFields(
          { name: 'Points', value: String(p.points ?? 0), inline: true },
          { name: 'Level', value: String(p.level ?? 0), inline: true },
          { name: 'Streak', value: String(p.streak ?? 0), inline: true },
        )
        .setFooter({ text: `Updated: ${new Date(p.updatedAt || Date.now()).toLocaleString()}` });

      await safeEdit(interaction, { embeds: [embed] });
      incCounter(METRIC_NAMES.commands_total, { command: 'points.show' }, 1);
      stop({ command: 'points' });
      return;
    }

    if (sub === 'add') {
      // NOTE: You can add your own permission guard here (e.g., mod/admin role).
      const target = interaction.options.getUser('user');
      const delta = interaction.options.getInteger('delta');
      const res = await Points.award(guildId, target.id, delta);
      if (!res.ok) return safeEdit(interaction, formatErrorEmbed(res.error, 'Award failed'));

      const embed = new EmbedBuilder()
        .setColor(0x50fa7b)
        .setTitle('Points Awarded')
        .setDescription(`${userMention(target.id)} received **+${delta}** points.`)
        .addFields(
          { name: 'New Points', value: String(res.data.points), inline: true },
          { name: 'Level', value: String(res.data.level), inline: true },
        );
      await safeEdit(interaction, { embeds: [embed] });
      incCounter(METRIC_NAMES.commands_total, { command: 'points.add' }, 1);
      stop({ command: 'points' });
      return;
    }

    if (sub === 'set') {
      const target = interaction.options.getUser('user');
      const points = interaction.options.getInteger('points');
      const res = await Points.setPoints(guildId, target.id, points);
      if (!res.ok) return safeEdit(interaction, formatErrorEmbed(res.error, 'Set failed'));

      const embed = new EmbedBuilder()
        .setColor(0xffb86c)
        .setTitle('Points Updated')
        .setDescription(`${userMention(target.id)} points have been set.`)
        .addFields(
          { name: 'Points', value: String(res.data.points), inline: true },
          { name: 'Level', value: String(res.data.level), inline: true },
        );
      await safeEdit(interaction, { embeds: [embed] });
      incCounter(METRIC_NAMES.commands_total, { command: 'points.set' }, 1);
      stop({ command: 'points' });
      return;
    }

    if (sub === 'reset-season') {
      const res = await Points.seasonalReset(guildId);
      if (!res.ok) return safeEdit(interaction, formatErrorEmbed(res.error, 'Reset failed'));

      const embed = new EmbedBuilder()
        .setColor(0xbd93f9)
        .setTitle('Seasonal Reset Done')
        .setDescription(`Reset **points/levels** for this guild.`)
        .addFields(
          { name: 'Matched', value: String(res.data.matched), inline: true },
          { name: 'Modified', value: String(res.data.modified), inline: true },
        );
      await safeEdit(interaction, { embeds: [embed] });
      incCounter(METRIC_NAMES.commands_total, { command: 'points.reset' }, 1);
      stop({ command: 'points' });
      return;
    }
  } catch (e) {
    log.error('[ERR] /points failed', { e: String(e), guildId: interaction.guildId, userId: interaction.user?.id });
    await safeEdit(interaction, {
      content: '❌ Unexpected error while handling `/points`.',
      ephemeral: true,
    });
    stop({ command: 'points' });
  } finally {
    const took = Date.now() - startedAt;
    log.info('[CMD] /points done', { guildId: interaction.guildId, channelId: interaction.channelId, userId: interaction.user?.id, tookMs: took });
  }
}

export default { data, execute };
