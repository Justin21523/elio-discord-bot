// scripts/deploy-commands.js
// Guild-scoped command registration for fast iteration.
// Registers: drop, game, greet, scenario, persona.

import "dotenv/config";
import { REST, Routes } from "discord.js";
import * as dropCmd from "../src/commands/drop.js";
import * as gameCmd from "../src/commands/game.js";
import * as greetCmd from "../src/commands/greet.js";
import * as scenarioCmd from "../src/commands/scenario.js";
import * as personaCmd from "../src/commands/persona.js";

const token = process.env.DISCORD_TOKEN;
const appId = process.env.APP_ID;
const guildId = process.env.GUILD_ID_DEV;

if (!token || !appId || !guildId) {
  console.error("[ERR] Missing DISCORD_TOKEN / APP_ID / GUILD_ID_DEV in .env");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(token);

async function main() {
  const body = [
    dropCmd.data.toJSON(),
    gameCmd.data.toJSON(),
    greetCmd.data.toJSON(),
    scenarioCmd.data.toJSON(),
    personaCmd.data.toJSON(),
  ];

  try {
    const res = await rest.put(
      Routes.applicationGuildCommands(appId, guildId),
      { body }
    );
    console.log("[CMD] Registered guild commands:", res.length);
  } catch (e) {
    console.error("[ERR] Command deploy failed:", e);
    process.exit(1);
  }
}

main();
