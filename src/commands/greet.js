// /src/commands/greet.js
// Slash command: /greet now|set|list
// Uses metrics helpers from util/metrics.js. No Scheduler import here.

import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { postGreeting, list as listGreetings } from "../services/greetings.js";
import { incCounter, startTimer } from "../util/metrics.js";

export const data = new SlashCommandBuilder()
  .setName("greet")
  .setDescription("Send or preview persona-styled greetings")
  .addSubcommand(sc =>
    sc.setName("now")
      .setDescription("Send a greeting now")
      .addStringOption(o => o.setName("persona").setDescription("Persona name (e.g., Elio)").setRequired(false))
      .addStringOption(o => o.setName("tags").setDescription("Comma tags filter").setRequired(false))
  )
  .addSubcommand(sc =>
    sc.setName("list")
      .setDescription("List a few greetings (ephemeral)")
      .addIntegerOption(o => o.setName("limit").setDescription("How many to preview (max 10)").setRequired(false))
  )
  .setDMPermission(false);

export async function execute(interaction) {
  const guildId = interaction.guildId;
  const channelId = interaction.channelId;

  const stop = startTimer("command_latency_seconds", { command: "greet" });
  incCounter("commands_total", { command: "greet" });

  try {
    await interaction.deferReply({ ephemeral: false });
  } catch {}

  const sub = interaction.options.getSubcommand();

  if (sub === "now") {
    const persona = interaction.options.getString("persona") || "Elio";
    const tagsCsv = interaction.options.getString("tags");
    const tags = tagsCsv ? tagsCsv.split(",").map(s => s.trim()).filter(Boolean) : undefined;

    const ctx = {
      guildId,
      guildName: interaction.guild?.name || "",
      userTag: interaction.user?.tag || "",
      weekday: new Date().toLocaleDateString("en-US", { weekday: "long" }),
    };

    const res = await postGreeting({ channelId, personaName: persona, tags, context: ctx });
    if (!res.ok) {
      await interaction.editReply(`⚠️ Failed: ${res.error.message}`);
      stop({ outcome: "error" });
      return;
    }
    await interaction.editReply(`✅ Greeting sent as **${persona}**.`);
    stop({ outcome: "ok" });
    return;
  }

  if (sub === "list") {
    const limit = Math.min(interaction.options.getInteger("limit") ?? 5, 10);
    const res = await listGreetings({ enabled: true, limit });
    if (!res.ok) {
      await interaction.editReply(`⚠️ Failed: ${res.error.message}`);
      stop({ outcome: "error" });
      return;
    }
    const lines = res.data.map((g, i) => {
      const p = g.personaHost ? ` • ${g.personaHost}` : "";
      const t = Array.isArray(g.tags) && g.tags.length ? `\n   └─ tags: ${g.tags.join(", ")}` : "";
      return `**${i + 1}.** ${g.text}${p}${t}`;
    });
    await interaction.editReply({ content: `Preview (${lines.length}):\n${lines.join("\n")}`, ephemeral: true });
    stop({ outcome: "ok" });
    return;
  }

  await interaction.editReply("⚠️ Unknown subcommand.");
  stop({ outcome: "error" });
}
