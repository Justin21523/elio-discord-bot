/**
 * scripts/deploy-commands.js
 * Deploy slash commands to Discord (guild-scoped for development).
 * Uses shared command definitions from command-definitions.js
 */

import { REST, Routes } from "discord.js";
import { config } from "../src/config.js";
import { commands } from "./command-definitions.js";
import dotenv from "dotenv";

dotenv.config();

const rest = new REST({ version: "10" }).setToken(config.discord.token);

(async () => {
  try {
    console.log("Started refreshing application (/) commands.");
    console.log(`Total commands to deploy: ${commands.length}`);

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
