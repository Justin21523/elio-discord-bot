// src/commands/points.js
// Points admin and leaderboard command (discord.js v14).
// Subcommands:
//   /points give @user amount [reason]   (admin only)
//   /points leaderboard [season]         (top 10 by default)

import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import * as Points from "../services/points.js";
import { formatErrorEmbed, safeEdit } from "../util/replies.js";
import { incCounter, observeHistogram } from "../util/metrics.js";

export const data = new SlashCommandBuilder()
  .setName("points")
  .setDescription("Award points or view leaderboard.")
  .addSubcommand((sc) =>
    sc.setName("give")
      .setDescription("Admin: give points to a user")
      .addUserOption((o) => o.setName("user").setDescription("Target user").setRequired(true))
      .addIntegerOption((o) => o.setName("amount").setDescription("Points to add (negative allowed)").setRequired(true))
      .addStringOption((o) => o.setName("reason").setDescription("Reason").setRequired(false))
  )
  .addSubcommand((sc) =>
    sc.setName("leaderboard")
      .setDescription("Show top members")
      .addIntegerOption((o) => o.setName("season").setDescription("Season id").setRequired(false))
  )
  // NOTE: we do not hard-restrict permissions at register-time to allow viewing leaderboard.
  // We will check admin in runtime for "give".
  .setDMPermission(false);

export async function execute(interaction) {
  const startedAt = Date.now();
  const guildId = interaction.guildId;
  const sub = interaction.options.getSubcommand();

  try {
    await interaction.deferReply({ ephemeral: sub === "give" }); // give is noisier → ephemeral
    if (sub === "give") {
      if (!isAdmin(interaction)) {
        return safeEdit(interaction, formatErrorEmbed({ code: "FORBIDDEN", message: "Admins only." }, "Not allowed"));
      }
      const user = interaction.options.getUser("user", true);
      const amount = interaction.options.getInteger("amount", true);
      const reason = interaction.options.getString("reason") || "manual";

      const res = await Points.award({
        guildId,
        userId: user.id,
        amount,
        reason,
        sourceRef: "admin_give",
        seasonId: null,
      });

      if (!res.ok) return safeEdit(interaction, formatErrorEmbed(res.error, "Failed to give points"));

      const p = res.data.profile;
      await safeEdit(interaction, {
        embeds: [{
          title: "Points Granted",
          description: `Gave **${amount}** to <@${user.id}> for *${reason}*.\nNow: **${p.points ?? 0}** pts (Lv.${p.level})`,
          color: 0x7cc5ff,
        }],
      });

      incCounter("commands_total", { command: "points.give" });
    }

    if (sub === "leaderboard") {
      const season = interaction.options.getInteger("season");
      const res = await Points.leaderboard({ guildId, seasonId: season ?? null, limit: 10 });
      if (!res.ok) return safeEdit(interaction, formatErrorEmbed(res.error, "Failed to fetch leaderboard"));

      const rows = res.data.entries || [];
      if (rows.length === 0) {
        return safeEdit(interaction, {
          embeds: [{ title: "Leaderboard", description: "_No entries yet._", color: 0xb4e37d }],
        });
      }

      const desc = rows.map((r, i) =>
        `**${i + 1}.** <@${r.userId}> — **${r.points ?? 0}** pts (Lv.${r.level})`
      ).join("\n");

      await safeEdit(interaction, {
        embeds: [{
          title: `Leaderboard${season != null ? ` • Season ${season}` : ""}`,
          description: desc,
          color: 0xb4e37d,
        }],
      });

      incCounter("commands_total", { command: "points.leaderboard" });
    }
  } catch (error) {
    await safeEdit(interaction, formatErrorEmbed({ code: "UNKNOWN", message: String(error) }, "Points error"));
  } finally {
    const ms = (Date.now() - startedAt) / 1000;
    observeHistogram("command_latency_seconds", ms, { command: `points.${sub}` });
    console.log("[CMD][points]", { guildId, sub, latency_s: ms.toFixed(3) });
  }
}

function isAdmin(interaction) {
  const member = interaction.member;
  if (!member) return false;
  const perms = member.permissions;
  if (!perms) return false;
  return perms.has(PermissionFlagsBits.Administrator) || perms.has(PermissionFlagsBits.ManageGuild);
}
