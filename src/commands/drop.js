<<<<<<< HEAD
/**
 * commands/drop.js
 * Drop command handlers: /drop set, /drop now, /drop disable
 * Thin handlers - business logic in services.
 */

import { getDB } from "../db/mongo.js";
import { logger } from "../util/logger.js";
import { ErrorCode } from "../config.js";
import { successEmbed, errorEmbed } from "../util/replies.js";
import { arm, disarm } from "../services/scheduler.js";
import { executeDrop, notifyDropFailure } from "../services/dropService.js";

/**
 * Main drop command router
 * @param {ChatInputCommandInteraction} interaction
 * @returns {Promise<{ok: boolean, data?: any, error?: any}>}
 */
export default async function handleDrop(interaction) {
  const subcommand = interaction.options.getSubcommand();

  switch (subcommand) {
    case "set":
      return await handleDropSet(interaction);
    case "now":
      return await handleDropNow(interaction);
    case "disable":
      return await handleDropDisable(interaction);
    default:
      return {
        ok: false,
        error: {
          code: ErrorCode.BAD_REQUEST,
          message: "Unknown subcommand",
        },
      };
  }
}

/**
 * Handle /drop set <time> <#channel>
 */
async function handleDropSet(interaction) {
  try {
    const time = interaction.options.getString("time", true);
    const channel = interaction.options.getChannel("channel", true);
    const guildId = interaction.guildId;

    // Validate time format
    if (!/^\d{2}:\d{2}$/.test(time)) {
      await interaction.editReply({
        embeds: [
          errorEmbed(
            "Invalid Time Format",
            "Please use HH:MM format (e.g., 09:30, 21:00)"
          ),
        ],
      });
      return {
        ok: false,
        error: {
          code: ErrorCode.VALIDATION_FAILED,
          message: "Invalid time format",
        },
      };
    }

    // Validate channel is text-based
    if (!channel.isTextBased()) {
      await interaction.editReply({
        embeds: [errorEmbed("Invalid Channel", "Please select a text channel")],
      });
      return {
        ok: false,
        error: {
          code: ErrorCode.VALIDATION_FAILED,
          message: "Channel must be text-based",
        },
      };
    }

    // Save or update schedule in database
    const db = getDB();
    await db.collection("schedules").updateOne(
      { guildId, kind: "drop" },
      {
        $set: {
          channelId: channel.id,
          hhmm: time,
          enabled: true,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      { upsert: true }
    );

    // Arm scheduler
    const armResult = await arm({
      guildId,
      channelId: channel.id,
      kind: "drop",
      hhmm: time,
      handler: async ({ guildId, channelId }) => {
        // Scheduled drop handler
        const result = await executeDrop({
          client: interaction.client,
          channelId,
          guildId,
        });

        if (!result.ok) {
          await notifyDropFailure({
            client: interaction.client,
            guildId,
            channelId,
            error: result.error,
          });
        }
      },
    });

    if (!armResult.ok) {
      await interaction.editReply({
        embeds: [
          errorEmbed(
            "Schedule Failed",
            "Failed to schedule drop. Please try again."
          ),
        ],
      });
      return armResult;
    }

    await interaction.editReply({
      embeds: [
        successEmbed(
          "Drop Scheduled",
          `Daily drops will be posted at **${time}** in ${channel}.\n` +
            `Next drop will occur at the scheduled time.`
        ),
      ],
    });

    logger.command("/drop set success", {
      guildId,
      channelId: channel.id,
      time,
    });

    return { ok: true, data: { time, channelId: channel.id } };
  } catch (error) {
    logger.error("[CMD] /drop set failed", {
      guildId: interaction.guildId,
      error: error.message,
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.UNKNOWN,
        message: "Failed to set drop schedule",
        cause: error,
      },
    };
  }
}

/**
 * Handle /drop now
 */
async function handleDropNow(interaction) {
  try {
    const channelId = interaction.channelId;
    const guildId = interaction.guildId;

    // Execute drop immediately
    const result = await executeDrop({
      client: interaction.client,
      channelId,
      guildId,
    });

    if (!result.ok) {
      await interaction.editReply({
        embeds: [
          errorEmbed(
            "Drop Failed",
            result.error.code === ErrorCode.NOT_FOUND
              ? "No media available. Please add some media first."
              : "Failed to post media. Please check bot permissions."
          ),
        ],
      });
      return result;
    }

    await interaction.editReply({
      embeds: [
        successEmbed("Drop Posted!", `Media has been posted in this channel.`),
      ],
    });

    logger.command("/drop now success", {
      guildId,
      channelId,
      mediaId: result.data.mediaId,
    });

    return { ok: true, data: result.data };
  } catch (error) {
    logger.error("[CMD] /drop now failed", {
      guildId: interaction.guildId,
      error: error.message,
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.UNKNOWN,
        message: "Failed to execute drop",
        cause: error,
      },
    };
  }
}

/**
 * Handle /drop disable
 */
async function handleDropDisable(interaction) {
  try {
    const guildId = interaction.guildId;

    // Disable schedule in database
    const db = getDB();
    const result = await db
      .collection("schedules")
      .updateOne(
        { guildId, kind: "drop" },
        { $set: { enabled: false, updatedAt: new Date() } }
      );

    if (result.matchedCount === 0) {
      await interaction.editReply({
        embeds: [
          errorEmbed(
            "No Schedule Found",
            "There is no active drop schedule to disable."
          ),
        ],
      });
      return {
        ok: false,
        error: {
          code: ErrorCode.NOT_FOUND,
          message: "No drop schedule found",
        },
      };
    }

    // Disarm scheduler
    await disarm({ guildId, kind: "drop" });

    await interaction.editReply({
      embeds: [
        successEmbed(
          "Drops Disabled",
          "Scheduled drops have been disabled for this server.\n" +
            "Use `/drop set` to re-enable."
        ),
      ],
    });

    logger.command("/drop disable success", { guildId });

    return { ok: true, data: { disabled: true } };
  } catch (error) {
    logger.error("[CMD] /drop disable failed", {
      guildId: interaction.guildId,
      error: error.message,
    });
    return {
      ok: false,
      error: {
        code: ErrorCode.UNKNOWN,
        message: "Failed to disable drops",
        cause: error,
      },
    };
=======
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
>>>>>>> 8e08c6071dd76d67fb7ab80ef3afdfe83828445a
  }
}

export default { data, execute };
