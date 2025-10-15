// /src/commands/drop.js
// Slash command: /drop set | now
// UX: defer within 3s, friendly errors, logs + metrics.

import { SlashCommandBuilder } from 'discord.js';
import { logger } from '../util/logger.js';
import { incCounter, startTimer, METRIC_NAMES } from '../util/metrics.js';
import MediaRepo from '../services/mediaRepo.js';
import Scheduler from '../services/scheduler.js';
import { collections } from '../db/mongo.js';

const log = logger.child({ cmd: 'drop' });

export const data = new SlashCommandBuilder()
  .setName('drop')
  .setDescription('Random media drop controls (admin)')
  .addSubcommand((s) =>
    s
      .setName('now')
      .setDescription('Post a random media drop to the current channel')
  )
  .addSubcommand((s) =>
    s
      .setName('set')
      .setDescription('Schedule a daily drop in this channel (HH:MM UTC)')
      .addStringOption((o) =>
        o.setName('hhmm').setDescription('HH:MM (UTC)').setRequired(true)
      )
  );

export async function execute(interaction) {
  const stopLatency = startTimer(METRIC_NAMES.command_latency_seconds, {
    command: 'drop',
  });
  const { guildId, channelId, user } = interaction;

  try {
    await interaction.deferReply({ ephemeral: true });

    const sub = interaction.options.getSubcommand();

    if (sub === 'now') {
      // Pick & send
      const pick = await MediaRepo.pickRandom({ nsfwAllowed: false });
      if (!pick.ok) throw new Error(pick.error.message);
      if (!pick.data) {
        await interaction.editReply('No media available right now.');
        return;
      }

      const media = pick.data;
      const content = media.type === 'gif' ? media.url : undefined;
      const embed =
        media.type === 'image'
          ? {
              title: '🎁 Drop',
              description: media.tags?.length
                ? `Tags: ${media.tags.join(', ')}`
                : undefined,
              image: { url: media.url },
            }
          : undefined;

      await interaction.channel.send({
        content,
        embeds: embed ? [embed] : [],
      });

      incCounter(METRIC_NAMES.commands_total, { command: 'drop_now' }, 1);
      await interaction.editReply('Drop sent ✅');
      stopLatency();
      return;
    }

    if (sub === 'set') {
      const hhmm = interaction.options.getString('hhmm');
      // Upsert schedule in DB
      await collections('schedules').updateOne(
        { guildId: String(guildId), kind: 'drop' },
        {
          $set: {
            guildId: String(guildId),
            channelId: String(channelId),
            kind: 'drop',
            hhmm: String(hhmm),
            enabled: true,
            updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        { upsert: true }
      );

      // Arm scheduler
      const armed = await Scheduler.arm({
        guildId: String(guildId),
        channelId: String(channelId),
        kind: 'drop',
        hhmm: String(hhmm),
      });
      if (!armed.ok) throw new Error(armed.error.message);

      incCounter(METRIC_NAMES.commands_total, { command: 'drop_set' }, 1);
      await interaction.editReply(`Daily drop scheduled at ${hhmm} UTC ✅`);
      stopLatency();
      return;
    }

    await interaction.editReply('Unknown subcommand.');
    stopLatency();
  } catch (e) {
    log.error('command failed', {
      guildId,
      channelId,
      userId: user?.id,
      e: String(e),
    });
    stopLatency();
    await interaction.editReply('Something went wrong (drop).');
  }
}

export default { data, execute };
