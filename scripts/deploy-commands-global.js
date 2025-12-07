/**
 * scripts/deploy-commands-global.js
 * Deploy slash commands GLOBALLY (to all servers).
 * Use this for production deployment.
 * Uses shared command definitions from command-definitions.js
 *
 * NOTE: Global commands take ~1 hour to propagate across all Discord servers.
 */

import { REST, Routes } from "discord.js";
import { config } from "../src/config.js";
import { commands } from "./command-definitions.js";
import dotenv from "dotenv";

dotenv.config();

const rest = new REST({ version: "10" }).setToken(config.discord.token);

(async () => {
  try {
    console.log("\n========================================");
    console.log("DEPLOYING COMMANDS GLOBALLY");
    console.log("========================================\n");
    console.log("WARNING: Global commands take ~1 hour to propagate!");
    console.log("Use deploy-commands.js for instant guild-scoped testing.\n");
    console.log(`Total commands to deploy: ${commands.length}`);

    // FORCE global deployment (ignoring GUILD_ID_DEV)
    await rest.put(Routes.applicationCommands(config.discord.appId), {
      body: commands,
    });

    console.log("\nSuccessfully registered commands GLOBALLY");
    console.log(`Total commands registered: ${commands.length}`);
    console.log("\nPlease wait up to 1 hour for commands to appear in all servers.");
    console.log("========================================\n");
  } catch (error) {
    console.error("Failed to deploy commands:", error);
    process.exit(1);
  }
})();
