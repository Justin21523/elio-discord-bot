// src/commands/greet.js
// Slash command skeleton for daily greetings.
// Phase B: store schedule + lightweight preview by sampling DB.
// Phase C: scheduler will call a greetings service to post image + phrase.

import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
} from "discord.js";
import { collections } from "../db/mongo.js";
import { safeDefer, edit } from "../util/replies.js";

const HHMM_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export const data = new SlashCommandBuilder()
  .setName("greet")
  .setDescription("Daily greeting settings and preview")
  .addSubcommand((sc) =>
    sc
      .setName("set")
      .setDescription("Schedule a daily greeting at HH:MM in a channel")
      .addStringOption((o) =>
        o.setName("time").setDescription("HH:MM (24h)").setRequired(true)
      )
      .addChannelOption((o) =>
        o
          .setName("channel")
          .setDescription("Target channel for greetings")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
      .addStringOption((o) =>
        o
          .setName("tags")
          .setDescription(
            'Comma separated tags to filter media/greetings, e.g., "elio"'
          )
      )
      .addStringOption((o) =>
        o
          .setName("mention")
          .setDescription("Mention when posting")
          .addChoices(
            { name: "none", value: "none" },
            { name: "@here", value: "here" }
          )
      )
  )
  .addSubcommand((sc) =>
    sc
      .setName("preview")
      .setDescription(
        "Preview a random greeting (image + phrase) based on optional tags"
      )
      .addStringOption((o) =>
        o.setName("tags").setDescription('Comma separated tags, e.g., "elio"')
      )
  )
  .addSubcommand((sc) =>
    sc
      .setName("toggle")
      .setDescription("Enable/disable daily greeting for this guild")
      .addStringOption((o) =>
        o
          .setName("state")
          .setDescription("on/off")
          .setRequired(true)
          .addChoices(
            { name: "on", value: "on" },
            { name: "off", value: "off" }
          )
      )
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

export async function execute(interaction) {
  try {
    await safeDefer(interaction, true);
    const sub = interaction.options.getSubcommand();

    if (sub === "set") {
      const hhmm = interaction.options.getString("time", true);
      if (!HHMM_RE.test(hhmm)) {
        return edit(
          interaction,
          "Invalid time. Please use **HH:MM** in 24h format (e.g., `09:30`)."
        );
      }
      const channel = interaction.options.getChannel("channel", true);
      const rawTags = interaction.options.getString("tags") || "";
      const tags = rawTags
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      const mention = interaction.options.getString("mention") || "none";

      const { schedules } = collections();
      // We keep one document per guild for simplicity.
      await schedules.updateOne(
        { guildId: interaction.guildId },
        {
          $set: {
            guildId: interaction.guildId,
            channelId: channel.id,
            hhmm,
            kind: "greet",
            tags,
            mention,
            enabled: true,
            updatedAt: new Date(),
          },
        },
        { upsert: true }
      );

      // Phase C will arm a dedicated greeting job from scheduler.
      return edit(
        interaction,
        `Saved greeting schedule at **${hhmm}** in <#${channel.id}> (tags: ${
          tags.join(", ") || "none"
        }, mention: ${mention}).`
      );
    }

    if (sub === "toggle") {
      const state = interaction.options.getString("state", true);
      const enabled = state === "on";
      const { schedules } = collections();
      const res = await schedules.updateOne(
        { guildId: interaction.guildId },
        { $set: { enabled, updatedAt: new Date() } }
      );
      if (!res.matchedCount) {
        return edit(
          interaction,
          "No greeting schedule found. Use `/greet set` first."
        );
      }
      return edit(
        interaction,
        `Greeting schedule is now **${enabled ? "enabled" : "disabled"}**.`
      );
    }

    if (sub === "preview") {
      const rawTags = interaction.options.getString("tags") || "";
      const tags = rawTags
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      const { greetings, media } = collections();

      // Pick a random greeting phrase (filtered by tags when provided).
      const gMatch = {
        enabled: true,
        ...(tags.length ? { tags: { $in: tags } } : {}),
      };
      const g = await greetings
        .aggregate([{ $match: gMatch }, { $sample: { size: 1 } }])
        .toArray();
      const phrase = g[0]?.text || "Hello! (no greetings found)";

      // Pick a random media (respect enabled, nsfw filtering is not needed in preview).
      const mMatch = {
        enabled: true,
        ...(tags.length ? { tags: { $in: tags } } : {}),
      };
      const m = await media
        .aggregate([{ $match: mMatch }, { $sample: { size: 1 } }])
        .toArray();
      const url = m[0]?.url;

      const text = `Preview:\n> ${phrase}\n${
        url ? url : "_No media found for given tags_"
      }\n\n(Phase C will post this daily by schedule.)`;
      return edit(interaction, text);
    }

    return edit(interaction, "Unknown subcommand.");
  } catch (err) {
    console.error("[ERR] /greet failed:", err);
    return edit(interaction, "Something went wrong while handling /greet.");
  }
}
