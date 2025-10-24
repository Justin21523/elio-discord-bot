// /scripts/seed-media.js
// Seed media collection from /data/media.json (upsert by url).
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';
import 'dotenv/config';
import { config } from '../src/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const uri = process.env.MONGODB_URI || config.mongodb?.uri || 'mongodb://localhost:27017';
  const dbName = process.env.DB_NAME || config.mongodb?.name || 'communiverse_bot';

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db(dbName);

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
