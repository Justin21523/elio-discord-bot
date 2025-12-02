import { createRequire } from "module";
import { getCollection } from "../db/mongo.js";
import { logger } from "../util/logger.js";

const require = createRequire(import.meta.url);
const lootTable = require("../../data/loot-table.json");

const thresholds = {
  pulls: [10, 25, 50, 100],
  rarities: {
    Legendary: [1, 3],
    Epic: [3, 10],
  },
};

import { COOLDOWNS } from "../config/cooldowns.js";

const PULL_COOLDOWN_MS = COOLDOWNS.lootPullMs;
const DAILY_LIMIT = COOLDOWNS.lootDaily;
const dailyKey = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD

const USE_REWARD = {
  Common: 2,
  Rare: 5,
  Epic: 10,
  Legendary: 20,
};
const KEY_ITEMS = ["Keycard", "Council Token"];
const GLOBAL_COOLDOWNS = {
  lootPullMs: 5000,
  lootDaily: 50,
  guessMs: 1500,
  diceMs: 1500,
  battleTurnMs: 20000,
};

function pickRarity() {
  const rarities = lootTable.rarities || [];
  const total = rarities.reduce((sum, r) => sum + r.weight, 0);
  const target = Math.random() * total;
  let acc = 0;
  for (const r of rarities) {
    acc += r.weight;
    if (target <= acc) return r;
  }
  return rarities[0];
}

function pickItem(rarityName) {
  const pool = (lootTable.items || []).filter((i) => i.rarity === rarityName);
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

export async function pull(userId, username, guildId) {
  const col = getCollection("inventory");
  const today = dailyKey();

  const existing = await col.findOne({ userId, guildId });
  const lastPullAt = existing?.lastPullAt ? new Date(existing.lastPullAt).getTime() : 0;
  if (Date.now() - lastPullAt < PULL_COOLDOWN_MS) {
    throw new Error("Pulling too fast. Please wait a few seconds.");
  }

  const dailyCount = existing?.daily?.[today] || 0;
  if (dailyCount >= DAILY_LIMIT) {
    throw new Error("Daily pull limit reached.");
  }

  const rarity = pickRarity();
  const item = pickItem(rarity.name) || { name: `${rarity.name} Loot`, rarity: rarity.name };
  const now = new Date();

  const update = {
    $setOnInsert: { userId, guildId },
    $push: {
      items: {
        name: item.name,
        rarity: item.rarity,
        reward: rarity.reward,
        pulledAt: now,
      },
    },
    $inc: {
      totalPulls: 1,
      [`rarityCounts.${rarity.name}`]: 1,
      points: rarity.reward,
      [`daily.${today}`]: 1,
    },
    $set: { username, lastPullAt: now },
  };

  await col.updateOne({ userId, guildId }, update, { upsert: true });
  const doc = await col.findOne({ userId, guildId });
  const achieved = computeAchievements(doc);

  if (achieved.length > 0) {
    await col.updateOne(
      { userId, guildId },
      { $addToSet: { achievements: { $each: achieved } } }
    );
  }

  return { item, rarity, reward: rarity.reward, achievements: achieved };
}

export async function getInventory(userId, guildId) {
  const col = getCollection("inventory");
  const doc = await col.findOne({ userId, guildId });
  return doc || { items: [], totalPulls: 0, rarityCounts: {}, achievements: [] };
}

export async function getAchievements(userId, guildId) {
  const inv = await getInventory(userId, guildId);
  return inv.achievements || [];
}

export async function useItem(userId, guildId, itemName) {
  const col = getCollection("inventory");
  const doc = await col.findOne({ userId, guildId, "items.name": itemName });
  if (!doc) throw new Error("Item not found");

  const item = (doc.items || []).find((i) => i.name === itemName);
  if (!item) throw new Error("Item not found");

  const reward = USE_REWARD[item.rarity] || 1;

  // Remove one matching item (match by name and rarity, using pulledAt to reduce accidental over-pull)
  await col.updateOne(
    { userId, guildId, "items.pulledAt": item.pulledAt, "items.name": item.name },
    {
      $pull: { items: { pulledAt: item.pulledAt, name: item.name } },
      $inc: { points: reward },
    }
  );

  return { item, reward };
}

export async function getKeyItems(userId, guildId) {
  const inv = await getInventory(userId, guildId);
  const names = (inv.items || []).map((i) => i.name);
  return names.filter((n) => KEY_ITEMS.includes(n));
}

export async function getLeaderboard(guildId, limit = 10) {
  const col = getCollection("inventory");
  const cursor = col
    .find({ guildId })
    .project({ userId: 1, username: 1, totalPulls: 1, points: 1 })
    .sort({ points: -1, totalPulls: -1 })
    .limit(limit);
  return cursor.toArray();
}

function computeAchievements(doc) {
  const unlocked = new Set(doc.achievements || []);

  for (const t of thresholds.pulls) {
    if ((doc.totalPulls || 0) >= t) {
      unlocked.add(`Pulls_${t}`);
    }
  }
  for (const [rarity, arr] of Object.entries(thresholds.rarities)) {
    const count = doc.rarityCounts?.[rarity] || 0;
    for (const t of arr) {
      if (count >= t) unlocked.add(`${rarity}_${t}`);
    }
  }

  return Array.from(unlocked).filter((ach) => !(doc.achievements || []).includes(ach));
}
