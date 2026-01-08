/**
 * commands/help.js
 * Global help command - displays all available bot commands
 */

import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("help")
  .setDescription("Show all available bot commands")
  .addStringOption((option) =>
    option
      .setName("category")
      .setDescription("Filter by category")
      .setRequired(false)
      .addChoices(
        { name: "Games & Fun", value: "games" },
        { name: "AI & Chat", value: "ai" },
        { name: "Economy & Profile", value: "economy" },
        { name: "Admin & Config", value: "admin" }
      )
  );

// Command categories and their descriptions
const COMMAND_CATEGORIES: Record<string, any> = {
  games: {
    emoji: "🎮",
    name: "Games & Fun",
    description: "Mini-games, adventures, and interactive entertainment",
    commands: [
      {
        name: "/minigame start",
        description: "Start a mini-game (trivia, adventure, reaction, battle, etc.)",
        options: "type, vs_bot, rounds, topic, mode",
      },
      {
        name: "/minigame recommend",
        description: "Get personalized game recommendations",
      },
      {
        name: "/minigame stats",
        description: "View your game statistics and win rates",
      },
      {
        name: "/minigame stop",
        description: "Stop the current game in this channel",
      },
      {
        name: "/game start",
        description: "Start a quick reaction game",
      },
      {
        name: "/loot open",
        description: "Open loot boxes to get items and rewards",
      },
      {
        name: "/inventory",
        description: "View your collected items and inventory",
      },
    ],
  },
  ai: {
    emoji: "🤖",
    name: "AI & Chat",
    description: "AI-powered conversations, personas, and content generation",
    commands: [
      {
        name: "/ai chat",
        description: "Chat with AI-powered personas",
        options: "message, persona",
      },
      {
        name: "/assistant",
        description: "Control AI auto-replies in chat (off / mentions / full)",
        options: "status, mode, on, off",
      },
      {
        name: "/scene",
        description: "Start RP scene threads (safe place for full mode + auto recap)",
        options: "start, adopt, prompt, end, status, list",
      },
      {
        name: "/ai ask",
        description: "Ask a question using RAG (lore-grounded answers)",
        options: "question",
      },
      {
        name: "/greet",
        description: "Get a personalized greeting from a character",
      },
      {
        name: "/persona list",
        description: "View available AI personas/characters",
      },
      {
        name: "/persona info",
        description: "Get details about a specific persona",
        options: "name",
      },
      {
        name: "/story start",
        description: "Start an interactive story with AI",
      },
      {
        name: "/rag search",
        description: "Search the Communiverse knowledge base",
        options: "query",
      },
    ],
  },
  economy: {
    emoji: "💰",
    name: "Economy & Profile",
    description: "Points, profiles, leaderboards, and achievements",
    commands: [
      {
        name: "/points",
        description: "Check your current points balance",
      },
      {
        name: "/points give",
        description: "Give points to another user",
        options: "user, amount",
      },
      {
        name: "/profile",
        description: "View your user profile and stats",
        options: "user (optional)",
      },
      {
        name: "/leaderboard",
        description: "View server leaderboards",
        options: "type (points, games, etc.)",
      },
      {
        name: "/drop claim",
        description: "Claim active point drops",
      },
    ],
  },
  admin: {
    emoji: "⚙️",
    name: "Admin & Config",
    description: "Server configuration and moderation (requires permissions)",
    commands: [
      {
        name: "/config-proactive",
        description: "Configure proactive AI features for this server",
      },
      {
        name: "/config-assistant",
        description: "Configure channel whitelist + scene settings (admin)",
      },
      {
        name: "/scenario create",
        description: "Create interactive scenarios for the community",
      },
      {
        name: "/scheduler",
        description: "Manage scheduled bot events and announcements",
      },
      {
        name: "/admin-data",
        description: "Manage bot data and settings (admin only)",
      },
      {
        name: "/finetune",
        description: "Manage AI fine-tuning (admin only)",
      },
      {
        name: "/history fetch",
        description: "Fetch and archive channel message history",
      },
      {
        name: "/privacy",
        description: "Manage your data privacy settings",
      },
    ],
  },
};

export async function execute(interaction: any, services: any) {
  const category = interaction.options.getString("category");

  if (category) {
    // Show specific category
    await showCategoryHelp(interaction, category);
  } else {
    // Show overview of all categories
    await showOverview(interaction);
  }
}

async function showOverview(interaction: any) {
  const embed = new EmbedBuilder()
    .setTitle("📚 Elioverse Bot - Command Guide")
    .setDescription(
      "Welcome! Here's an overview of all available commands.\n" +
      "Use `/help category:<name>` to see detailed commands for each category."
    )
    .setColor(0x5865f2)
    .setThumbnail(interaction.client.user.displayAvatarURL());

  // Add category summaries
  for (const [key, cat] of Object.entries(COMMAND_CATEGORIES)) {
    const commandCount = cat.commands.length;
    const preview = cat.commands
      .slice(0, 3)
      .map((c: any) => `\`${c.name.split(" ")[0]}\``)
      .join(", ");
    embed.addFields({
      name: `${cat.emoji} ${cat.name}`,
      value: `${cat.description}\n${preview}... (${commandCount} commands)\nUse \`/help category:${key}\``,
      inline: false,
    });
  }

  // Quick tips
  embed.addFields({
    name: "💡 Quick Tips",
    value:
      "• **New here?** Try `/minigame start type:trivia` to play trivia!\n" +
      "• **Chat with AI:** Mention the bot or use `/ai chat`\n" +
      "• **Enable auto-replies:** Use `/assistant on` (RP prefix `caleb:` only works in allowed channels or /scene threads)\n" +
      "• **Get help:** Use `/minigame help` for game-specific help\n" +
      "• **Privacy:** Use `/privacy` to manage your data",
    inline: false,
  });

  embed.setFooter({
    text: `Elioverse Bot • ${Object.values(COMMAND_CATEGORIES).reduce((sum: number, cat: any) => sum + cat.commands.length, 0)} commands available`,
  });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function showCategoryHelp(interaction: any, categoryKey: string) {
  const category = COMMAND_CATEGORIES[categoryKey];

  if (!category) {
    await interaction.reply({
      content: "❌ Unknown category. Use `/help` to see all categories.",
      ephemeral: true,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`${category.emoji} ${category.name}`)
    .setDescription(category.description)
    .setColor(0x5865f2);

  // Add each command
  for (const cmd of category.commands) {
    const optionsText = cmd.options ? `\n_Options: ${cmd.options}_` : "";
    embed.addFields({
      name: cmd.name,
      value: cmd.description + optionsText,
      inline: false,
    });
  }

  embed.setFooter({
    text: `Use /help to see all categories • ${category.commands.length} commands in this category`,
  });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
