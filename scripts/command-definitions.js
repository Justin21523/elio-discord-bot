/**
 * scripts/command-definitions.js
 * Shared slash command definitions for both dev and global deployment.
 * This is the single source of truth for all bot commands.
 */

export const commands = [
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
    description: "Configure proactive bot features",
    default_member_permissions: "8", // Administrator
    options: [
      {
        type: 1, // SUB_COMMAND
        name: "view",
        description: "View current configuration for all proactive features",
      },
      {
        type: 1, // SUB_COMMAND
        name: "meme-drop",
        description: "Configure automatic meme drop feature",
        options: [
          { type: 5, name: "enabled", description: "Enable or disable meme drops", required: true },
          { type: 7, name: "channel1", description: "First channel to drop memes in", required: false, channel_types: [0] },
          { type: 7, name: "channel2", description: "Second channel (optional)", required: false, channel_types: [0] },
          { type: 7, name: "channel3", description: "Third channel (optional)", required: false, channel_types: [0] },
          { type: 3, name: "auto-detect", description: "Auto-detect channels by name pattern", required: false,
            choices: [
              { name: "Channels containing 'meme'", value: "meme" },
              { name: "Channels containing 'media'", value: "media" },
              { name: "Channels containing 'random'", value: "random" },
            ]
          },
          { type: 3, name: "type", description: "Type of memes to drop", required: false,
            choices: [
              { name: "All (images + videos)", value: "all" },
              { name: "Images only", value: "images" },
              { name: "Videos only", value: "videos" },
            ]
          },
          { type: 4, name: "cooldown-hours", description: "Hours before repeating same meme (default: 72)", required: false, min_value: 1, max_value: 168 },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "drop-now",
        description: "Immediately drop a random meme to configured channels",
      },
      {
        type: 1, // SUB_COMMAND
        name: "set",
        description: "Set a scheduled proactive feature with time and channels",
        options: [
          { type: 3, name: "feature", description: "Which feature to schedule", required: true,
            choices: [
              { name: "Meme Drop", value: "meme" },
              { name: "Mini Game", value: "game" },
              { name: "Persona Chat", value: "persona" },
            ]
          },
          { type: 3, name: "time", description: "Time to run (HH:MM format, e.g. 14:30)", required: true },
          { type: 7, name: "channel1", description: "First channel to target", required: false, channel_types: [0] },
          { type: 7, name: "channel2", description: "Second channel (optional)", required: false, channel_types: [0] },
          { type: 7, name: "channel3", description: "Third channel (optional)", required: false, channel_types: [0] },
          { type: 7, name: "channel4", description: "Fourth channel (optional)", required: false, channel_types: [0] },
          { type: 7, name: "channel5", description: "Fifth channel (optional)", required: false, channel_types: [0] },
          { type: 3, name: "channel-pattern", description: "OR auto-detect by name pattern (e.g. 'meme')", required: false },
          { type: 3, name: "repeat", description: "How often to repeat (default: daily)", required: false,
            choices: [
              { name: "Daily", value: "daily" },
              { name: "Every 6 hours", value: "6h" },
              { name: "Every 4 hours", value: "4h" },
              { name: "Every 2 hours", value: "2h" },
              { name: "Hourly", value: "1h" },
            ]
          },
          { type: 3, name: "timezone", description: "Your timezone (default: CST UTC+8)", required: false,
            choices: [
              { name: "CST - China/Taiwan/HK/SG (UTC+8)", value: "8" },
              { name: "JST - Japan (UTC+9)", value: "9" },
              { name: "KST - Korea (UTC+9)", value: "9" },
              { name: "PST - US Pacific (UTC-8)", value: "-8" },
              { name: "MST - US Mountain (UTC-7)", value: "-7" },
              { name: "CST - US Central (UTC-6)", value: "-6" },
              { name: "EST - US Eastern (UTC-5)", value: "-5" },
              { name: "GMT - UK/Portugal (UTC+0)", value: "0" },
              { name: "CET - Germany/France/Italy (UTC+1)", value: "1" },
              { name: "EET - Finland/Greece/Romania (UTC+2)", value: "2" },
              { name: "MSK - Russia Moscow (UTC+3)", value: "3" },
              { name: "AEST - Australia Eastern (UTC+10)", value: "10" },
            ]
          },
          { type: 3, name: "include-servers", description: "Only include these server IDs (comma-separated)", required: false },
          { type: 3, name: "exclude-servers", description: "Exclude these server IDs (comma-separated)", required: false },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "schedules",
        description: "View all scheduled proactive features",
      },
      {
        type: 1, // SUB_COMMAND
        name: "delete-schedule",
        description: "Delete a scheduled proactive feature",
        options: [
          { type: 3, name: "schedule-id", description: "The schedule ID to delete", required: true },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "run-now",
        description: "Immediately run a proactive feature",
        options: [
          { type: 3, name: "feature", description: "Which feature to run now", required: true,
            choices: [
              { name: "Meme Drop", value: "meme" },
              { name: "Mini Game", value: "game" },
              { name: "Persona Chat", value: "persona" },
            ]
          },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "persona-chat",
        description: "Configure automatic persona chat feature",
        options: [
          { type: 5, name: "enabled", description: "Enable or disable persona chats", required: true },
          { type: 3, name: "persona", description: "Which persona to use (default: random)", required: false,
            choices: [
              { name: "Random (any persona)", value: "random" },
              { name: "Elio", value: "elio" },
              { name: "Caleb", value: "caleb" },
              { name: "Bryce", value: "bryce" },
            ]
          },
          { type: 7, name: "channel1", description: "First channel for persona chats", required: false, channel_types: [0] },
          { type: 7, name: "channel2", description: "Second channel (optional)", required: false, channel_types: [0] },
          { type: 7, name: "channel3", description: "Third channel (optional)", required: false, channel_types: [0] },
          { type: 3, name: "auto-detect", description: "Auto-detect channels by name pattern", required: false,
            choices: [
              { name: "Channels containing 'chat'", value: "chat" },
              { name: "Channels containing 'general'", value: "general" },
              { name: "Channels containing 'lounge'", value: "lounge" },
            ]
          },
          { type: 4, name: "min-gap", description: "Minimum minutes between persona messages (default: 30)", required: false, min_value: 5, max_value: 1440 },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "mini-game",
        description: "Configure automatic mini game feature",
        options: [
          { type: 5, name: "enabled", description: "Enable or disable mini games", required: true },
          { type: 3, name: "game-type", description: "Which game type to run (default: random)", required: false,
            choices: [
              { name: "Random (any game)", value: "random" },
              { name: "Trivia - Knowledge questions", value: "trivia" },
              { name: "Adventure - Story choices", value: "adventure" },
              { name: "Reaction - Quick click", value: "reaction" },
              { name: "Guess Number - Logic mode", value: "guess-number" },
              { name: "Dice Roll - Highest roll wins", value: "dice-roll" },
              { name: "Battle - Turn-based duel", value: "battle" },
              { name: "IR Clue - Query & solve", value: "ir-clue" },
              { name: "Doc Hunt - BM25 search", value: "doc-hunt" },
              { name: "HMM Sequence - Probabilistic path", value: "hmm-sequence" },
              { name: "N-gram Story - Story weave", value: "ngram-story" },
              { name: "PMI Association", value: "pmi" },
              { name: "PMI Choice", value: "pmi-choice" },
            ]
          },
          { type: 7, name: "channel1", description: "First channel for mini games", required: false, channel_types: [0] },
          { type: 7, name: "channel2", description: "Second channel (optional)", required: false, channel_types: [0] },
          { type: 7, name: "channel3", description: "Third channel (optional)", required: false, channel_types: [0] },
          { type: 3, name: "auto-detect", description: "Auto-detect channels by name pattern", required: false,
            choices: [
              { name: "Channels containing 'game'", value: "game" },
              { name: "Channels containing 'minigame'", value: "minigame" },
              { name: "Channels containing 'bot'", value: "bot" },
            ]
          },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "list-servers",
        description: "List all servers the bot is in (for include/exclude options)",
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

  // Separate Config Commands (to avoid Discord subcommand caching issues)
  {
    name: "config-meme",
    description: "Configure automatic meme drop feature",
    default_member_permissions: "8", // Administrator
    options: [
      { type: 5, name: "enabled", description: "Enable or disable meme drops", required: true },
      { type: 3, name: "type", description: "Type of memes to drop", required: false,
        choices: [
          { name: "All (images + videos)", value: "all" },
          { name: "Images only", value: "images" },
          { name: "Videos only", value: "videos" },
        ]
      },
      { type: 7, name: "channel1", description: "First channel to drop memes", required: false, channel_types: [0] },
      { type: 7, name: "channel2", description: "Second channel (optional)", required: false, channel_types: [0] },
      { type: 7, name: "channel3", description: "Third channel (optional)", required: false, channel_types: [0] },
      { type: 3, name: "channel-pattern", description: "Custom pattern to match channel names (e.g., 'meme', 'media')", required: false },
      { type: 3, name: "include-servers", description: "Only include these server IDs (comma-separated)", required: false },
      { type: 3, name: "exclude-servers", description: "Exclude these server IDs (comma-separated)", required: false },
      { type: 4, name: "cooldown-hours", description: "Hours before repeating same meme (default: 72)", required: false, min_value: 1, max_value: 168 },
    ],
  },
  {
    name: "config-minigame",
    description: "Configure automatic mini-game feature",
    default_member_permissions: "8", // Administrator
    options: [
      { type: 5, name: "enabled", description: "Enable or disable automatic mini-games", required: true },
      { type: 3, name: "game-type", description: "Type of mini-game to run", required: false,
        choices: [
          { name: "Random", value: "random" },
          { name: "Trivia", value: "trivia" },
          { name: "Adventure", value: "adventure" },
          { name: "Reaction", value: "reaction" },
          { name: "Guess Number", value: "guess-number" },
          { name: "Dice Roll", value: "dice-roll" },
          { name: "Battle", value: "battle" },
          { name: "IR Clue", value: "ir-clue" },
          { name: "Doc Hunt", value: "doc-hunt" },
          { name: "HMM Sequence", value: "hmm-sequence" },
          { name: "N-gram Story", value: "ngram-story" },
          { name: "PMI Association", value: "pmi" },
          { name: "Keyword PMI", value: "pmi-choice" },
        ]
      },
      { type: 7, name: "channel1", description: "First channel for mini-games", required: false, channel_types: [0] },
      { type: 7, name: "channel2", description: "Second channel (optional)", required: false, channel_types: [0] },
      { type: 7, name: "channel3", description: "Third channel (optional)", required: false, channel_types: [0] },
      { type: 3, name: "channel-pattern", description: "Custom pattern to match channel names (e.g., 'game', 'bot')", required: false },
      { type: 3, name: "include-servers", description: "Only include these server IDs (comma-separated)", required: false },
      { type: 3, name: "exclude-servers", description: "Exclude these server IDs (comma-separated)", required: false },
      { type: 4, name: "cooldown-hours", description: "Hours between automatic mini-games (default: 4)", required: false, min_value: 1, max_value: 48 },
    ],
  },
  {
    name: "config-persona",
    description: "Configure automatic persona chat feature",
    default_member_permissions: "8", // Administrator
    options: [
      { type: 5, name: "enabled", description: "Enable or disable automatic persona chat", required: true },
      { type: 3, name: "persona", description: "Which persona should speak", required: false,
        choices: [
          { name: "Random (any persona)", value: "random" },
          { name: "Elio", value: "elio" },
          { name: "Caleb", value: "caleb" },
          { name: "Bryce", value: "bryce" },
        ]
      },
      { type: 7, name: "channel1", description: "First channel for persona chat", required: false, channel_types: [0] },
      { type: 7, name: "channel2", description: "Second channel (optional)", required: false, channel_types: [0] },
      { type: 7, name: "channel3", description: "Third channel (optional)", required: false, channel_types: [0] },
      { type: 3, name: "channel-pattern", description: "Custom pattern to match channel names (e.g., 'chat', 'general')", required: false },
      { type: 3, name: "include-servers", description: "Only include these server IDs (comma-separated)", required: false },
      { type: 3, name: "exclude-servers", description: "Exclude these server IDs (comma-separated)", required: false },
      { type: 4, name: "cooldown-hours", description: "Hours between automatic messages (default: 2)", required: false, min_value: 1, max_value: 24 },
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
      {
        type: 1, // SUB_COMMAND
        name: "status",
        description: "Check current game status",
      },
      {
        type: 1, // SUB_COMMAND
        name: "help",
        description: "Get help with minigames",
      },
      // IR Clue Game
      {
        type: 1, // SUB_COMMAND
        name: "clue",
        description: "Query for clues (IR Clue game)",
        options: [
          {
            type: 3, // STRING
            name: "query",
            description: "Search terms",
            required: true,
          },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "answer",
        description: "Submit your answer",
        options: [
          {
            type: 3, // STRING
            name: "text",
            description: "Your answer",
            required: true,
          },
        ],
      },
      // Document Hunt Game
      {
        type: 1, // SUB_COMMAND
        name: "docquery",
        description: "Search documents (Doc Hunt game)",
        options: [
          {
            type: 3, // STRING
            name: "query",
            description: "Search terms",
            required: true,
          },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "docanswer",
        description: "Submit document answer",
        options: [
          {
            type: 3, // STRING
            name: "text",
            description: "Your answer",
            required: true,
          },
        ],
      },
      // N-gram Story Game
      {
        type: 1, // SUB_COMMAND
        name: "narrate",
        description: "Add to story (N-gram game)",
        options: [
          {
            type: 3, // STRING
            name: "keyword",
            description: "Seed keyword",
            required: false,
          },
        ],
      },
      // PMI Games
      {
        type: 1, // SUB_COMMAND
        name: "pmi",
        description: "Submit PMI guess",
        options: [
          {
            type: 3, // STRING
            name: "guess",
            description: "Your guess",
            required: true,
          },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "pmichoice",
        description: "Choose PMI option",
        options: [
          {
            type: 4, // INTEGER
            name: "option",
            description: "Option number (1-4)",
            required: true,
            min_value: 1,
            max_value: 4,
          },
        ],
      },
      // HMM Sequence Game
      {
        type: 1, // SUB_COMMAND
        name: "next",
        description: "Advance to next step (HMM game)",
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

  // Help Command
  {
    name: "help",
    description: "Show all available bot commands",
    options: [
      {
        type: 3, // STRING
        name: "category",
        description: "Filter by category",
        required: false,
        choices: [
          { name: "Games & Fun", value: "games" },
          { name: "AI & Chat", value: "ai" },
          { name: "Economy & Profile", value: "economy" },
          { name: "Admin & Config", value: "admin" },
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

  // Social Media Monitor Configuration
  {
    name: "config-social",
    description: "Configure social media monitor (Elio news sharing)",
    default_member_permissions: "8", // Administrator
    options: [
      {
        type: 1, // SUB_COMMAND
        name: "view",
        description: "View current social media monitor configuration",
      },
      {
        type: 1, // SUB_COMMAND
        name: "enable",
        description: "Enable social media monitor",
        options: [
          { type: 7, name: "channel1", description: "First channel to post news", required: true, channel_types: [0] },
          { type: 7, name: "channel2", description: "Second channel (optional)", required: false, channel_types: [0] },
          { type: 7, name: "channel3", description: "Third channel (optional)", required: false, channel_types: [0] },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "disable",
        description: "Disable social media monitor",
      },
      {
        type: 1, // SUB_COMMAND
        name: "set-frequency",
        description: "Set how often to search for news",
        options: [
          {
            type: 3, // STRING
            name: "frequency",
            description: "Search frequency",
            required: true,
            choices: [
              { name: "Every hour", value: "1h" },
              { name: "Every 2 hours (default)", value: "2h" },
              { name: "Every 4 hours", value: "4h" },
              { name: "Every 6 hours", value: "6h" },
              { name: "Every 12 hours", value: "12h" },
              { name: "Daily", value: "24h" },
            ],
          },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "set-limit",
        description: "Set maximum shares per run",
        options: [
          {
            type: 4, // INTEGER
            name: "max-shares",
            description: "Maximum news items to share per run (1-10)",
            required: true,
            min_value: 1,
            max_value: 10,
          },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "toggle-source",
        description: "Enable or disable a news source",
        options: [
          {
            type: 3, // STRING
            name: "source",
            description: "News source to toggle",
            required: true,
            choices: [
              { name: "Reddit", value: "reddit" },
              { name: "YouTube", value: "youtube" },
              { name: "Twitter/X", value: "twitter" },
              { name: "News (Variety, THR, etc)", value: "news" },
            ],
          },
          { type: 5, name: "enabled", description: "Enable or disable this source", required: true },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "run-now",
        description: "Immediately run the social media monitor",
      },
      {
        type: 1, // SUB_COMMAND
        name: "add-channel",
        description: "Add a channel to receive news",
        options: [
          { type: 7, name: "channel", description: "Channel to add", required: true, channel_types: [0] },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "remove-channel",
        description: "Remove a channel from receiving news",
        options: [
          { type: 7, name: "channel", description: "Channel to remove", required: true, channel_types: [0] },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "set-channel-pattern",
        description: "Set a pattern to match channel names (e.g., 'news', 'elio')",
        options: [
          { type: 3, name: "pattern", description: "Channel name pattern (case-insensitive, use * for wildcard)", required: true },
          { type: 5, name: "enabled", description: "Enable or disable pattern matching", required: false },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "clear-channel-pattern",
        description: "Clear channel name pattern and use explicit channel list only",
      },
      {
        type: 1, // SUB_COMMAND
        name: "set-server-mode",
        description: "Set server filter mode (include or exclude)",
        options: [
          {
            type: 3, // STRING
            name: "mode",
            description: "Include only listed servers, or exclude listed servers",
            required: true,
            choices: [
              { name: "Include (only listed servers)", value: "include" },
              { name: "Exclude (all except listed)", value: "exclude" },
              { name: "All servers (no filter)", value: "all" },
            ],
          },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "add-server",
        description: "Add a server to the include/exclude list",
        options: [
          { type: 3, name: "server-id", description: "Server ID to add (or 'current' for this server)", required: true },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "remove-server",
        description: "Remove a server from the include/exclude list",
        options: [
          { type: 3, name: "server-id", description: "Server ID to remove (or 'current' for this server)", required: true },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "add-channel-by-id",
        description: "Add a channel from ANY server by its ID",
        options: [
          { type: 3, name: "channel-id", description: "Channel ID to add (17-20 digit number)", required: true },
        ],
      },
      {
        type: 1, // SUB_COMMAND
        name: "list-all-channels",
        description: "List all channels across all servers that match the pattern",
      },
    ],
  },
];
