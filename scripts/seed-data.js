/**
 * scripts/seed-data.js
 * Seed Data Script - Populates initial data for testing
 * Run with: node scripts/seed-data.js
 */

import { fileURLToPath } from "node:url";
import { connectMongo, closeMongo, collections } from "../src/db/mongo.js";
import mediaRepo from "../src/services/mediaRepo.js";

// Sample media data for seeding
const SAMPLE_MEDIA = [
  // Elio-themed GIFs and images
  {
    type: "gif",
    url: "https://media.giphy.com/media/3o7TKsQ8MqcE1y0RuU/giphy.gif",
    tags: ["space", "stars", "animated"],
    nsfw: false,
    enabled: true,
  },
  {
    type: "image",
    url: "https://i.imgur.com/example1.jpg",
    tags: ["elio", "character"],
    nsfw: false,
    enabled: true,
  },
  {
    type: "gif",
    url: "https://media.giphy.com/media/l0HlBO7eyXzSZkJri/giphy.gif",
    tags: ["funny", "reaction"],
    nsfw: false,
    enabled: true,
  },
  {
    type: "image",
    url: "https://i.imgur.com/example2.png",
    tags: ["communiverse", "aliens"],
    nsfw: false,
    enabled: true,
  },
  {
    type: "gif",
    url: "https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif",
    tags: ["celebration", "party"],
    nsfw: false,
    enabled: true,
  },
];

// Sample personas for future use
const SAMPLE_PERSONAS = [
  {
    name: "Elio",
    avatarUrl: "https://example.com/elio-avatar.png",
    traits: {
      humor: 0.8,
      warmth: 0.9,
      discipline: 0.3,
    },
    likes: ["space", "aliens", "adventure", "making friends"],
    dislikes: ["being alone", "bullies", "giving up"],
    openers: [
      "Hey! Did you know there are over 500 million habitable planets out there?",
      "Whoa, are you from the Communiverse too?",
      "This is so cool! Just like in my ham radio days!",
    ],
    systemStyle:
      "Enthusiastic, curious, and optimistic. Speaks with childlike wonder about space and aliens.",
  },
  {
    name: "Glordon",
    avatarUrl: "https://example.com/glordon-avatar.png",
    traits: {
      humor: 0.6,
      warmth: 0.9,
      discipline: 0.7,
    },
    likes: ["friendship", "understanding", "peaceful solutions"],
    dislikes: ["conflict", "expectations", "being misunderstood"],
    openers: [
      "*speaks in deep growls* (Hello, friend!)",
      "Father says I should be fierce, but... I'd rather be friends!",
      "You seem nice! Want to explore together?",
    ],
    systemStyle:
      "Gentle and kind despite fearsome appearance. Often conflicted between duty and desires.",
  },
  {
    name: "Aunt Olga",
    avatarUrl: "https://example.com/olga-avatar.png",
    traits: {
      humor: 0.5,
      warmth: 0.8,
      discipline: 0.9,
    },
    likes: ["order", "safety", "family", "Elio (despite everything)"],
    dislikes: ["chaos", "danger", "Elio's obsession with aliens"],
    openers: [
      "Elio! Get down from there right now!",
      "I know you miss them, but we need to focus on the present.",
      "Sometimes I wonder what your parents would think...",
    ],
    systemStyle:
      "Caring but stern. Protective and sometimes overwhelmed. Trying her best.",
  },
];

// Sample greetings
const SAMPLE_GREETINGS = [
  {
    text: "Welcome to the Communiverse! 🌟",
    weight: 1,
    personaHost: "Elio",
  },
  {
    text: "Another earthling! The ambassador would be pleased!",
    weight: 1,
    personaHost: "Glordon",
  },
  {
    text: "Make yourself at home, but please follow the rules.",
    weight: 1,
    personaHost: "Aunt Olga",
  },
];

/**
 * Seed media collection
 */
async function seedMedia() {
  console.log("\n📦 Seeding media collection...");

  let successCount = 0;
  let errorCount = 0;

  for (const media of SAMPLE_MEDIA) {
    const result = await mediaRepo.add(media);
    if (result.ok) {
      successCount++;
      console.log(`  ✅ Added ${media.type}: ${media.tags.join(", ")}`);
    } else {
      errorCount++;
      console.log(`  ❌ Failed to add media: ${result.error.message}`);
    }
  }

  console.log(
    `Media seeding complete: ${successCount} added, ${errorCount} failed`
  );
}

/**
 * Seed personas collection
 */
async function seedPersonas() {
  console.log("\n👥 Seeding personas collection...");

  let successCount = 0;
  let errorCount = 0;

  for (const persona of SAMPLE_PERSONAS) {
    try {
      // Check if persona already exists
      const existing = await collections.personas.findOne({
        name: persona.name,
      });
      if (existing) {
        console.log(`  ⏭️  Persona "${persona.name}" already exists`);
        continue;
      }

      await collections.personas.insertOne({
        ...persona,
        createdAt: new Date(),
      });

      successCount++;
      console.log(`  ✅ Added persona: ${persona.name}`);
    } catch (error) {
      errorCount++;
      console.log(
        `  ❌ Failed to add persona ${persona.name}: ${error.message}`
      );
    }
  }

  console.log(
    `Persona seeding complete: ${successCount} added, ${errorCount} failed`
  );
}

/**
 * Seed greetings collection
 */
async function seedGreetings() {
  console.log("\n👋 Seeding greetings collection...");

  try {
    // Clear existing greetings
    await collections.greetings.deleteMany({});

    // Insert new greetings
    const result = await collections.greetings.insertMany(SAMPLE_GREETINGS);
    console.log(`  ✅ Added ${result.insertedCount} greetings`);
  } catch (error) {
    console.log(`  ❌ Failed to seed greetings: ${error.message}`);
  }
}

/**
 * Main seeding function
 */
async function main() {
  console.log("═══════════════════════════════════════");
  console.log("  Communiverse Bot - Database Seeder   ");
  console.log("═══════════════════════════════════════");

  try {
    // Connect to database
    console.log("\n🔌 Connecting to database...");
    await connectMongo();
    console.log("  ✅ Database connected");

    // Run seeders
    await seedMedia();
    await seedPersonas();
    await seedGreetings();

    // Show statistics
    console.log("\n📊 Database Statistics:");

    const stats = await Promise.all([
      collections.media.countDocuments({ enabled: true }),
      collections.personas.countDocuments({}),
      collections.greetings.countDocuments({}),
      collections.profiles.countDocuments({}),
      collections.schedules.countDocuments({ enabled: true }),
    ]);

    console.log(`  • Active media items: ${stats[0]}`);
    console.log(`  • Personas: ${stats[1]}`);
    console.log(`  • Greetings: ${stats[2]}`);
    console.log(`  • User profiles: ${stats[3]}`);
    console.log(`  • Active schedules: ${stats[4]}`);

    console.log("\n✨ Seeding complete!");
    console.log("\nNext steps:");
    console.log("  1. Make sure your .env file is configured");
    console.log("  2. Run: npm run deploy-commands");
    console.log("  3. Run: npm start");

    process.exit(0);
  } catch (error) {
    console.error("\n❌ Seeding failed:", error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await closeMongo();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export default main;
