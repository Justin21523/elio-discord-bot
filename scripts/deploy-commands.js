/**
 * scripts/deploy-commands.js
 * Deploy slash commands to Discord (guild-scoped for development).
 */

import { REST, Routes } from "discord.js";
import { config } from "../src/config.js";
import dotenv from "dotenv";

dotenv.config();

const commands = [
  // AI Service Commands
  {
    name: "ai",
    description: "AI interaction commands",
    options: [
      {
        type: 1, // SUB_COMMAND
        name: "ask",
        description: "Ask AI a question",
        options: [
          {
            type: 3, // STRING
            name: "question",
            description: "Your question",
            required: true,
          },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "check",
        description: "Check AI service health",
      },
    ],
  },
  {
    name: "rag",
    description: "RAG (Retrieval Augmented Generation) commands",
    options: [
      {
        type: 1, // SUB_COMMAND
        name: "query",
        description: "Query the knowledge base",
        options: [
          {
            type: 3, // STRING
            name: "question",
            description: "Your question",
            required: true,
          },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "add",
        description: "Add document to knowledge base",
        options: [
          {
            type: 3, // STRING
            name: "text",
            description: "Document text",
            required: true,
          },
          {
            type: 3, // STRING
            name: "source",
            description: "Document source/title",
            required: false,
          },
        ],
      },
    ],
  },

  // Phase 1: Drop System
  {
    name: "drop",
    description: "Manage media drops",
    options: [
      {
        type: 1, // SUB_COMMAND
        name: "set",
        description: "Schedule daily media drop",
        options: [
          {
            type: 3, // STRING
            name: "time",
            description: "Time in HH:MM format (e.g., 09:30)",
            required: true,
          },
          {
            type: 7, // CHANNEL
            name: "channel",
            description: "Target channel for drops",
            required: true,
          },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "now",
        description: "Drop media immediately in current channel",
      },
      {
        type: 1, // SUB_COMMAND
        name: "disable",
        description: "Disable scheduled drops for this server",
      },
    ],
  },

  // Phase 2: Game & Points
  {
    name: "game",
    description: "Start a quick-react game",
    options: [
      {
        type: 1, // SUB_COMMAND
        name: "start",
        description: "Start a new quick-react game",
      },
    ],
  },
  {
    name: "leaderboard",
    description: "View the server leaderboard",
    options: [
      {
        type: 4, // INTEGER
        name: "limit",
        description: "Number of top players to show (1-25)",
        required: false,
        min_value: 1,
        max_value: 25,
      },
    ],
  },
  {
    name: "profile",
    description: "View your or another user's profile",
    options: [
      {
        type: 6, // USER
        name: "user",
        description: "User to view (leave empty for yourself)",
        required: false,
      },
    ],
  },

  // Phase 3: Personas & Scenarios
  {
    name: "persona",
    description: "Interact with personas",
    options: [
      {
        type: 1, // SUB_COMMAND
        name: "meet",
        description: "Have a persona appear in a channel",
        options: [
          {
            type: 3, // STRING
            name: "name",
            description: "Persona name",
            required: true,
          },
          {
            type: 7, // CHANNEL
            name: "channel",
            description: "Channel for persona to appear in",
            required: false,
          },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "ask",
        description: "Ask a persona a question",
        options: [
          {
            type: 3, // STRING
            name: "name",
            description: "Persona name",
            required: true,
          },
          {
            type: 3, // STRING
            name: "question",
            description: "Your question",
            required: true,
          },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "interact",
        description: "Interact with a persona",
        options: [
          {
            type: 3, // STRING
            name: "name",
            description: "Persona name",
            required: true,
          },
          {
            type: 3, // STRING
            name: "action",
            description: "Type of interaction",
            required: true,
            choices: [
              { name: "Tell a joke", value: "joke" },
              { name: "Give a gift", value: "gift" },
              { name: "Offer help", value: "help" },
              { name: "Challenge", value: "challenge" },
              { name: "Comfort", value: "comfort" },
              { name: "Tease", value: "tease" },
            ],
          },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "affinity",
        description: "Check your affinity with a persona",
        options: [
          {
            type: 3, // STRING
            name: "name",
            description: "Persona name",
            required: true,
          },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "list",
        description: "List all available personas",
      },
      {
        type: 1, // SUB_COMMAND
        name: "config",
        description: "Manage persona configuration",
        options: [
          {
            type: 3, // STRING
            name: "action",
            description: "Configuration action",
            required: true,
            choices: [
              { name: "Get", value: "get" },
              { name: "Set", value: "set" },
            ],
          },
          {
            type: 3, // STRING
            name: "key",
            description: "Configuration key (for set)",
            required: false,
          },
          {
            type: 3, // STRING
            name: "value",
            description: "Configuration value (for set)",
            required: false,
          },
        ],
      },
    ],
  },
  {
    name: "scenario",
    description: "Play scenario quiz",
    options: [
      {
        type: 1, // SUB_COMMAND
        name: "start",
        description: "Start a new scenario quiz",
        options: [
          {
            type: 4, // INTEGER
            name: "reveal-after",
            description: "Minutes until reveal (default: 3)",
            required: false,
            min_value: 1,
            max_value: 30,
          },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "cancel",
        description: "Cancel active scenario in this channel",
      },
      {
        type: 1, // SUB_COMMAND
        name: "reveal",
        description: "Reveal scenario results early",
        options: [
          {
            type: 3, // STRING
            name: "session-id",
            description: "Session ID to reveal",
            required: true,
          },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "stats",
        description: "View scenario session statistics",
        options: [
          {
            type: 3, // STRING
            name: "session-id",
            description: "Session ID to view",
            required: true,
          },
        ],
      },
    ],
  },

  // Additional Commands
  {
    name: "greet",
    description: "Send or preview persona-styled greetings",
    options: [
      {
        type: 1, // SUB_COMMAND
        name: "now",
        description: "Send a greeting now",
        options: [
          {
            type: 3, // STRING
            name: "persona",
            description: "Persona name (e.g., Elio)",
            required: false,
          },
          {
            type: 3, // STRING
            name: "tags",
            description: "Comma tags filter",
            required: false,
          },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "list",
        description: "List a few greetings (ephemeral)",
        options: [
          {
            type: 4, // INTEGER
            name: "limit",
            description: "How many to preview (max 10)",
            required: false,
          },
        ],
      },
    ],
  },
  {
    name: "points",
    description: "Points management commands",
    options: [
      {
        type: 1, // SUB_COMMAND
        name: "award",
        description: "Award points to a user",
        options: [
          {
            type: 6, // USER
            name: "user",
            description: "User to award points to",
            required: true,
          },
          {
            type: 4, // INTEGER
            name: "amount",
            description: "Amount of points",
            required: true,
          },
          {
            type: 3, // STRING
            name: "reason",
            description: "Reason for award",
            required: false,
          },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "balance",
        description: "Check points balance",
        options: [
          {
            type: 6, // USER
            name: "user",
            description: "User to check (default: yourself)",
            required: false,
          },
        ],
      },
    ],
  },
  {
    name: "schedule",
    description: "Manage scheduled jobs",
    options: [
      {
        type: 1, // SUB_COMMAND
        name: "list",
        description: "List all scheduled jobs",
      },
      {
        type: 1, // SUB_COMMAND
        name: "cancel",
        description: "Cancel a scheduled job",
        options: [
          {
            type: 3, // STRING
            name: "job_id",
            description: "Job ID to cancel",
            required: true,
          },
        ],
      },
    ],
  },
  {
    name: "story",
    description: "AI story generation",
    options: [
      {
        type: 1, // SUB_COMMAND
        name: "generate",
        description: "Generate a story",
        options: [
          {
            type: 3, // STRING
            name: "prompt",
            description: "Story prompt or theme",
            required: true,
          },
          {
            type: 4, // INTEGER
            name: "length",
            description: "Story length in tokens (50-500)",
            required: false,
            min_value: 50,
            max_value: 500,
          },
        ],
      },
    ],
  },
  {
    name: "finetune",
    description: "Model fine-tuning management",
    options: [
      {
        type: 1, // SUB_COMMAND
        name: "status",
        description: "Check fine-tuning status",
      },
      {
        type: 1, // SUB_COMMAND
        name: "list",
        description: "List available fine-tuned models",
      },
    ],
  },
  {
    name: "config-proactive",
    description: "Configure proactive AI features",
    options: [
      {
        type: 1, // SUB_COMMAND
        name: "get",
        description: "View current proactive feature settings",
      },
      {
        type: 1, // SUB_COMMAND
        name: "set",
        description: "Enable/disable proactive features",
        options: [
          {
            type: 3, // STRING
            name: "feature",
            description: "Feature to configure",
            required: true,
            choices: [
              { name: "Auto Meme Drop", value: "auto_meme_drop" },
              { name: "Auto Persona Chat", value: "auto_persona_chat" },
              { name: "Auto Mini Game", value: "auto_mini_game" },
              { name: "Auto Story Weave", value: "auto_story_weave" },
              { name: "Auto World Builder", value: "auto_world_builder" },
            ],
          },
          {
            type: 5, // BOOLEAN
            name: "enabled",
            description: "Enable or disable",
            required: true,
          },
        ],
      },
    ],
  },
  {
    name: "admin-data",
    description: "Admin commands for data management",
    default_member_permissions: "8", // Administrator
    options: [
      {
        type: 1, // SUB_COMMAND
        name: "update",
        description: "Manually trigger dynamic data update (generates new personas, scenarios, greetings)",
      },
      {
        type: 1, // SUB_COMMAND
        name: "status",
        description: "View status of dynamic data update system",
      },
    ],
  },

  // Mini-game System
  {
    name: "minigame",
    description: "Play mini-games with Communiverse characters",
    options: [
      {
        type: 1, // SUB_COMMAND
        name: "start",
        description: "Start a mini-game",
        options: [
          {
            type: 3, // STRING
            name: "type",
            description: "Type of game to play",
            required: true,
            choices: [
              { name: "Trivia - Test your knowledge", value: "trivia" },
              { name: "Adventure - Choose your path", value: "adventure" },
              { name: "Reaction - Test your reflexes", value: "reaction" },
              { name: "Guess Number - Logic mode", value: "guess-number" },
              { name: "Dice Duel - Highest roll wins", value: "dice-roll" },
              { name: "Battle - Turn-based duel", value: "battle" },
              { name: "IR Clue Hunt - Query & solve", value: "ir-clue" },
              { name: "Document Hunt - BM25 search", value: "doc-hunt" },
              { name: "HMM Sequence - Probabilistic path", value: "hmm-sequence" },
              { name: "N-gram Story Weave", value: "ngram-story" },
              { name: "PMI Association", value: "pmi" },
              { name: "PMI Choice", value: "pmi-choice" },
            ],
          },
          {
            type: 3, // STRING
            name: "scope",
            description: "Where to run the game",
            required: false,
            choices: [
              { name: "Current channel", value: "channel" },
              { name: "Thread", value: "thread" },
              { name: "DM", value: "dm" },
            ],
          },
          {
            type: 5, // BOOLEAN
            name: "vs_bot",
            description: "Play against a bot opponent",
            required: false,
          },
          {
            type: 4, // INTEGER
            name: "rounds",
            description: "Number of rounds (1-20)",
            required: false,
            min_value: 1,
            max_value: 20,
          },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "stop",
        description: "Stop the current game in this channel",
      },
      {
        type: 1, // SUB_COMMAND
        name: "stats",
        description: "View your mini-game statistics",
        options: [
          {
            type: 6, // USER
            name: "user",
            description: "User to view stats for",
            required: false,
          },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "guess",
        description: "Submit a guess (for guess-number game)",
        options: [
          {
            type: 4, // INTEGER
            name: "value",
            description: "Your guess",
            required: true,
          },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "roll",
        description: "Roll dice (for dice game)",
      },
      {
        type: 1, // SUB_COMMAND
        name: "recommend",
        description: "Get game recommendations based on your history",
      },
      {
        type: 1, // SUB_COMMAND
        name: "leaderboard",
        description: "View mini-game leaderboard",
      },
    ],
  },

  // Loot System
  {
    name: "loot",
    description: "Pull loot, view inventory and achievements",
    options: [
      {
        type: 1, // SUB_COMMAND
        name: "pull",
        description: "Draw a random item",
      },
      {
        type: 1, // SUB_COMMAND
        name: "inventory",
        description: "Show your inventory",
        options: [
          {
            type: 6, // USER
            name: "user",
            description: "User to view",
            required: false,
          },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "achievements",
        description: "Show achievements",
        options: [
          {
            type: 6, // USER
            name: "user",
            description: "User to view",
            required: false,
          },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "leaderboard",
        description: "Top loot collectors in this server",
      },
    ],
  },

  // Inventory System
  {
    name: "inventory",
    description: "View and use items",
    options: [
      {
        type: 1, // SUB_COMMAND
        name: "list",
        description: "Show your inventory",
        options: [
          {
            type: 6, // USER
            name: "user",
            description: "User to view",
            required: false,
          },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "use",
        description: "Use an item from your inventory",
        options: [
          {
            type: 3, // STRING
            name: "item",
            description: "Item name",
            required: true,
          },
        ],
      },
    ],
  },

  // Channel History System
  {
    name: "history",
    description: "Channel message history management (Admin only)",
    default_member_permissions: "8", // Administrator
    options: [
      {
        type: 1, // SUB_COMMAND
        name: "sync",
        description: "Sync channel history to database",
        options: [
          {
            type: 7, // CHANNEL
            name: "channel",
            description: "Channel to sync (default: current)",
            required: false,
          },
          {
            type: 4, // INTEGER
            name: "days",
            description: "Days of history to fetch (1-30)",
            required: false,
            min_value: 1,
            max_value: 30,
          },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "stats",
        description: "View channel history statistics",
      },
      {
        type: 1, // SUB_COMMAND
        name: "search",
        description: "Search archived messages",
        options: [
          {
            type: 3, // STRING
            name: "query",
            description: "Search query",
            required: true,
          },
          {
            type: 4, // INTEGER
            name: "limit",
            description: "Max results (1-20)",
            required: false,
            min_value: 1,
            max_value: 20,
          },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "context",
        description: "Get recent conversation context",
        options: [
          {
            type: 7, // CHANNEL
            name: "channel",
            description: "Channel to get context from",
            required: false,
          },
          {
            type: 4, // INTEGER
            name: "messages",
            description: "Number of messages (5-50)",
            required: false,
            min_value: 5,
            max_value: 50,
          },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "export",
        description: "Export messages for training",
        options: [
          {
            type: 4, // INTEGER
            name: "limit",
            description: "Max messages to export",
            required: false,
          },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "cleanup",
        description: "Clean up old messages",
        options: [
          {
            type: 4, // INTEGER
            name: "days",
            description: "Delete messages older than N days",
            required: false,
          },
        ],
      },
    ],
  },

  // Privacy Settings
  {
    name: "privacy",
    description: "Manage your privacy settings",
    options: [
      {
        type: 1, // SUB_COMMAND
        name: "settings",
        description: "View your current privacy settings",
      },
      {
        type: 1, // SUB_COMMAND
        name: "opt-out",
        description: "Opt out of data collection",
        options: [
          {
            type: 3, // STRING
            name: "type",
            description: "What to opt out of",
            required: true,
            choices: [
              { name: "History Collection", value: "history" },
              { name: "ML Training", value: "training" },
              { name: "Both", value: "all" },
            ],
          },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "opt-in",
        description: "Opt back into data collection",
        options: [
          {
            type: 3, // STRING
            name: "type",
            description: "What to opt into",
            required: true,
            choices: [
              { name: "History Collection", value: "history" },
              { name: "ML Training", value: "training" },
              { name: "Both", value: "all" },
            ],
          },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "delete",
        description: "Request deletion of all your data",
      },
      {
        type: 1, // SUB_COMMAND
        name: "info",
        description: "Learn about our data collection practices",
      },
    ],
  },
];

const rest = new REST({ version: "10" }).setToken(config.discord.token);

(async () => {
  try {
    console.log("Started refreshing application (/) commands.");

    // Guild-scoped deployment for development
    if (config.discord.guildIdDev) {
      await rest.put(
        Routes.applicationGuildCommands(
          config.discord.appId,
          config.discord.guildIdDev
        ),
        { body: commands }
      );
      console.log(
        `Successfully registered commands to guild ${config.discord.guildIdDev}`
      );
    } else {
      // Global deployment (takes ~1 hour to propagate)
      await rest.put(Routes.applicationCommands(config.discord.appId), {
        body: commands,
      });
      console.log("Successfully registered commands globally");
    }
  } catch (error) {
    console.error("Failed to deploy commands:", error);
    process.exit(1);
  }
})();
