<<<<<<< HEAD
/**
 * scripts/deploy-commands.js
 * Deploy slash commands to Discord (guild-scoped for development).
 */

import { REST, Routes } from "discord.js";
import { config } from "../src/config.js";
import dotenv from "dotenv";

dotenv.config();

const commands = [
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
        description: "Make a persona appear and greet",
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
            description: "Channel for persona to appear (default: current)",
            required: false,
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
        description: "View or update persona configuration",
        options: [
          {
            type: 3, // STRING
            name: "action",
            description: "Action to perform",
            required: true,
            choices: [
              { name: "Get current config", value: "get" },
              { name: "Set config value", value: "set" },
            ],
          },
          {
            type: 3, // STRING
            name: "key",
            description: "Config key to set (e.g., cooldownSec, memoryOptIn)",
            required: false,
          },
          {
            type: 3, // STRING
            name: "value",
            description: "New value",
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
      },
      {
        type: 1, // SUB_COMMAND
        name: "reveal",
        description: "Reveal scenario results",
        options: [
          {
            type: 3, // STRING
            name: "session_id",
            description: "Session ID (from scenario message)",
            required: true,
          },
        ],
      },
    ],
  },
];
=======
// /scripts/deploy-commands.js
// English-only code & comments.
// Deploy slash commands to a single dev guild (safer & faster).
// Reads all /src/commands/*.js modules that export { data, execute } and registers them.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { CONFIG } from '../src/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  if (!CONFIG.DISCORD_TOKEN) throw new Error('Missing DISCORD_TOKEN');
  if (!CONFIG.APP_ID) throw new Error('Missing APP_ID');
  if (!CONFIG.GUILD_ID_DEV) throw new Error('Missing GUILD_ID_DEV');

  const commandsDir = path.resolve(__dirname, '..', 'src', 'commands');
  const files = fs.readdirSync(commandsDir).filter((f) => f.endsWith('.js'));

  const body = [];
  for (const file of files) {
    const modPath = path.join(commandsDir, file);
    const mod = await import(modPath);
    if (mod?.data?.toJSON && typeof mod?.execute === 'function') {
      const json = mod.data.toJSON();
      body.push(json);
      console.log(`- queued: ${json.name} (${file})`);
    }
  }

  if (body.length === 0) {
    console.warn('[WARN] No commands found under /src/commands.');
    return;
  }

  const rest = new REST({ version: '10' }).setToken(CONFIG.DISCORD_TOKEN);

  console.log(`[JOB] Deploying ${body.length} commands to guild ${CONFIG.GUILD_ID_DEV}...`);
  const route = Routes.applicationGuildCommands(CONFIG.APP_ID, CONFIG.GUILD_ID_DEV);
>>>>>>> 8e08c6071dd76d67fb7ab80ef3afdfe83828445a

const rest = new REST({ version: "10" }).setToken(config.discord.token);

(async () => {
  try {
<<<<<<< HEAD
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
=======
    const res = await rest.put(route, { body });
    console.log('[JOB] Deployment OK. Count =', Array.isArray(res) ? res.length : 'unknown');
  } catch (e) {
    console.error('[ERR] deploy-commands failed:', e?.rawError || e);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error('[ERR] Fatal in deploy-commands:', e);
    process.exit(1);
  });
}
>>>>>>> 8e08c6071dd76d67fb7ab80ef3afdfe83828445a
