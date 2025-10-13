/**
 * Entry: Discord gateway + interaction router.
 */
import { Client, GatewayIntentBits, Collection, Events } from "discord.js";
import { CONFIG } from "./config.js";
import { connectMongo, closeMongo } from "./db/mongo.js";
import * as dropCmd from "./commands/drop.js";
import * as gameCmd from "./commands/game.js";
import * as greetCmd from "./commands/greet.js";
import * as scenarioCmd from "./commands/scenario.js";
import * as personaCmd from "./commands/persona.js";
import { armAll } from "./services/scheduler.js";

function buildRouter() {
  const map = new Collection();
  map.set(dropCmd.data.name, dropCmd);
  map.set(gameCmd.data.name, gameCmd);
  map.set(greetCmd.data.name, greetCmd);
  map.set(scenarioCmd.data.name, scenarioCmd);
  map.set(personaCmd.data.name, personaCmd);
  return map;
}

async function main() {
  if (!CONFIG.DISCORD_TOKEN) {
    console.error("[ERR] Missing DISCORD_TOKEN");
    process.exit(1);
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once(Events.ClientReady, async () => {
    console.log("[INT] Logged in as", client.user.tag);
    try {
      await connectMongo();
      // Phase B: keep current scheduler; Phase C will add greet support.
      await armAll(client);
      console.log("[INT] Scheduler armed from DB");
    } catch (e) {
      console.error("[ERR] Bootstrap failed:", e);
    }
  });

  const router = buildRouter();

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const cmd = router.get(interaction.commandName);
        console.log("[CMD]", interaction.commandName, {
          guildId: interaction.guildId,
          channelId: interaction.channelId,
        });
        if (!cmd)
          return interaction.reply({
            content: "Unknown command",
            ephemeral: true,
          });
        return cmd.execute(interaction, client);
      }
      if (interaction.isButton()) {
        // game buttons
        const handledGame = await gameCmd.handleButton?.(interaction);
        if (handledGame) return;
        // scenario buttons
        const handledScenario = await scenarioCmd.handleButton?.(interaction);
        if (handledScenario) return;

        await interaction.reply({
          content: "Unhandled button.",
          ephemeral: true,
        });
      }
    } catch (e) {
      console.error("[ERR] Interaction handler failed:", e);
      if (interaction.isRepliable()) {
        try {
          await interaction.reply({
            content: "Something went wrong.",
            ephemeral: true,
          });
        } catch {}
      }
    }
  });

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
