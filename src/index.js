/**
 * Entry: Discord gateway + interaction router.
 */
import { Client, GatewayIntentBits, Collection, Events } from "discord.js";
import { bootDbIndexes } from "./boot/ensure-indexes.js";
import { CONFIG } from "./config.js";
import { connectMongo, closeMongo } from "./db/mongo.js";

// Commands (ESM)
import * as dropCmd from "./commands/drop.js";
import * as gameCmd from "./commands/game.js";
import * as greetCmd from "./commands/greet.js";
import * as scenarioCmd from "./commands/scenario.js";
import * as personaCmd from "./commands/persona.js";
import * as ragAddCmd from "./commands/rag-add.js";
import * as ragAskCmd from "./commands/rag-ask.js";

// Services (ESM)
import * as scheduler from "./services/scheduler.js";
import * as mediaRepo from "./services/mediaRepo.js";
import * as points from "./services/points.js";
import * as personas from "./services/persona.js";
import * as scenarios from "./services/scenario.js";
import * as webhooks from "./services/webhooks.js";;
import * as jobs from './services/jobs.js';
// AI Facade (already wired to Python service)
import aiService from "./services/ai/index.js";

// Utils
import logger from "./util/logger.js";


function buildRouter() {
  const map = new Collection();
  map.set(dropCmd.data.name, dropCmd);
  map.set(gameCmd.data.name, gameCmd);
  map.set(greetCmd.data.name, greetCmd);
  map.set(scenarioCmd.data.name, scenarioCmd);
  map.set(personaCmd.data.name, personaCmd);
  map.set(ragAddCmd.data.name, ragAddCmd);
  map.set(ragAskCmd.data.name, ragAskCmd);
  return map;
}

await bootDbIndexes();

/** Bootstrap */
async function main() {
  if (!CONFIG.DISCORD_TOKEN) {
    console.error("[ERR] Missing DISCORD_TOKEN");
    process.exit(1);
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  // ...
  await connectMongo();
  scheduler.setClient(client);
  webhooks.setClient(client);
  scheduler.setJobRunner(jobs.run);
  await scheduler.bootFromDb();

  client.once(Events.ClientReady, async () => {
    console.log("[INT] Logged in as", client.user.tag);
    try {
      await connectMongo();

      if (typeof scheduler.armAll === "function") {
        await scheduler.armAll(client);
        console.log("[INT] Scheduler armed from DB");
      } else {
        console.log("[INT] Scheduler.armAll not present, skipping.");
      }
    } catch (e) {
      console.error("[ERR] Bootstrap failed:", e);
    }
  });

  const router = buildRouter();

  // Component/interaction handler
  client.on("interactionCreate", async (interaction) => {
    if (interaction.isButton()) return;

    try {
      if (!interaction.isChatInputCommand()) return;

      const cmd = router.get(interaction.commandName);
      if (!cmd) return;

      // Provide common context via "services" bag if your commands expect it
      const services = {
        scheduler,
        mediaRepo,
        points,
        personas,
        scenarios,
        webhooks,
        ai: aiService, // <— AI Facade (calls Python service)
        mongo: {
          collections: interaction.client?.mongo?.collections, // if you attach them on connectMongo
        },
      };

      await cmd.execute(interaction, services);
    } catch (err) {
      logger.error("[ERR] interaction handler failed", { err: String(err) });
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ content: "❌ Something went wrong." });
      } else {
        await interaction.reply({ content: "❌ Something went wrong.", ephemeral: true });
      }
    }
  });


  // Optional: a DM test hook or messageCreate hook you already had
  // Example agent test (keep your guards as-is)
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (message.content === "!test-ai") {
      try {
        const res = await aiService.agentTask("daily_digest", {
          items: [
            { title: "Test News 1", url: "https://example.com/1", snippet: "Test snippet 1" },
            { title: "Test News 2", url: "https://example.com/2", snippet: "Test snippet 2" },
          ],
          maxItems: 2,
          guildId: message.guildId,
        });
        if (res.ok) {
          await message.reply(`✅ AI Agent: ${res.data.answer.slice(0, 400)}`);
        } else {
          await message.reply(`❌ AI Agent error: ${res.error.code} — ${res.error.message}`);
        }
      } catch (e) {
        await message.reply(`❌ Error: ${String(e)}`);
      }
    }
  });

  // Graceful shutdown
  process.on("unhandledRejection", (r) => console.error("[ERR] Unhandled", r));
  async function shutdown(sig) {
    try {
      console.log(`[INT] Caught ${sig}, shutting down...`);
      await closeMongo();
      await client.destroy();
    } finally {
      process.exit(0);
    }
  }
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  await client.login(CONFIG.DISCORD_TOKEN);
}

main().catch((e) => {
  console.error("[ERR] Fatal:", e);
  process.exit(1);
});
