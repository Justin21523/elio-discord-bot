/**
 * Update persona avatars
 */
import { connectDB, closeDB, getCollection } from "../src/db/mongo.js";

const personaAvatars = {
  "Elio": "https://i.imgur.com/X2vJ8Kq.png",
  "Glordon": "https://i.imgur.com/7JW9Xqw.png",
  "Caleb": "https://i.imgur.com/9KnH4wJ.png"
};

async function main() {
  try {
    await connectDB();
    console.log("🔄 Updating persona avatars...");

    const personasCol = getCollection("personas");

    for (const [name, avatar] of Object.entries(personaAvatars)) {
      const result = await personasCol.updateOne(
        { name },
        { $set: { avatar } }
      );

      if (result.modifiedCount > 0) {
        console.log(`✅ Updated ${name} avatar`);
      } else if (result.matchedCount > 0) {
        console.log(`ℹ️  ${name} avatar unchanged`);
      } else {
        console.log(`⚠️  ${name} not found`);
      }
    }

    console.log("\n🎉 Avatar update complete!");
    await closeDB();
  } catch (error) {
    console.error("❌ Update failed:", error.message);
    process.exit(1);
  }
}

main();
