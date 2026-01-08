/**
 * commands/assistant.ts
 * User command: control AI auto-replies in guild chat.
 * All code/comments in English only.
 */

import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { getChatMode, setChatMode } from "../services/userChatSettings.js";

export const data = new SlashCommandBuilder()
  .setName("assistant")
  .setDescription("Control AI auto-replies for you in this server")
  .addSubcommand((sub) =>
    sub.setName("status").setDescription("Show your current auto-reply mode")
  )
  .addSubcommand((sub) =>
    sub
      .setName("mode")
      .setDescription("Set your auto-reply mode")
      .addStringOption((opt) =>
        opt
          .setName("value")
          .setDescription("How the bot should reply to your messages here")
          .setRequired(true)
          .addChoices(
            { name: "Off (no message replies)", value: "off" },
            { name: "Mentions only (default)", value: "mentions" },
            { name: "Full (allow RP prefix like 'caleb:')", value: "full" }
          )
      )
  )
  .addSubcommand((sub) =>
    sub.setName("on").setDescription("Shortcut: set mode to full")
  )
  .addSubcommand((sub) =>
    sub.setName("off").setDescription("Shortcut: set mode to off")
  )
  .setDMPermission(false);

type ChatMode = "off" | "mentions" | "full";

function modeLabel(mode: ChatMode): string {
  if (mode === "off") return "Off";
  if (mode === "full") return "Full";
  return "Mentions";
}

function modeDescription(mode: ChatMode): string {
  if (mode === "off") {
    return "No message-based AI replies (slash commands still work).";
  }
  if (mode === "full") {
    return "Replies on @mentions/replies, and also RP prefix like `caleb:` (only in whitelisted channels or inside /scene threads).";
  }
  return "Replies only when you @mention the bot or reply to it.";
}

export async function execute(interaction: any) {
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId;
  const userId = interaction.user.id;
  const sub = interaction.options.getSubcommand();

  if (!guildId) {
    await interaction.editReply("This command can only be used in a server.");
    return;
  }

  if (sub === "status") {
    const res = await getChatMode(guildId, userId);
    const mode: ChatMode = res.ok ? res.data.mode : "mentions";
    const embed = new EmbedBuilder()
      .setTitle("Assistant Auto-Reply Mode")
      .setColor(mode === "off" ? 0x99aab5 : mode === "full" ? 0x57f287 : 0x5865f2)
      .setDescription(`Current: **${modeLabel(mode)}**`)
      .addFields({ name: "What this means", value: modeDescription(mode), inline: false })
      .setFooter({ text: "Tip: Use /assistant mode to change this" });

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  let nextMode: ChatMode;
  if (sub === "mode") {
    nextMode = interaction.options.getString("value", true) as ChatMode;
  } else if (sub === "on") {
    nextMode = "full";
  } else {
    nextMode = "off";
  }

  const setRes = await setChatMode(guildId, userId, nextMode);
  if (!setRes.ok) {
    await interaction.editReply(`❌ Failed to update: ${setRes.error.message}`);
    return;
  }

  const mode: ChatMode = setRes.data.mode;
  const embed = new EmbedBuilder()
    .setTitle("Assistant Auto-Reply Updated")
    .setColor(mode === "off" ? 0x99aab5 : mode === "full" ? 0x57f287 : 0x5865f2)
    .setDescription(`Now: **${modeLabel(mode)}**`)
    .addFields(
      { name: "What this means", value: modeDescription(mode), inline: false },
      {
        name: "Examples",
        value:
          mode === "full"
            ? "• `caleb: hey` (in a whitelisted channel or /scene thread)\n• Reply to a persona message\n• `@Bot hey Elio`"
            : mode === "mentions"
              ? "• `@Bot hey`\n• Reply to a persona message"
              : "• Use slash commands like `/ai chat` instead",
        inline: false,
      }
    );

  await interaction.editReply({ embeds: [embed] });
}

export default { data, execute };
