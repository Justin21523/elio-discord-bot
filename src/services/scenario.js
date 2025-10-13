// src/services/scenario.js
// Service for starting, answering (handled in command), and revealing scenarios.

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { ObjectId } from "mongodb";
import { collections } from "../db/mongo.js";
import { awardWin } from "./points.js";
import { personaSay } from "./webhooks.js";

const timers = new Map(); // sessionId -> Timeout

export async function startSession(
  client,
  { guildId, channelId, tag = null, revealIn = 0 }
) {
  const { scenarios, scenario_sessions } = collections();

  const pool = await scenarios.find({ enabled: true }).toArray();
  if (!pool.length) {
    return { ok: false, message: "No scenarios in the database. Run the seed or add some first." };
  }

  const match = { enabled: { $ne: false } };
  if (tag) match.tags = { $in: [tag] };
  const arr = await scenarios
    .aggregate([{ $match: match }, { $sample: { size: 1 } }])
    .toArray();
  const scenario = arr[0];
  if (!scenario) throw new Error("No scenario found");

  if (!Array.isArray(scenario.options) || scenario.options.length !== 4) {
    throw new Error("Scenario must have exactly 4 options");
  }

  const doc = {
    guildId,
    channelId,
    scenarioId: scenario._id,
    status: "open",
    revealInMinutes: revealIn,
    startedAt: new Date(),
  };
  const ins = await scenario_sessions.insertOne(doc);
  const sessionId = ins.insertedId;

  // Post prompt + buttons
  const labels = ["A", "B", "C", "D"];
  const row = new ActionRowBuilder().addComponents(
    ...labels.map((label, idx) =>
      new ButtonBuilder()
        .setCustomId(`scn_${sessionId.toString()}_${idx}`)
        .setLabel(label)
        .setStyle(ButtonStyle.Primary)
    )
  );

  const channel = await client.channels.fetch(channelId);
  const content = `**Scenario**:\n${scenario.prompt}\n\nA) ${scenario.options[0]}\nB) ${scenario.options[1]}\nC) ${scenario.options[2]}\nD) ${scenario.options[3]}`;
  const msg = await channel.send({ content, components: [row] });

  await collections().scenario_sessions.updateOne(
    { _id: sessionId },
    { $set: { messageId: msg.id } }
  );

  // NEW: immediate reveal path with a short grace period
  if (revealIn === 0) {
    setTimeout(() => {
      revealNow(client, sessionId).catch((e) =>
        console.error("[ERR] scenario reveal failed:", e)
      );
    }, 2500);
  } else if (revealIn > 0) {
    // If revealIn > 0, set an in-memory timer (simple MVP). If the bot restarts, the session stays open.
    const t = setTimeout(() => {
      revealNow(client, sessionId).catch((e) =>
        console.error("[ERR] scenario reveal failed:", e)
      );
      timers.delete(sessionId.toString());
    }, revealIn * 60 * 1000);
    timers.set(sessionId.toString(), t);
  }

  return { sessionId, scenario, messageId: msg.id };
}

export async function revealNow(client, sessionId) {
  const { scenario_sessions, scenarios, scenario_answers, personas } =
    collections();
  const session = await scenario_sessions.findOne({
    _id: new ObjectId(sessionId),
  });
  if (!session || session.status !== "open") return null;

  const scenario = await scenarios.findOne({ _id: session.scenarioId });
  if (!scenario) throw new Error("Scenario disappeared");

  // collect answers
  const answers = await scenario_answers
    .find({ sessionId: session._id.toString() })
    .toArray();
  const correctIndex = scenario.correctIndex;
  const correctUserIds = answers
    .filter((a) => a.choice === correctIndex)
    .map((a) => a.userId);

  // scoring
  for (const uid of correctUserIds) {
    try {
      await awardWin({ guildId: session.guildId, userId: uid });
    } catch (e) {
      console.error("[ERR] awardWin:", e);
    }
  }

  // close session
  await scenario_sessions.updateOne(
    { _id: session._id },
    { $set: { status: "closed", revealedAt: new Date() } }
  );

  // 1) disable original buttons (bot message)
  const channel = await client.channels.fetch(session.channelId);
  let message = null;
  try {
    message = await channel.messages.fetch(session.messageId);
  } catch {}
  if (message) {
    const labels = ["A", "B", "C", "D"];
    const disabledRow = new ActionRowBuilder().addComponents(
      ...labels.map((label, idx) =>
        new ButtonBuilder()
          .setCustomId(`scn_${session._id.toString()}_${idx}`)
          .setLabel(label)
          .setStyle(
            idx === correctIndex ? ButtonStyle.Success : ButtonStyle.Secondary
          )
          .setDisabled(true)
      )
    );
    await message.edit({ components: [disabledRow] });
  }

  // 2) announce result via host persona webhook
  const counts = [0, 0, 0, 0];
  for (const a of answers) counts[a.choice]++;

  const labels = ["A", "B", "C", "D"];
  const hostName = scenario.hostPersonaName || "Elio";
  const host = await personas.findOne({ name: hostName });
  const color = Number.isFinite(host?.color) ? host.color : 0x2ecc71;

  const embed = new EmbedBuilder()
    .setTitle(`${hostName} — Scenario Revealed`)
    .setDescription(
      [
        `**Correct:** ${labels[correctIndex]}`,
        `**Votes** — A: ${counts[0]} | B: ${counts[1]} | C: ${counts[2]} | D: ${counts[3]}`,
        correctUserIds.length
          ? `**Winners:** ${correctUserIds.map((id) => `<@${id}>`).join(", ")}`
          : `**Winners:** _No winners this time._`,
      ].join("\n")
    )
    .setColor(color);

  await personaSay(channel, {
    name: hostName,
    avatar: host?.avatar || null,
    embeds: [embed],
  });

  return { correctIndex, winners: correctUserIds };
}
