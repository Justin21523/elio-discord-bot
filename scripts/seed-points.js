import 'dotenv/config.js';
import { connectMongo, closeMongo, withCollection } from '../src/db/mongo.js';

// 預設：建立彙總快取 & 幾筆測試帳
const TOTALS = [
  { guildId: 'dev', userId: 'u1', total: 100 },
  { guildId: 'dev', userId: 'u2', total: 50  },
];

async function main() {
  await connectMongo();

  await withCollection('points_totals', async (col) => {
    await col.createIndex({ guildId: 1, userId: 1 }, { unique: true });
    for (const t of TOTALS) {
      await col.findOneAndUpdate(
        { guildId: t.guildId, userId: t.userId },
        { $set: { ...t, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } },
        { upsert: true }
      );
    }
  });

  await withCollection('points_ledger', async (col) => {
    await col.createIndex({ guildId: 1, userId: 1, createdAt: -1 });
  });

  console.log('[seed-points] done');
  await closeMongo();
}

main().catch(async (e) => { console.error(e); await closeMongo(); process.exit(1); });
