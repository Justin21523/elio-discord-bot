// /scripts/deploy-commands.js
// Guild-scoped command registration. Lists commands explicitly.

import "dotenv/config";
import { REST, Routes } from "discord.js";

import * as dropCmd from "../src/commands/drop.js";
import * as gameCmd from "../src/commands/game.js";
import * as greetCmd from "../src/commands/greet.js";
import * as scenarioCmd from "../src/commands/scenario.js";
import * as personaCmd from "../src/commands/persona.js";
// ✅ add the RAG commands
import * as ragAddCmd from "../src/commands/rag-add.js";
import * as ragAskCmd from "../src/commands/rag-ask.js";

const token = process.env.DISCORD_TOKEN;
const appId = process.env.APP_ID;
const guildId = process.env.GUILD_ID_DEV;

if (!token || !appId || !guildId) {
  console.error("[ERR] Missing DISCORD_TOKEN / APP_ID / GUILD_ID_DEV in .env");
  process.exit(1);
}

const rest = new REST({ version: "10" }).setToken(token);

async function main() {
  // Required options must precede optional ones in every command definition.
  const body = [
    dropCmd.data.toJSON(),
    gameCmd.data.toJSON(),
    greetCmd.data.toJSON(),
    scenarioCmd.data.toJSON(),
    personaCmd.data.toJSON(),
    ragAddCmd.data.toJSON(),   // ✅ now included
    ragAskCmd.data.toJSON(),   // ✅ now included
  ];

  try {
    await rest.put(
      Routes.applicationGuildCommands(appId, guildId),
      { body }
    );
    console.log("[CMD] Registered guild commands:", body.length);
  } catch (e) {
    console.error("[ERR] Command deploy failed:", e);
    process.exit(1);
  }
}

main();
