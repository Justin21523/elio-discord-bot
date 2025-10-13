import cron from "node-cron";
import { collections } from "../db/mongo.js";
import { pickRandom } from "./mediaRepo.js";
import { postGreet } from "./greetings.js";

const jobs = new Map(); // key: `${guildId}:${kind}` -> cron task

export async function armAll(client) {
  const { schedules } = collections();
  const all = await schedules.find({ enabled: { $ne: false } }).toArray();
  for (const s of all) {
    await armOne(client, s.guildId, s.channelId, s.hhmm, s.kind || "drop", {
      tags: s.tags || [],
      mention: s.mention || "none",
    });
  }
}

export async function armOne(
  client,
  guildId,
  channelId,
  hhmm,
  kind = "drop",
  extra = {}
) {
  const [HH, MM] = (hhmm || "").split(":").map(Number);
  if (Number.isNaN(HH) || Number.isNaN(MM)) throw new Error("Invalid HH:MM");

  const key = `${guildId}:${kind}`;
  const existing = jobs.get(key);
  if (existing) existing.stop();

  const spec = `${MM} ${HH} * * *`; // every day HH:MM UTC
  const task = cron.schedule(
    spec,
    async () => {
      try {
        if (kind === "greet") {
          await postGreet(client, {
            guildId,
            channelId,
            tags: extra.tags || [],
            mention: extra.mention || "none",
          });
          console.log("[JOB] greet ->", guildId, channelId);
        } else {
          const channel = await client.channels.fetch(channelId);
          const item = await pickRandom({
            allowNsfw: !!channel?.nsfw,
            tags: extra.tags || [],
          });
          if (!item)
            return channel.send("No media yet. Ask an admin to add some!");
          await channel.send(item.url);
          console.log("[JOB] drop ->", guildId, channelId, item.url);
        }
      } catch (e) {
        console.error("[ERR] cron job failed:", e);
      }
    },
    { timezone: "UTC" }
  );

  jobs.set(key, task);
  task.start();
  console.log("[JOB] Armed cron", { guildId, kind, hhmm, channelId });
}
