/**
 * commands/minigame.js
 * Mini-game system command - start games, view stats
 */

import { SlashCommandBuilder } from "discord.js";
import GameManager from "../services/minigames/GameManager.js";
import { logger } from "../util/logger.js";
import { recommendGames } from "../services/analytics/recommender.js";

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
            { name: "Reaction - Test your reflexes", value: "reaction" },
            { name: "Guess Number - Warmup logic mode", value: "guess-number" },
            { name: "Dice Duel - Highest roll wins", value: "dice-roll" },
            { name: "Battle - Turn-based duel", value: "battle" },
            { name: "IR Clue Hunt - Query & solve", value: "ir-clue" },
            { name: "Document Hunt - BM25/Rocchio search", value: "doc-hunt" },
            { name: "HMM Sequence - Probabilistic path", value: "hmm-sequence" },
            { name: "N-gram Story Weave", value: "ngram-story" },
            { name: "PMI Association - Keyword links", value: "pmi" },
            { name: "PMI Choice - Multiple choice PMI", value: "pmi-choice" }
          )
      )
      .addStringOption((option) =>
        option
          .setName("topic")
          .setDescription("Trivia topic (for trivia)")
          .addChoices(
            { name: "Mixed", value: "mixed" },
            { name: "Characters", value: "characters" },
            { name: "Lore", value: "lore" },
            { name: "Meta", value: "meta" }
          )
      )
      .addStringOption((option) =>
        option
          .setName("mode")
          .setDescription("Trivia mode (for trivia)")
          .addChoices(
            { name: "Standard", value: "standard" },
            { name: "Buzz (first correct ends)", value: "buzz" }
          )
      )
      .addStringOption((option) =>
        option
          .setName("scope")
          .setDescription("Where to run the game")
          .addChoices(
            { name: "Current channel", value: "channel" },
            { name: "Thread (auto-create)", value: "thread" },
            { name: "DM", value: "dm" }
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
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("status")
      .setDescription("Show the current game's status in this channel")
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("recommend")
      .setDescription("Get recommended games for you")
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("guess")
      .setDescription("Submit a guess for an active Guess Number game")
      .addIntegerOption((option) =>
        option
          .setName("value")
          .setDescription("Your guess")
          .setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("clue")
      .setDescription("Submit an IR query for IR Clue Hunt")
      .addStringOption((option) =>
        option.setName("query").setDescription("Search terms").setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("answer")
      .setDescription("Submit final answer for IR Clue Hunt")
      .addStringOption((option) =>
        option.setName("text").setDescription("Your answer").setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("docquery")
      .setDescription("Query for Document Hunt")
      .addStringOption((option) =>
        option.setName("query").setDescription("Search terms").setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("docanswer")
      .setDescription("Answer for Document Hunt")
      .addStringOption((option) =>
        option.setName("text").setDescription("Your answer").setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("narrate")
      .setDescription("Extend N-gram story with a keyword")
      .addStringOption((option) =>
        option.setName("keyword").setDescription("Seed keyword").setRequired(false)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("pmi")
      .setDescription("Guess an associated keyword for PMI game")
      .addStringOption((option) =>
        option.setName("guess").setDescription("Your guess").setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("pmichoice")
      .setDescription("Pick a PMI multiple choice answer")
      .addIntegerOption((option) =>
        option.setName("option").setDescription("Option number (1-4)").setRequired(true)
      )
  )
  .addSubcommand((subcommand) =>
    subcommand
      .setName("next")
      .setDescription("Advance HMM Sequence game")
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
    } else if (subcommand === "status") {
      await handleStatus(interaction, services);
    } else if (subcommand === "recommend") {
      await handleRecommend(interaction);
    } else if (subcommand === "guess") {
      await handleGuess(interaction, services);
    } else if (subcommand === "clue") {
      await handleClue(interaction, services);
    } else if (subcommand === "answer") {
      await handleAnswer(interaction, services);
    } else if (subcommand === "docquery") {
      await handleDocQuery(interaction, services);
    } else if (subcommand === "docanswer") {
      await handleDocAnswer(interaction, services);
    } else if (subcommand === "narrate") {
      await handleNarrate(interaction, services);
    } else if (subcommand === "pmi") {
      await handlePMI(interaction, services);
    } else if (subcommand === "pmichoice") {
      await handlePMIChoice(interaction, services);
    } else if (subcommand === "next") {
      await handleNext(interaction, services);
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
  const scope = interaction.options.getString("scope") || "channel";
  const topic = interaction.options.getString("topic") || "mixed";
  const mode = interaction.options.getString("mode") || "standard";
  let targetChannel = interaction.channel;

  if (scope === "thread" && interaction.channel?.threads) {
    targetChannel = await interaction.channel.threads.create({
      name: `minigame-${gameType}-${Date.now()}`,
      autoArchiveDuration: 60,
    });
  } else if (scope === "dm") {
    targetChannel = await interaction.user.createDM();
  }

  if (vsBot && (!services.ai || process.env.AI_ENABLED !== "true")) {
    await interaction.editReply({
      embeds: [
        {
          title: "❌ Bot Opponent Unavailable",
          description:
            "AI service is disabled. Enable AI to face the bot, or switch to player-vs-player.",
          color: 0xe74c3c,
        },
      ],
      ephemeral: true,
    });
    return;
  }

  const options = {
    vsBot,
    rounds,
    aiService: services.ai,
    guildId: interaction.guildId,
    botDifficulty: "medium",
    scope,
    topic,
    mode,
  };

  const result = await GameManager.startGame(
    gameType,
    targetChannel,
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
    embeds: [
      {
        title: "🎮 Game Started",
        description:
          scope === "dm"
            ? "Started in your DM. Check your messages."
            : scope === "thread"
            ? "Started in a new thread. Jump in!"
            : "Started in this channel. Check below.",
        color: 0x2ecc71,
        fields: [
          { name: "Type", value: gameType, inline: true },
          { name: "Opponent", value: vsBot ? "🤖 Bot" : "Player", inline: true },
          { name: "Rounds/Config", value: String(rounds), inline: true },
        ],
      },
    ],
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

  // Try normal end first
  let result = await GameManager.endGame(interaction.channel.id, "manual_stop");

  // If normal end fails, try force clear
  if (!result.ok) {
    result = GameManager.forceClear(interaction.channel.id);
    if (result.ok) {
      await interaction.editReply({
        content: `✅ Game session force-cleared.`,
      });
      return;
    }
  }

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
            name: "🔢 Guess Number",
            value: "Use `/minigame guess value:<#>` during an active game to find the hidden number.",
            inline: false,
          },
          {
            name: "🎲 Dice Duel",
            value: "Tap Roll once; highest d6 after a few rolls wins.",
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
              "`/minigame start` - Start a game\n`/minigame guess` - Submit a guess for Guess Number\n`/minigame stop` - End current game\n`/minigame stats` - View statistics",
            inline: false,
          },
        ],
      },
    ],
    ephemeral: true,
  });
}

async function handleRecommend(interaction) {
  await interaction.deferReply({ ephemeral: true });
  let recs;
  let strategy = "local";
  if (interaction.client.services?.ai?.recs) {
    const res = await interaction.client.services.ai.recs.recommendGames({
      userId: interaction.user.id,
      guildId: interaction.guildId,
      topK: 3,
    });
    if (res.ok) {
      recs = res.data.recommendations;
      strategy = res.data.strategy || "backend";
    }
  }
  if (!recs) {
    recs = await recommendGames(interaction.user.id, interaction.guildId);
  }

  if (!recs || recs.length === 0) {
    await interaction.editReply({ content: "📊 Not enough data yet. Play a few games first!" });
    return;
  }

  const lines = recs.map((r, idx) => {
    const score = r.score?.toFixed?.(2) || r.score;
    const reason = r.reason ? `\nReason: ${r.reason}` : "";
    return `${idx + 1}. ${prettyName(r.game)} (score: ${score})${reason}`;
  });

  await interaction.editReply({
    embeds: [
      {
        title: "🎯 Recommended Games for You",
        description: lines.join("\n"),
        color: 0x1abc9c,
        footer: { text: `Strategy: ${strategy} | Based on play history / win rate / achievements / popularity` },
      },
    ],
    components: [
      {
        type: 1,
        components: recs.slice(0, 3).map((r) => ({
          type: 2,
          style: 1,
          label: prettyName(r.game),
          custom_id: `minigame_start_${r.game}`,
        })),
      },
    ],
  });
}

function prettyName(game) {
  const map = {
    trivia: "Trivia",
    adventure: "Adventure",
    reaction: "Reaction",
    "guess-number": "Guess Number",
    "dice-roll": "Dice Duel",
    battle: "Turn Battle",
    "ir-clue": "IR Clue Hunt",
    "doc-hunt": "Document Hunt",
    "hmm-sequence": "HMM Sequence",
    "ngram-story": "N-gram Story",
    pmi: "PMI Association",
    "pmi-choice": "PMI Choice",
  };
  return map[game] || game;
}

async function handleStatus(interaction, services) {
  await interaction.deferReply({ ephemeral: true });
  const game = GameManager.getGame(interaction.channel.id);

  if (!game) {
    await interaction.editReply({ content: "❌ No active game in this channel." });
    return;
  }

  await interaction.editReply({
    content: `Current game: ${game.getGameName()}`,
    embeds: [game.getStatusEmbed()],
  });
}

async function handleGuess(interaction, services) {
  await interaction.deferReply({ ephemeral: true });
  const value = interaction.options.getInteger("value");
  const game = GameManager.getGame(interaction.channel.id);

  if (!game || game.constructor.name !== "GuessNumberGame") {
    await interaction.editReply({
      content: "❌ No active Guess Number game in this channel.",
    });
    return;
  }

  const result = await game.handleAction(interaction.user.id, "guess", {
    value,
  });

  if (!result.ok) {
    await interaction.editReply({ content: `❌ ${result.error}` });
    return;
  }

  await interaction.editReply({ content: "✅ Guess submitted." });

  if (game.isEnded()) {
    await GameManager.endGame(interaction.channel.id, result.endReason || "completed");
  }
}

async function handleClue(interaction, services) {
  await interaction.deferReply({ ephemeral: true });
  const query = interaction.options.getString("query");
  const game = GameManager.getGame(interaction.channel.id);

  if (!game || game.constructor.name !== "IRClueGame") {
    await interaction.editReply({
      content: "❌ No active IR Clue Hunt in this channel.",
    });
    return;
  }

  const result = await game.handleAction(interaction.user.id, "clue", { query });
  if (!result.ok) {
    await interaction.editReply({ content: `❌ ${result.error}` });
    return;
  }

  await interaction.editReply({
    embeds: [
      {
        title: "🔍 Clue",
        description: result.snippet,
        color: 0x1abc9c,
        footer: { text: `Queries left: ${result.queriesLeft}` },
      },
    ],
  });
}

async function handleAnswer(interaction, services) {
  await interaction.deferReply({ ephemeral: true });
  const text = interaction.options.getString("text");
  const game = GameManager.getGame(interaction.channel.id);

  if (!game || game.constructor.name !== "IRClueGame") {
    await interaction.editReply({
      content: "❌ No active IR Clue Hunt in this channel.",
    });
    return;
  }

  const result = await game.handleAction(interaction.user.id, "answer", { text });
  if (!result.ok) {
    await interaction.editReply({ content: `❌ ${result.error}` });
    return;
  }

  if (result.correct) {
    await interaction.editReply({
      content: `✅ Correct! Answer: ${result.target}`,
    });
    await GameManager.endGame(interaction.channel.id, "guessed");
  } else {
    await interaction.editReply({ content: "❌ Not correct. Keep trying!" });
  }
}

async function handleDocQuery(interaction, services) {
  await interaction.deferReply({ ephemeral: true });
  const query = interaction.options.getString("query");
  const game = GameManager.getGame(interaction.channel.id);

  if (!game || game.constructor.name !== "IRDocHuntGame") {
    await interaction.editReply({
      content: "❌ No active Document Hunt in this channel.",
    });
    return;
  }

  const result = await game.handleAction(interaction.user.id, "docquery", { query });
  if (!result.ok) {
    await interaction.editReply({ content: `❌ ${result.error}` });
    return;
  }

  await interaction.editReply({
    embeds: [
      {
        title: "📜 Snippet",
        description: result.snippet,
        color: 0x2980b9,
        footer: { text: `Score: ${result.score.toFixed?.(2) || result.score}, Queries left: ${result.queriesLeft}` },
      },
    ],
  });
}

async function handleDocAnswer(interaction, services) {
  await interaction.deferReply({ ephemeral: true });
  const text = interaction.options.getString("text");
  const game = GameManager.getGame(interaction.channel.id);

  if (!game || game.constructor.name !== "IRDocHuntGame") {
    await interaction.editReply({
      content: "❌ No active Document Hunt in this channel.",
    });
    return;
  }

  const result = await game.handleAction(interaction.user.id, "docanswer", { text });
  if (!result.ok) {
    await interaction.editReply({ content: `❌ ${result.error}` });
    return;
  }

  if (result.correct) {
    await interaction.editReply({
      content: `✅ Correct! Answer: ${result.target}`,
    });
    await GameManager.endGame(interaction.channel.id, "guessed");
  } else {
    await interaction.editReply({ content: "❌ Not correct. Keep trying!" });
  }
}

async function handleNarrate(interaction, services) {
  await interaction.deferReply({ ephemeral: true });
  const keyword = interaction.options.getString("keyword") || "";
  const game = GameManager.getGame(interaction.channel.id);

  if (!game || game.constructor.name !== "NgramStoryGame") {
    await interaction.editReply({
      content: "❌ No active N-gram Story game in this channel.",
    });
    return;
  }

  const result = await game.handleAction(interaction.user.id, "narrate", { keyword });
  if (!result.ok) {
    await interaction.editReply({ content: `❌ ${result.error}` });
    return;
  }

  await interaction.editReply({ content: "✅ Story extended." });
}

async function handlePMI(interaction, services) {
  await interaction.deferReply({ ephemeral: true });
  const guess = interaction.options.getString("guess");
  const game = GameManager.getGame(interaction.channel.id);

  if (!game || game.constructor.name !== "PMIAssociationGame") {
    await interaction.editReply({
      content: "❌ No active PMI Association game in this channel.",
    });
    return;
  }

  const result = await game.handleAction(interaction.user.id, "pmi", { guess });
  if (!result.ok) {
    await interaction.editReply({ content: `❌ ${result.error}` });
    return;
  }

  await interaction.editReply({ content: "✅ Guess processed." });
}

async function handlePMIChoice(interaction, services) {
  await interaction.deferReply({ ephemeral: true });
  const option = interaction.options.getInteger("option");
  const game = GameManager.getGame(interaction.channel.id);

  if (!game || game.constructor.name !== "KeywordPMIGame") {
    await interaction.editReply({
      content: "❌ No active PMI Choice game in this channel.",
    });
    return;
  }

  const result = await game.handleAction(interaction.user.id, "pmichoice", { option });
  if (!result.ok) {
    await interaction.editReply({ content: `❌ ${result.error}` });
    return;
  }

  await interaction.editReply({ content: "✅ Choice submitted." });
}

async function handleNext(interaction, services) {
  await interaction.deferReply({ ephemeral: true });
  const game = GameManager.getGame(interaction.channel.id);
  if (!game || game.constructor.name !== "HMMSequenceGame") {
    await interaction.editReply({
      content: "❌ No active HMM Sequence game in this channel.",
    });
    return;
  }
  const result = await game.handleAction(interaction.user.id, "next", {});
  if (!result.ok) {
    await interaction.editReply({ content: `❌ ${result.error}` });
    return;
  }
  await interaction.editReply({ content: "▶️ Advanced." });
}
