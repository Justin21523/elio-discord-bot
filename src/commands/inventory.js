/**
 * commands/inventory.js
 * Simple inventory command (list/use) backed by Mongo inventory collection.
 */
import { SlashCommandBuilder } from "discord.js";
import { getInventory, useItem } from "../services/loot.js";
import { logger } from "../util/logger.js";

export const data = new SlashCommandBuilder()
  .setName("inventory")
  .setDescription("View and use items")
  .addSubcommand((sub) =>
    sub
      .setName("list")
      .setDescription("Show your inventory")
      .addUserOption((opt) =>
        opt.setName("user").setDescription("User to view (default: you)").setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("use")
      .setDescription("Use an item from your inventory")
      .addStringOption((opt) =>
        opt.setName("item").setDescription("Item name").setRequired(true)
      )
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  try {
    if (sub === "list") return handleList(interaction);
    if (sub === "use") return handleUse(interaction);
  } catch (err) {
    logger.error("[INVENTORY_CMD] Error", { error: err.message });
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: `❌ ${err.message}` });
    } else {
      await interaction.reply({ content: `❌ ${err.message}`, ephemeral: true });
    }
  }
}

async function handleList(interaction) {
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
      .slice(0, 25);

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

async function handleUse(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const itemName = interaction.options.getString("item");

  try {
    const result = await useItem(interaction.user.id, interaction.guildId, itemName);
    await interaction.editReply({
      content: `✅ Used ${result.item.name} (${result.item.rarity}). +${result.reward} pts.`,
    });
  } catch (err) {
    await interaction.editReply({ content: `❌ ${err.message}` });
  }
}
