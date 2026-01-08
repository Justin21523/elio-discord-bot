/**
 * commands/config-assistant.ts
 * Admin command: configure assistant chat whitelist + scene settings.
 * All code/comments in English only.
 */

import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } from "discord.js";
import {
  getAssistantGuildSettings,
  setFullModeWhitelistEnabled,
  addFullModeChannel,
  removeFullModeChannel,
  clearFullModeChannels,
  setScenesEnabled,
  setSceneAutoArchiveDurationMinutes,
} from "../services/assistantGuildSettings.js";

function formatChannels(ids: string[]): string {
  if (!ids.length) return "None";
  return ids.slice(0, 20).map((id) => `<#${id}>`).join(", ") + (ids.length > 20 ? ` (+${ids.length - 20})` : "");
}

function minutesLabel(minutes: number): string {
  if (minutes === 60) return "60 (1h)";
  if (minutes === 1440) return "1440 (24h)";
  if (minutes === 4320) return "4320 (3d)";
  if (minutes === 10080) return "10080 (7d)";
  return String(minutes);
}

export const data = new SlashCommandBuilder()
  .setName("config-assistant")
  .setDescription("Configure assistant auto-replies and scene threads")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) => sub.setName("view").setDescription("View current assistant settings"))
  .addSubcommand((sub) =>
    sub
      .setName("whitelist-enable")
      .setDescription("Enable/disable channel whitelist for full mode (RP prefix)")
      .addBooleanOption((opt) =>
        opt.setName("enabled").setDescription("If enabled, full mode only works in whitelisted channels (or scenes)").setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("whitelist-add")
      .setDescription("Add a channel to the full-mode whitelist")
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("Channel to allow full mode in")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("whitelist-remove")
      .setDescription("Remove a channel from the full-mode whitelist")
      .addChannelOption((opt) =>
        opt
          .setName("channel")
          .setDescription("Channel to remove")
          .addChannelTypes(ChannelType.GuildText)
          .setRequired(true)
      )
  )
  .addSubcommand((sub) => sub.setName("whitelist-clear").setDescription("Clear the full-mode whitelist"))
  .addSubcommand((sub) =>
    sub
      .setName("scenes-enable")
      .setDescription("Enable/disable scene threads")
      .addBooleanOption((opt) => opt.setName("enabled").setDescription("Allow /scene threads").setRequired(true))
  )
  .addSubcommand((sub) =>
    sub
      .setName("scenes-auto-archive")
      .setDescription("Set default auto-archive duration for scene threads")
      .addIntegerOption((opt) =>
        opt
          .setName("minutes")
          .setDescription("Thread auto-archive duration (minutes)")
          .setRequired(true)
          .addChoices(
            { name: "60 (1 hour)", value: 60 },
            { name: "1440 (24 hours)", value: 1440 },
            { name: "4320 (3 days)", value: 4320 },
            { name: "10080 (7 days)", value: 10080 }
          )
      )
  )
  .setDMPermission(false);

export async function execute(interaction: any) {
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.editReply("This command can only be used in a server.");
    return;
  }

  const sub = interaction.options.getSubcommand();

  let res;
  if (sub === "view") {
    res = await getAssistantGuildSettings(guildId);
  } else if (sub === "whitelist-enable") {
    const enabled = interaction.options.getBoolean("enabled", true);
    res = await setFullModeWhitelistEnabled(guildId, enabled);
  } else if (sub === "whitelist-add") {
    const channel = interaction.options.getChannel("channel", true);
    res = await addFullModeChannel(guildId, channel.id);
  } else if (sub === "whitelist-remove") {
    const channel = interaction.options.getChannel("channel", true);
    res = await removeFullModeChannel(guildId, channel.id);
  } else if (sub === "whitelist-clear") {
    res = await clearFullModeChannels(guildId);
  } else if (sub === "scenes-enable") {
    const enabled = interaction.options.getBoolean("enabled", true);
    res = await setScenesEnabled(guildId, enabled);
  } else if (sub === "scenes-auto-archive") {
    const minutes = interaction.options.getInteger("minutes", true);
    res = await setSceneAutoArchiveDurationMinutes(guildId, minutes);
  } else {
    await interaction.editReply("Unknown subcommand.");
    return;
  }

  if (!res.ok) {
    await interaction.editReply(`❌ ${res.error.message}`);
    return;
  }

  const settings = res.data;
  const embed = new EmbedBuilder()
    .setTitle("Assistant Settings")
    .setColor(0x5865f2)
    .setDescription("Controls where full chat mode (RP prefix) is allowed, and whether scenes are enabled.")
    .addFields(
      { name: "Full-mode whitelist", value: settings.fullModeWhitelistEnabled ? "Enabled" : "Disabled", inline: true },
      { name: "Whitelisted channels", value: formatChannels(settings.fullModeChannelIds), inline: false },
      { name: "Scenes", value: settings.scenesEnabled ? "Enabled" : "Disabled", inline: true },
      { name: "Scene auto-archive", value: minutesLabel(settings.sceneAutoArchiveDurationMinutes), inline: true }
    )
    .setFooter({ text: "Note: Scenes allow full mode inside the scene thread." });

  await interaction.editReply({ embeds: [embed] });
}

export default { data, execute };

