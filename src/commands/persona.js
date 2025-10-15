// src/commands/persona.js
// User-facing persona interactions: /persona meet, /persona act

import { SlashCommandBuilder } from "discord.js";
import * as Persona from "../services/persona.js";
import { formatErrorEmbed, safeEdit } from "../util/replies.js";
import { incCounter, observeHistogram } from "../util/metrics.js";

export const data = new SlashCommandBuilder()
  .setName("persona")
  .setDescription("Meet and interact with a persona.")
  .addSubcommand(sc =>
    sc.setName("meet")
      .setDescription("Invite the persona to speak")
      .addStringOption(o => o.setName("name").setDescription("Persona name").setRequired(true))
  )
  .addSubcommand(sc =>
    sc.setName("act")
      .setDescription("Perform an action to change affinity")
      .addStringOption(o => o.setName("name").setDescription("Persona name").setRequired(true))
      .addStringOption(o => o.setName("action").setDescription("Action")
        .addChoices(
          { name: "joke", value: "joke" },
          { name: "gift", value: "gift" },
          { name: "help", value: "help" },
          { name: "challenge", value: "challenge" }
        ).setRequired(true))
  )
  .setDMPermission(false);

export async function execute(interaction) {
  const startedAt = Date.now();
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;
  const channelId = interaction.channelId;
  const name = interaction.options.getString("name", true);
  const persona = { id: name.toLowerCase(), name };

  try {
    await interaction.deferReply({ ephemeral: false });

    if (sub === "meet") {
      const res = await Persona.meet({ guildId, channelId, persona });
      if (!res.ok) return safeEdit(interaction, formatErrorEmbed(res.error, "Meet failed"));
      await safeEdit(interaction, { content: `🎭 **${name}** joined the chat.` });
      incCounter("commands_total", { command: "persona.meet.cmd" });
    }

    if (sub === "act") {
      const action = interaction.options.getString("action", true);
      const res = await Persona.act({ guildId, userId: interaction.user.id, persona, action });
      if (!res.ok) return safeEdit(interaction, formatErrorEmbed(res.error, "Action failed"));

      const p = res.data.profile;
      await safeEdit(interaction, {
        embeds: [{
          title: `Persona • ${name}`,
          description:
            `Action: **${action}**\n` +
            `Delta: \`F${res.data.delta.friendship} / T${res.data.delta.trust} / D${res.data.delta.dependence}\`\n` +
            `Now: **F${p.friendship} / T${p.trust} / D${p.dependence}** • _${p.levelHint}_`,
          color: 0x6aa7ff,
        }],
      });
      incCounter("commands_total", { command: "persona.act.cmd" });
    }

  } catch (error) {
    await safeEdit(interaction, formatErrorEmbed({ code: "UNKNOWN", message: String(error) }, "Persona error"));
  } finally {
    const ms = (Date.now() - startedAt) / 1000;
    observeHistogram("command_latency_seconds", ms, { command: `persona.${sub}` });
    console.log("[CMD][persona]", { guildId, sub, latency_s: ms.toFixed(3) });
  }
}
