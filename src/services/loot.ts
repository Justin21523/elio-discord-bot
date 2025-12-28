import { createRequire } from "module";
import { getCollection } from "../db/mongo.js";
import { logger } from "../util/logger.js";

const require = createRequire(import.meta.url);
const lootTable: any = require("../../data/loot-table.json");

type InventoryItem = {
  name: string;
  rarity: string;
  reward?: number;
  pulledAt: Date;
};

type InventoryDoc = {
  userId: string;
  guildId: string;
  username?: string;
  lastPullAt?: Date;
  items?: InventoryItem[];
  totalPulls?: number;
  rarityCounts?: Record<string, number>;
  achievements?: string[];
  daily?: Record<string, number>;
  points?: number;
};

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
  const rarities = (lootTable.rarities || []) as any[];
  const total = rarities.reduce((sum: number, r: any) => sum + r.weight, 0);
  const target = Math.random() * total;
  let acc = 0;
  for (const r of rarities) {
    acc += r.weight;
    if (target <= acc) return r;
  }
  return rarities[0] || { name: "Common", reward: 1, weight: 1 };
}

function pickItem(rarityName: string) {
  const pool = ((lootTable.items || []) as any[]).filter((i: any) => i.rarity === rarityName);
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

export async function pull(userId: string, username: string, guildId: string) {
  const col = getCollection<InventoryDoc>("inventory");
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

export async function getInventory(userId: string, guildId: string) {
  const col = getCollection<InventoryDoc>("inventory");
  const doc = await col.findOne({ userId, guildId });
  return doc || { items: [], totalPulls: 0, rarityCounts: {}, achievements: [] };
}

export async function getAchievements(userId: string, guildId: string) {
  const inv = await getInventory(userId, guildId);
  return inv.achievements || [];
}

export async function useItem(userId: string, guildId: string, itemName: string) {
  const col = getCollection<InventoryDoc>("inventory");
  const doc = await col.findOne({ userId, guildId, "items.name": itemName });
  if (!doc) throw new Error("Item not found");

  const item = (doc.items || []).find((i: any) => i.name === itemName);
  if (!item) throw new Error("Item not found");

  const reward = (USE_REWARD as Record<string, number>)[item.rarity] || 1;

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

export async function getKeyItems(userId: string, guildId: string) {
  const inv = await getInventory(userId, guildId);
  const names = (inv.items || []).map((i: any) => i.name);
  return names.filter((n: any) => KEY_ITEMS.includes(n));
}

export async function getLeaderboard(guildId: string, limit = 10) {
  const col = getCollection<InventoryDoc>("inventory");
  const cursor = col
    .find({ guildId })
    .project({ userId: 1, username: 1, totalPulls: 1, points: 1 })
    .sort({ points: -1, totalPulls: -1 })
    .limit(limit);
  return cursor.toArray();
}

function computeAchievements(doc: InventoryDoc | null): string[] {
  if (!doc) return [];

  const existing = doc.achievements ?? [];
  const unlocked = new Set<string>(existing);

  for (const t of thresholds.pulls) {
    if ((doc.totalPulls || 0) >= t) {
      unlocked.add(`Pulls_${t}`);
    }
  }
  for (const [rarity, arr] of Object.entries(thresholds.rarities as Record<string, number[]>)) {
    const count = doc.rarityCounts?.[rarity] || 0;
    for (const t of arr) {
      if (count >= t) unlocked.add(`${rarity}_${t}`);
    }
  }

  return Array.from(unlocked).filter((ach) => !existing.includes(ach));
}
