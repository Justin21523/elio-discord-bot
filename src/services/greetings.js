// src/services/greetings.js
// Service for composing and posting a daily greeting (image + phrase).

import { collections } from "../db/mongo.js";

/** Pick a random greeting phrase by optional tags. */
export async function pickGreeting({ tags = [] } = {}) {
  const { greetings } = collections();
  const match = { enabled: { $ne: false } };
  if (tags.length) match.tags = { $in: tags };
  const docs = await greetings
    .aggregate([{ $match: match }, { $sample: { size: 1 } }])
    .toArray();
  return docs[0] || null;
}

/** Replace placeholders {user} {guild} {weekday}. */
export function composeGreetingMessage(template, { userId, guildName }) {
  const weekday = new Date().toLocaleDateString("en-US", { weekday: "long" });
  return template
    .replaceAll("{user}", userId ? `<@${userId}>` : "")
    .replaceAll("{guild}", guildName || "")
    .replaceAll("{weekday}", weekday);
}

/** Post one greeting into a channel: image + phrase (+ optional mention). */
export async function postGreet(
  client,
  { guildId, channelId, tags = [], mention = "none" } = {}
) {
  const { media } = collections();
  // pick image
  const mMatch = { enabled: true };
  if (tags.length) mMatch.tags = { $in: tags };
  const m = await media
    .aggregate([{ $match: mMatch }, { $sample: { size: 1 } }])
    .toArray();
  const url = m[0]?.url;

  // pick phrase
  const g = await pickGreeting({ tags });
  const guild = await client.guilds.fetch(guildId);
  const line = g?.text
    ? composeGreetingMessage(g.text, { guildName: guild?.name })
    : "Hello!";

  const channel = await client.channels.fetch(channelId);
  const pieces = [];
  if (mention === "here") pieces.push("@here");
  pieces.push(line);
  if (url) pieces.push(url);

  await channel.send(pieces.join("\n"));
}
