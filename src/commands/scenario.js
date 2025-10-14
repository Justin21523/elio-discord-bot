// /scenario start|answer|reveal
// English-only.

import { SlashCommandBuilder } from "discord.js";
import * as scenarios from "../services/scenario.js";
import * as Points from "../services/points.js";
import { formatErrorEmbed, safeEdit } from "../util/replies.js";
import { incCounter, observeHistogram } from "../util/metrics.js";

export const data = new SlashCommandBuilder()
  .setName("scenario")
  .setDescription("Play a scenario quiz or speedrun.")
  .addSubcommand(sc =>
    sc.setName("start")
      .setDescription("Start a scenario session")
      .addStringOption(o => o.setName("tag").setDescription("Scenario tag").setRequired(false))
      .addStringOption(o => o.setName("mode").setDescription("Mode: quiz|speedrun").setRequired(false)))
  .addSubcommand(sc =>
    sc.setName("answer")
      .setDescription("Answer the current question")
      .addIntegerOption(o => o.setName("index").setDescription("Answer index (0-3)").setRequired(false))
      .addStringOption(o => o.setName("text").setDescription("Answer text").setRequired(false)))
  .addSubcommand(sc =>
    sc.setName("reveal").setDescription("Reveal the answer & stats"))
  .addSubcommand(sc =>
    sc.setName("cancel").setDescription("Cancel the active session (admin)"));

export async function execute(interaction) {
  const t0 = Date.now();
  await interaction.deferReply({ ephemeral: false });
  const guildId = interaction.guildId;
  const userId = interaction.user.id;

  try {
    await interaction.deferReply({ ephemeral: false }); // ≤3s SLO
    const sub = interaction.options.getSubcommand();

    if (sub === "start") {
      const tag = interaction.options.getString("tag") || null;
      const mode = interaction.options.getString("mode") || "quiz";
      const result = await scenarios.startSession({ guildId, channelId, tag, mode });

      if (!result.ok) return safeEdit(interaction, formatErrorEmbed(result.error, "Failed to start"));
      const s = result.data.session;

      await safeEdit(interaction, {
        embeds: [{
          title: "Scenario Started",
          description: `**Mode:** \`${s.mode}\`\n**Q:** ${s.prompt}\n\n${s.options.map((t, i) => `\`${i}\` • ${t}`).join("\n")}`,
          color: 0x7cc5ff,
        }],
      });

    }

    if (sub === 'answer') {
      const index = interaction.options.getInteger("index");
      const text = interaction.options.getString("text");
      const active = await ScenarioActiveInChannel({ guildId, channelId });
      if (!active) return safeEdit(interaction, formatErrorEmbed({ code: "NOT_FOUND", message: "No active session here." }));

      const result = await scenarios.answer({ sessionId: active._id, userId, answerIndex: index, freeText: text });
      if (!result.ok) return safeEdit(interaction, formatErrorEmbed(result.error, "Answer failed"));

      const { correct, closed } = result.data;
      if (correct && closed) {
        // award winner
        await Points.award({ guildId, userId, amount: 10, reason: "scenario_winner", sourceRef: String(active._id) });
      }

      await safeEdit(interaction, {
        embeds: [{
          title: correct ? "✅ Correct!" : "❌ Not correct",
          description: closed ? "This round is now closed. Use `/scenario reveal`." : "Keep trying!",
          color: correct ? 0x31d0aa : 0xff8a7a,
        }],
      });

    }

    if (sub === 'reveal') {
      const activeOrLast = await ScenarioActiveInChannel({ guildId, channelId, allowLast: true });
      if (!activeOrLast) return safeEdit(interaction, formatErrorEmbed({ code: "NOT_FOUND", message: "No session found." }));

      const result = await scenarios.reveal({ sessionId: activeOrLast._id });
      if (!result.ok) return safeEdit(interaction, formatErrorEmbed(result.error, "Reveal failed"));

      const { prompt, options, correctIndex, winnerUserId, totalAnswers, correctCount, active } = result.data;
      await safeEdit(interaction, {
        embeds: [{
          title: "Reveal",
          description: `**Q:** ${prompt}\n**A:** \`${correctIndex}\` • ${options[correctIndex]}\n\nWinner: ${winnerUserId ? `<@${winnerUserId}>` : "_none_"}\nAnswers: ${correctCount}/${totalAnswers}\nStatus: ${active ? "Active" : "Closed"}`,
          color: 0xb4e37d,
        }],
      });
    } else if (sub === "cancel") {
      const result = await scenarios.cancel({ guildId, channelId });
      if (!result.ok) return safeEdit(interaction, formatErrorEmbed(result.error, "Cancel failed"));

      await safeEdit(interaction, {
        embeds: [{ title: "Session cancelled", color: 0xffcc00 }],
      });
    }

    incCounter("commands_total", { command: "scenario" });
  } catch (error) {
    await safeEdit(interaction, formatErrorEmbed({ code: "UNKNOWN", message: String(error) }, "Scenario error"));
  } finally {
    const ms = (Date.now() - startedAt) / 1000;
    observeHistogram("command_latency_seconds", ms, { command: "scenario" });
    // Log with context (no secrets)
    console.log("[CMD][scenario]",
      { guildId, channelId, userId, latency_s: ms.toFixed(3) });
  }
}

/**
 * Helper: find active session in channel, or last session if allowLast=true.
 */
async function ScenarioActiveInChannel({ guildId, channelId, allowLast = false }) {
  const { withCollection } = await import("../db/mongo.js");
  const col = "scenario_sessions";
  const active = await withCollection(col, (c) => c.findOne({ guildId, channelId, active: true }));
  if (active) return active;
  if (!allowLast) return null;
  return withCollection(col, (c) => c.find({ guildId, channelId }).sort({ createdAt: -1 }).limit(1).next());
}