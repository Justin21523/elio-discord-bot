/**
 * commands/minigame.js
 * Mini-game system command - start games, view stats
 */

import { SlashCommandBuilder } from "discord.js";
import GameManager from "../services/minigames/GameManager.js";
import { logger } from "../util/logger.js";

export const data = new SlashCommandBuilder()
  .setName("minigame")
  .setDescription("Play mini-games with Communiverse characters")
  .addSubcommand((subcommand) =>
    subcommand
      .setName("start")
      .setDescription("Start a mini-game")
      .addStringOption((option) =>
        option
          .setName("type")
          .setDescription("Type of game to play")
          .setRequired(true)
          .addChoices(
            { name: "Trivia - Test your Communiverse knowledge", value: "trivia" },
            { name: "Adventure - Choose your path", value: "adventure" },
            { name: "Reaction - Test your reflexes", value: "reaction" }
          )
      )
      .addBooleanOption((option) =>
        option
          .setName("vs_bot")
          .setDescription("Play against a bot opponent")
          .setRequired(false)
      )
      .addIntegerOption((option) =>
        option
          .setName("rounds")
          .setDescription("Number of rounds/questions (default: 5)")
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(20)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("stop")
      .setDescription("Stop the current game in this channel")
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("stats")
      .setDescription("View your mini-game statistics")
      .addUserOption((option) =>
        option
          .setName("user")
          .setDescription("User to view stats for (default: yourself)")
          .setRequired(false)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("help")
      .setDescription("Learn about mini-games")
  );

export async function execute(interaction, services) {
  const subcommand = interaction.options.getSubcommand();

  try {
    if (subcommand === "start") {
      await handleStart(interaction, services);
    } else if (subcommand === "stop") {
      await handleStop(interaction, services);
    } else if (subcommand === "stats") {
      await handleStats(interaction, services);
    } else if (subcommand === "help") {
      await handleHelp(interaction, services);
    }
  } catch (error) {
    logger.error("[MINIGAME_CMD] Error:", { error: error.message });
    await interaction.editReply({
      content: `❌ Error: ${error.message}`,
      ephemeral: true,
    });
  }
}

async function handleStart(interaction, services) {
  await interaction.deferReply();

  const gameType = interaction.options.getString("type");
  const vsBot = interaction.options.getBoolean("vs_bot") || false;
  const rounds = interaction.options.getInteger("rounds") || 5;

  const options = {
    vsBot,
    rounds,
    aiService: services.ai,
    guildId: interaction.guildId,
    botDifficulty: "medium",
  };

  const result = await GameManager.startGame(
    gameType,
    interaction.channel,
    interaction.user,
    options
  );

  if (!result.ok) {
    await interaction.editReply({
      content: `❌ ${result.error}`,
      ephemeral: true,
    });
    return;
  }

  await interaction.editReply({
    content: `✅ Game started! Check the channel for the game.`,
    ephemeral: true,
  });

  logger.info("[MINIGAME_CMD] Game started", {
    gameType,
    userId: interaction.user.id,
    channelId: interaction.channel.id,
    vsBot,
  });
}

async function handleStop(interaction, services) {
  await interaction.deferReply({ ephemeral: true });

  const result = await GameManager.endGame(interaction.channel.id, "manual_stop");

  if (!result.ok) {
    await interaction.editReply({
      content: `❌ ${result.error}`,
    });
    return;
  }

  await interaction.editReply({
    content: `✅ Game stopped.`,
  });
}

async function handleStats(interaction, services) {
  await interaction.deferReply();

  const targetUser = interaction.options.getUser("user") || interaction.user;
  const result = await GameManager.getUserStats(targetUser.id);

  if (!result.ok) {
    await interaction.editReply({
      content: `❌ ${result.error}`,
      ephemeral: true,
    });
    return;
  }

  const { stats } = result;

  const fields = [
    {
      name: "Total Games",
      value: stats.totalGames.toString(),
      inline: true,
    },
    {
      name: "Wins",
      value: stats.wins.toString(),
      inline: true,
    },
    {
      name: "Losses",
      value: stats.losses.toString(),
      inline: true,
    },
  ];

  // Add per-game-type stats
  for (const [gameType, gameStats] of Object.entries(stats.byType)) {
    fields.push({
      name: `${gameType.charAt(0).toUpperCase() + gameType.slice(1)}`,
      value: `Played: ${gameStats.played} | Won: ${gameStats.won}`,
      inline: false,
    });
  }

  await interaction.editReply({
    embeds: [
      {
        title: `🎮 Mini-Game Stats - ${targetUser.username}`,
        color: 0x3498db,
        fields,
        thumbnail: {
          url: targetUser.displayAvatarURL(),
        },
      },
    ],
  });
}

async function handleHelp(interaction, services) {
  await interaction.reply({
    embeds: [
      {
        title: "🎮 Mini-Game System",
        description:
          "Play interactive games with Communiverse characters and lore!",
        color: 0x9b59b6,
        fields: [
          {
            name: "🧠 Trivia",
            value:
              "Test your knowledge of Elio and the Communiverse. Questions are generated from the lore database using RAG. Play solo or challenge a bot opponent!",
            inline: false,
          },
          {
            name: "🗺️ Adventure",
            value:
              "Choose-your-own-adventure style game based on Communiverse scenarios. Make choices and see where they lead!",
            inline: false,
          },
          {
            name: "⚡ Reaction",
            value:
              "Test your reflexes! Click the button as fast as you can when it appears.",
            inline: false,
          },
          {
            name: "🤖 Bot Opponent",
            value:
              "Enable the `vs_bot` option to play against an AI opponent. The bot uses the same AI service and can be a challenging competitor!",
            inline: false,
          },
          {
            name: "Commands",
            value:
              "`/minigame start` - Start a game\n`/minigame stop` - End current game\n`/minigame stats` - View statistics",
            inline: false,
          },
        ],
      },
    ],
    ephemeral: true,
  });
}
