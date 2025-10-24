// /scripts/db-nuke.js
// Danger: wipe the whole database, then rebuild indexes, then (optionally) run seeds.

import { MongoClient } from 'mongodb';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config } from '../src/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runNode(scriptRelPath) {
  return new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [path.resolve(__dirname, '..', scriptRelPath)], { stdio: 'inherit' });
    p.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${scriptRelPath} exited ${code}`)));
  });
}

async function wipeDb() {
  const client = new MongoClient(config.MONGODB_URI);
  await client.connect();
  const db = client.db(config.DB_NAME);
  try {
    console.log(`[JOB] Nuking DB=${config.DB_NAME} ...`);
    try {
      const res = await db.dropDatabase();
      console.log('[JOB] dropDatabase result:', res);
      await client.close();
      return;
    } catch (e) {
      console.warn('[WARN] dropDatabase not allowed, fallback to dropping collections:', String(e));
    }

    // Fallback: drop all collections
    const cols = await db.listCollections().toArray();
    for (const c of cols) {
      try {
        console.log(' - dropping collection:', c.name);
        await db.collection(c.name).drop();
      } catch (e) {
        console.warn('   skip drop (maybe missing):', c.name, String(e));
      }
    }
    await client.close();
  } catch (e) {
    await client.close();
    throw e;
  }
}

async function main() {
  if (!config.MONGODB_URI || !config.DB_NAME) {
    console.error('Missing MONGODB_URI / DB_NAME in config/env');
    process.exit(1);
  }

  // 1) Wipe
  await wipeDb();

  // 2) Rebuild indexes/validators
  await runNode('src/db/ensure-indexes.js');

  // 3) Seed data (如需部分跳過，可註解掉對應行)
  await runNode('scripts/seed-personas.js');
  await runNode('scripts/seed-scenarios.js');
  await runNode('scripts/seed-greetings.js');  // 這支請確保已加 connectMongo()/closeMongo()
  await runNode('scripts/seed-media.js');
  await runNode('scripts/seed-points.js');

  console.log('[JOB] DB reset + seed complete.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error('[ERR] db-nuke failed:', e);
    process.exit(1);
  });
}
