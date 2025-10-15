// /src/index.js
// English-only code & comments.
// Boot flow: connect Mongo → ensure indexes → start Discord client → wire services → boot scheduler → route slash commands.

import { Client, Collection, Events, GatewayIntentBits } from "discord.js";
import { ensureIndexes as bootDbIndexes } from "./db/ensure-indexes.js";
import { CONFIG } from "./config.js";
import { connectMongo, closeMongo } from "./db/mongo.js";

/* ------------------------ Commands (implemented now) ------------------------ */
import * as dropCmd from "./commands/drop.js";
import * as greetCmd from "./commands/greet.js";
import * as personaCmd from "./commands/persona.js";
import * as pointsCmd from "./commands/points.js";
import * as leaderboardCmd from "./commands/leaderboard.js";
import * as scenarioCmd from "./commands/scenario.js";
import * as scheduleCmd from "./commands/scheduler.js";

/* ------------------------- Services (implemented now) ----------------------- */
import * as webhooks from "./services/webhooks.js";
import * as scheduler from "./services/scheduler.js";
import * as mediaRepo from "./services/mediaRepo.js";
import * as personas from "./services/persona.js";
import * as points from "./services/points.js";
import * as scenarios from "./services/scenario.js";
import * as greetings from "./services/greetings.js";

/* --------------------------------- Utils ----------------------------------- */
import { logger } from "./util/logger.js";
import { incCounter, startTimer, METRIC_NAMES } from "./util/metrics.js";

const log = logger.child({ mod: "index" });

/** Build a static command router map (file → command name). */
function buildRouter() {
  const map = new Collection();
  const mods = [
    dropCmd,
    greetCmd,
    personaCmd,
    pointsCmd,
    leaderboardCmd,
    scenarioCmd,
    scheduleCmd,
  ];
  for (const mod of mods) {
    if (mod?.data?.name && typeof mod?.execute === "function") {
      map.set(mod.data.name, mod);
    }
  }
  return map;
}

async function main() {
  if (!CONFIG.DISCORD_TOKEN) {
    console.error("[ERR] Missing DISCORD_TOKEN");
    process.exit(1);
  }

  // 1) Connect DB + ensure indexes (once)
  await connectMongo();
  try {
    await bootDbIndexes();
  } catch (e) {
    console.warn("[WARN] ensure-indexes skipped/failed (non-fatal):", String(e));
  }

  // 2) Start Discord client (minimal intents we need now)
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  });

  // 3) Wire services that need the client
  scheduler.setClient(client);
  webhooks.setClient(client);
  // (Optional) if you later expose a generic job runner:
  // scheduler.setJobRunner(jobs.run);

  // 4) Boot in-memory schedules from DB
  await scheduler.bootFromDb().catch((e) =>
    console.warn("[WARN] bootFromDb failed (non-fatal):", String(e))
  );

  client.once(Events.ClientReady, () => {
    console.log("[INT] Logged in as", client.user.tag);
  });

  // 5) Router map (fixed names)
  const router = buildRouter();

  // 6) Interaction handler (slash commands only)
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const stop = startTimer(METRIC_NAMES.command_latency_seconds, {
      command: interaction.commandName,
    });

    try {
      const mod = router.get(interaction.commandName);
      if (!mod) return;

      // Services bag (kept for parity; commands may ignore it)
      const services = {
        scheduler,
        mediaRepo,
        points,
        personas,
        scenarios,
        greetings,
        webhooks,
      };

      await mod.execute(interaction, services);
      incCounter(METRIC_NAMES.commands_total, {
        command: interaction.commandName,
      });
      stop({ command: interaction.commandName });
    } catch (e) {
      console.error("[ERR] command error:", interaction.commandName, e);
      stop({ command: interaction.commandName });
      try {
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({ content: "❌ Something went wrong." });
        } else {
          await interaction.reply({ content: "❌ Something went wrong.", ephemeral: true });
        }
      } catch {}
    }
  });

  // 7) Graceful shutdown
  async function shutdown(sig) {
    try {
      console.log(`[INT] Caught ${sig}, shutting down...`);
      await closeMongo();
      await client.destroy();
    } finally {
      process.exit(0);
    }
  }
  process.on("unhandledRejection", (r) => console.error("[ERR] Unhandled:", r));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // 8) Login
  await client.login(CONFIG.DISCORD_TOKEN);
}

main().catch((e) => {
  console.error("[ERR] Fatal:", e);
  process.exit(1);
});
