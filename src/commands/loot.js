/**
 * commands/loot.js
 * Simple loot box / inventory / achievements / leaderboard
 */

import { SlashCommandBuilder } from "discord.js";
import { pull, getInventory, getAchievements, getLeaderboard } from "../services/loot.js";
import { logger } from "../util/logger.js";

export const data = new SlashCommandBuilder()
  .setName("loot")
  .setDescription("Pull loot, view inventory and achievements")
  .addSubcommand((sub) =>
    sub.setName("pull").setDescription("Draw a random item (CPU-only, no AI)")
  )
  .addSubcommand((sub) =>
    sub.setName("inventory").setDescription("Show your inventory")
      .addUserOption((opt) =>
        opt.setName("user").setDescription("User to view (default: you)").setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("achievements").setDescription("Show achievements")
      .addUserOption((opt) =>
        opt.setName("user").setDescription("User to view (default: you)").setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub.setName("leaderboard").setDescription("Top loot collectors in this server")
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  try {
    if (sub === "pull") return handlePull(interaction);
    if (sub === "inventory") return handleInventory(interaction);
    if (sub === "achievements") return handleAchievements(interaction);
    if (sub === "leaderboard") return handleLeaderboard(interaction);
  } catch (error) {
    logger.error("[LOOT_CMD] Error", { error: error.message });
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: `❌ ${error.message}` });
    } else {
      await interaction.reply({ content: `❌ ${error.message}`, ephemeral: true });
    }
  }
}

async function handlePull(interaction) {
  await interaction.deferReply({ ephemeral: true });
  let result;
  try {
    result = await pull(interaction.user.id, interaction.user.username, interaction.guildId);
  } catch (err) {
    await interaction.editReply({ content: `❌ ${err.message}` });
    return;
  }
  const { item, rarity, reward, achievements } = result;

  await interaction.editReply({
    embeds: [
      {
        title: `🎁 You pulled: ${item.name}`,
        color: rarityColor(rarity.name),
        fields: [
          { name: "Rarity", value: rarity.name, inline: true },
          { name: "Reward", value: `${reward} pts`, inline: true },
        ],
        footer: achievements.length
          ? { text: `Unlocked achievements: ${achievements.join(", ")}` }
          : undefined,
      },
    ],
  });
}

async function handleInventory(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const target = interaction.options.getUser("user") || interaction.user;
  const inv = await getInventory(target.id, interaction.guildId);

  const grouped = (inv.items || []).reduce((acc, item) => {
    const key = `${item.rarity}:${item.name}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  const lines =
    Object.entries(grouped)
      .map(([key, count]) => {
        const [rarity, name] = key.split(":");
        return `• ${name} (${rarity}) x${count}`;
      })
      .slice(0, 20);

  await interaction.editReply({
    embeds: [
      {
        title: `📦 Inventory - ${target.username}`,
        description: lines.length > 0 ? lines.join("\n") : "Empty",
        color: 0x95a5a6,
        fields: [
          { name: "Total pulls", value: String(inv.totalPulls || 0), inline: true },
          { name: "Points", value: String(inv.points || 0), inline: true },
        ],
      },
    ],
  });
}

async function handleAchievements(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const target = interaction.options.getUser("user") || interaction.user;
  const list = await getAchievements(target.id, interaction.guildId);

  await interaction.editReply({
    embeds: [
      {
        title: `🏆 Achievements - ${target.username}`,
        description: list.length ? list.map((a) => `• ${a}`).join("\n") : "No achievements yet.",
        color: 0xf1c40f,
      },
    ],
  });
}

async function handleLeaderboard(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const leaders = await getLeaderboard(interaction.guildId, 10);

  const lines = leaders.map((u, idx) => {
    return `${idx + 1}. ${u.username || u.userId} — ${u.points || 0} pts (${u.totalPulls || 0} pulls)`;
  });

  await interaction.editReply({
    embeds: [
      {
        title: "🏅 Loot Leaderboard",
        description: lines.length ? lines.join("\n") : "No data yet.",
        color: 0x9b59b6,
      },
    ],
  });
}

function rarityColor(name) {
  switch (name) {
    case "Legendary":
      return 0xf1c40f;
    case "Epic":
      return 0x9b59b6;
    case "Rare":
      return 0x2980b9;
    default:
      return 0x95a5a6;
  }
}
