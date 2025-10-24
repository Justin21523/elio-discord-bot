#!/usr/bin/env node
/**
 * seed-rag-simple.js
 * Add basic RAG test data about Communiverse characters
 */

import { connectDB, collections, closeDB } from "../src/db/mongo.js";
import { logger } from "../src/util/logger.js";

const ragDocs = [
  {
    content: "Elio is a curious and enthusiastic young alien from the planet Communiverse. He serves as the Earth Ambassador and loves to explore and make new friends. Elio is known for his bright personality and his interest in human culture.",
    metadata: {
      source: "character_bio",
      subject: "characters",
      character: "Elio",
      tags: ["elio", "ambassador", "alien"]
    },
    embedding: Array(384).fill(0).map(() => Math.random() * 2 - 1) // Mock embedding
  },
  {
    content: "Glordon is a potato-shaped alien who is Elio's friend. Despite his unusual appearance, Glordon is wise and often provides comic relief. He has a deep love for potatoes and potato-related activities.",
    metadata: {
      source: "character_bio",
      subject: "characters",
      character: "Glordon",
      tags: ["glordon", "potato", "alien", "friend"]
    },
    embedding: Array(384).fill(0).map(() => Math.random() * 2 - 1)
  },
  {
    content: "Olga is a strong and adventurous character from the Communiverse universe. She is known for her leadership skills and her ability to solve complex problems.",
    metadata: {
      source: "character_bio",
      subject: "characters",
      character: "Olga",
      tags: ["olga", "leader", "adventurer"]
    },
    embedding: Array(384).fill(0).map(() => Math.random() * 2 - 1)
  },
  {
    content: "Caleb is a tech-savvy character who helps Elio navigate Earth technology. He's patient and knowledgeable about both alien and human systems.",
    metadata: {
      source: "character_bio",
      subject: "characters",
      character: "Caleb",
      tags: ["caleb", "tech", "helper"]
    },
    embedding: Array(384).fill(0).map(() => Math.random() * 2 - 1)
  },
  {
    content: "The Communiverse is a vast universe where different alien species coexist peacefully. It features wormholes for transportation and various planets with unique cultures.",
    metadata: {
      source: "world_lore",
      subject: "lore",
      tags: ["communiverse", "universe", "wormhole", "space"]
    },
    embedding: Array(384).fill(0).map(() => Math.random() * 2 - 1)
  },
  {
    content: "Personas in this bot system represent different characters from the Communiverse. Each persona has unique personality traits, speaking styles, and knowledge bases. Users can interact with personas through commands or passive mentions.",
    metadata: {
      source: "bot_features",
      subject: "system",
      tags: ["persona", "bot", "features"]
    },
    embedding: Array(384).fill(0).map(() => Math.random() * 2 - 1)
  }
];

async function seedRAG() {
  try {
    await connectDB();
    logger.info("[RAG] Seeding RAG documents...");

    // Clear existing docs
    const deleteResult = await collections.rag_docs.deleteMany({});
    logger.info(`[RAG] Cleared ${deleteResult.deletedCount} existing documents`);

    // Insert new docs
    const insertResult = await collections.rag_docs.insertMany(ragDocs);
    logger.info(`[RAG] Inserted ${insertResult.insertedCount} RAG documents`);

    // Show final count
    const finalCount = await collections.rag_docs.countDocuments();
    logger.info(`[RAG] Total RAG documents: ${finalCount}`);

    logger.info("[RAG] ✅ RAG seed complete!");
  } catch (error) {
    logger.error("[RAG] Seed failed:", error);
    throw error;
  } finally {
    await closeDB();
  }
}

seedRAG().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
