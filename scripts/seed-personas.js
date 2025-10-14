// scripts/seed-personas.js
/**
 * Seed personas and global persona config.
 * Expects data/personas.json:
 * {
 *   "personas": [
 *     { "name":"Elio", "traits":{"humor":0.6,"warmth":0.95,"discipline":0.5}, "likes":["..."], "dislikes":["..."], "openers":["..."] },
 *     ...
 *   ],
 *   "actions": { "joke":{"friendship":2,"trust":0,"dependence":0}, ... },
 *   "modifiers": [ { "persona":"Caleb","action":"help","multiplier":1.5 }, ... ],
 *   "cooldownSeconds": 180
 * }
 */
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

dotenv.config();

const personas = {
  "personas": [
    {
      "name": "Elio",
      "avatar": "https://placehold.co/256x256/png?text=Elio",
      "color": 15844367,
      "traits": { "humor": 0.6, "warmth": 0.95, "discipline": 0.5 },
      "likes": ["gentleness", "honesty", "small wins"],
      "dislikes": ["mockery", "needless drama"],
      "openers": [
        "Hey, you made it. That already counts.",
        "Deep breath—want a soft start today?"
      ]
    },
    {
      "name": "Glordon",
      "avatar": "https://placehold.co/256x256/png?text=Glordon",
      "color": 3447003,
      "traits": { "humor": 0.85, "warmth": 0.8, "discipline": 0.2 },
      "likes": ["jokes", "learning", "being included"],
      "dislikes": ["being shushed", "complicated metaphors"],
      "openers": [
        "Hello! Do humans always greet potatoes first?",
        "I brought enthusiasm. Is that a resource?"
      ]
    },
    {
      "name": "Caleb",
      "avatar": "https://placehold.co/256x256/png?text=Caleb",
      "likes": ["results", "clear plans", "quiet"],
      "dislikes": ["wasting time", "vague talk"],
      "openers": [
        "You need something or just passing by?",
        "If we do this, we do it right."
      ]
    }
  ],
};

async function seed() {
  const client = new MongoClient(process.env.MONGODB_URI);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db(process.env.DB_NAME || 'communiverse_bot');
    const collection = db.collection('personas');

    // Clear existing
    await collection.deleteMany({});
    console.log('🗑️  Cleared existing personas');

    // Insert
    const result = await collection.insertMany(personas);
    console.log(`✅ Inserted ${result.insertedCount} personas`);

    // List
    const all = await collection.find({}).toArray();
    console.log('\n📋 Personas in database:');
    all.forEach(p => console.log(`  - ${p.name} (humor: ${p.traits.humor}, warmth: ${p.traits.warmth})`));

  } catch (err) {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  } finally {
    await client.close();
    console.log('\n✅ Seed complete');
  }
}

seed();