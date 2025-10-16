/**
 * scripts/seed.js
 * Seed database with sample media for testing.
 */

import { connectDB, closeDB } from "../src/db/mongo.js";
import { add } from "../src/services/mediaRepo.js";

const sampleMedia = [
  {
    type: "gif",
    url: "https://media.giphy.com/media/3o7TKSjRrfIPjeiVyM/giphy.gif",
    tags: ["elio", "space", "stars"],
    nsfw: false,
  },
  {
    type: "image",
    url: "https://i.imgur.com/abc123.png",
    tags: ["elio", "cute"],
    nsfw: false,
  },
  {
    type: "gif",
    url: "https://media.giphy.com/media/example/giphy.gif",
    tags: ["funny", "meme"],
    nsfw: false,
  },
  {
    type: "image",
    url: "https://i.imgur.com/def456.jpg",
    tags: ["elio", "pixar"],
    nsfw: false,
  },
];

async function seed() {
  try {
    console.log("🌱 Seeding database...");

    await connectDB();

    let added = 0;
    for (const media of sampleMedia) {
      const result = await add(media);
      if (result.ok) {
        added++;
        console.log(`✅ Added ${media.type}: ${media.tags.join(", ")}`);
      } else {
        console.log(`❌ Failed to add ${media.type}: ${result.error.message}`);
      }
    }

    console.log(
      `\n🎉 Seeding complete! Added ${added}/${sampleMedia.length} items.`
    );

    await closeDB();
    process.exit(0);
  } catch (error) {
    console.error("❌ Seeding failed:", error.message);
    process.exit(1);
  }
}

seed();
