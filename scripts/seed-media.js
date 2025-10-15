// /scripts/seed-media.js
// Seed media collection from /data/media.json (upsert by url).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';
import 'dotenv/config';
import { CONFIG } from '../src/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const client = new MongoClient(CONFIG.MONGODB_URI);
  await client.connect();
  const db = client.db(CONFIG.DB_NAME);

  const f = path.join(__dirname, '..', 'data', 'media.json');
  const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
  const items = raw.media || [];

  const ops = items.map((m) => ({
    updateOne: {
      filter: { url: m.url },
      update: {
        $set: {
          type: m.type,
          url: m.url,
          tags: m.tags || [],
          nsfw: !!m.nsfw,
          enabled: m.enabled !== false,
          updatedAt: new Date()
        },
        $setOnInsert: { addedAt: new Date() }
      },
      upsert: true
    }
  }));

  const res = await db.collection('media').bulkWrite(ops, { ordered: false });
  console.log('[JOB] media bulk result:', res.result || res);
  const total = await db.collection('media').countDocuments();
  console.log('[JOB] media total in DB:', total);

  await client.close();
}

main().catch((e) => {
  console.error('[ERR] seed-media failed', e);
  process.exit(1);
});
