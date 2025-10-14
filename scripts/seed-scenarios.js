// scripts/seed-scenarios.js
/**
 * Seed scenario dataset into "scenarios" collection.
 * Expects data/scenarios.json like:
 * {
 *   "scenarios": [
 *     { "prompt":"...", "options":["A","B","C","D"], "correctIndex":1, "tags":["..."], "enabled":true, "weight":1 },
 *     ...
 *   ],
 *   "defaults": { "revealMode":"instant", "pointsOnCorrect":10 } // optional, not stored here
 * }
 */
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

dotenv.config();


const scenarios = [
  {
    prompt: 'In the Elio film, what is Elio\'s main dream?',
    options: [
      'To become a famous musician',
      'To explore the stars',
      'To meet aliens',
      'To become an astronaut'
    ],
    correctIndex: 1,
    host: 'Elio',
    tags: ['elio', 'film', 'trivia'],
    enabled: true,
    createdAt: new Date(),
    weight: 1,
  },
  {
    prompt: 'What instrument does Elio love to play?',
    options: [
      'Guitar',
      'Piano',
      'Drums',
      'Violin'
    ],
    correctIndex: 0,
    host: 'Elio',
    tags: ['elio', 'music', 'trivia'],
    enabled: true,
    createdAt: new Date(),
    weight: 1,
  },
  {
    prompt: 'Who is Elio\'s responsible older brother?',
    options: [
      'Jake',
      'Jude',
      'Max',
      'Sam'
    ],
    correctIndex: 1,
    host: 'Jude',
    tags: ['elio', 'characters', 'trivia'],
    enabled: true,
    createdAt: new Date(),
    weight: 1,
  },
  {
    prompt: 'What does Elio see in the night sky that changes everything?',
    options: [
      'A shooting star',
      'A spaceship',
      'An alien signal',
      'A constellation'
    ],
    correctIndex: 1,
    host: 'Elio',
    tags: ['elio', 'film', 'plot'],
    enabled: true,
    createdAt: new Date(),
    weight: 1,
  },
  {
    prompt: 'Which character is known for being the most energetic and fun-loving?',
    options: [
      'Elio',
      'Jude',
      'Molly',
      'Oliver'
    ],
    correctIndex: 2,
    host: 'Molly',
    tags: ['elio', 'characters', 'personality'],
    enabled: true,
    createdAt: new Date(),
    weight: 1,
  }
];

async function seed() {
  const client = new MongoClient(process.env.MONGODB_URI);

  try {
    await client.connect();
    console.log('✅ Connected to MongoDB');

    const db = client.db(process.env.DB_NAME || 'communiverse_bot');
    const collection = db.collection('scenarios');

    // Clear existing
    await collection.deleteMany({});
    console.log('🗑️  Cleared existing scenarios');

    // Insert
    const result = await collection.insertMany(scenarios);
    console.log(`✅ Inserted ${result.insertedCount} scenarios`);

    // List
    const all = await collection.find({}).toArray();
    console.log('\n📋 Scenarios in database:');
    all.forEach(s => console.log(`  - "${s.prompt.substring(0, 50)}..." (host: ${s.host})`));

  } catch (err) {
    console.error('❌ Seed failed:', err);
    process.exit(1);
  } finally {
    await client.close();
    console.log('\n✅ Seed complete');
  }
}

seed();