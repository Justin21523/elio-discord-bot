// src/commands/scenario.js
// Slash command skeleton for scenario multiple-choice game.
// Phase B: start a session, show A/B/C/D buttons, record one answer per user.
// Phase C: add reveal timing, correctness scoring, and leaderboard integration.

import {
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from "discord.js";
import { startSession } from "../services/scenario.js";
import { ObjectId } from "mongodb";
import { collections } from "../db/mongo.js";
import { safeDefer, edit } from "../util/replies.js";

export const data = new SlashCommandBuilder()
  .setName("scenario")
  .setDescription("Scenario multiple-choice game")
  .addSubcommand((sc) =>
    sc
      .setName("start")
      .setDescription("Start a random scenario")
      .addStringOption((o) => o.setName("tag").setDescription("Filter by tag"))
      .addIntegerOption((o) =>
        o
          .setName("reveal_in")
          .setDescription("Reveal in minutes (0 = instant, Phase C)")
          .setMinValue(0)
          .setMaxValue(120)
      )
  )
  .addSubcommand((sc) =>
    sc
      .setName("stats")
      .setDescription("Show stats for the latest scenario in this channel")
  );

export async function execute(interaction, client) {
  try {
    await safeDefer(interaction, true);
    const sub = interaction.options.getSubcommand();

    if (sub === "start") {
      const tag = interaction.options.getString("tag") || null;
      const revealIn = interaction.options.getInteger("reveal_in") ?? 0;

      const { sessionId } = await startSession(client, {
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        tag,
        revealIn,
      });

      return edit(
        interaction,
        `Scenario posted! (session: \`${sessionId}\`, reveal in ${revealIn}m)`
      );
    }

    // stats unchanged from Phase B
    if (sub === "stats") {
      const { scenario_sessions, scenario_answers } = collections();
      const latest = await scenario_sessions
        .find({ channelId: interaction.channelId })
        .sort({ startedAt: -1 })
        .limit(1)
        .toArray();
      const session = latest[0];
      if (!session)
        return edit(interaction, "No scenario session found in this channel.");

      const agg = await scenario_answers
        .aggregate([
          { $match: { sessionId: session._id.toString() } },
          { $group: { _id: "$choice", count: { $sum: 1 } } },
        ])
        .toArray();

      const counts = [0, 0, 0, 0];
      for (const r of agg) counts[r._id] = r.count;

      const text = `Stats for latest session:\nA: ${counts[0]} | B: ${counts[1]} | C: ${counts[2]} | D: ${counts[3]}\n(Status: ${session.status})`;
      return edit(interaction, text);
    }

    return edit(interaction, "Unknown subcommand.");
  } catch (err) {
    console.error("[ERR] /scenario failed:", err);
    return edit(interaction, "Something went wrong while handling /scenario.");
  }
}

// Button handler (Phase B: record single answer; Phase C: reveal + scoring)
export async function handleButton(interaction) {
  const id = interaction.customId || "";
  if (!id.startsWith("scn_")) return false;

  try {
    const parts = id.split("_"); // scn_<sessionId>_<choice>
    const sessionId = parts[1];
    const choice = Number(parts[2]) || 0;

    const { scenario_sessions, scenario_answers } = collections();
    const session = await scenario_sessions.findOne({
      _id: new ObjectId(sessionId),
    });
    if (!session || session.status !== "open") {
      await interaction.reply({
        content: "This scenario is closed or invalid.",
        ephemeral: true,
      });
      return true;
    }

    // Insert answer; uniqueness on (sessionId, userId)
    try {
      await scenario_answers.insertOne({
        sessionId,
        userId: interaction.user.id,
        choice,
        answeredAt: new Date(),
      });
      await interaction.reply({
        content: `Answer received: ${
          ["A", "B", "C", "D"][choice] || "?"
        }. (Phase C will reveal the result.)`,
        ephemeral: true,
      });
    } catch (e) {
      // Likely duplicate key (already answered)
      await interaction.reply({
        content: "You already answered this scenario.",
        ephemeral: true,
      });
    }
    return true;
  } catch (err) {
    console.error("[ERR] scenario button failed:", err);
    try {
      await interaction.reply({
        content: "Something went wrong.",
        ephemeral: true,
      });
    } catch {}
    return true;
  }
}
