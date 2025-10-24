/**
 * commands/drop.js
 * Drop command handlers: /drop set, /drop now, /drop disable
 * Thin handlers - business logic in services.
 */

import { SlashCommandBuilder } from "discord.js";
import { getDb as getDB } from "../db/mongo.js";
import { logger } from "../util/logger.js";
import { ErrorCodes as ErrorCode } from "../config.js";
import { successEmbed, errorEmbed } from "../util/replies.js";
import { arm, disarm } from "../services/scheduler.js";
import { executeDrop, notifyDropFailure } from "../services/mediaRepo.js";

export const data = new SlashCommandBuilder()
  .setName("drop")
  .setDescription("Manage media drops")
  .addSubcommand((sub) =>
    sub
      .setName("set")
      .setDescription("Schedule daily drops")
      .addStringOption((opt) =>
        opt
          .setName("time")
          .setDescription("Time in HH:MM format (e.g., 09:30)")
          .setRequired(true)
      )
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("Channel for drops")
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("now").setDescription("Post a drop immediately")
  )
  .addSubcommand((sub) =>
    sub.setName("disable").setDescription("Disable scheduled drops")
  );

/**
 * Main drop command router
 * @param {ChatInputCommandInteraction} interaction
 * @returns {Promise<{ok: boolean, data?: any, error?: any}>}
 */
export async function execute(interaction) {
  await interaction.deferReply();
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
  }
}
