/**
 * sync-rag-to-faiss.js
 * Sync MongoDB rag_docs to AI service FAISS index
 * This ensures RAG search works by loading existing MongoDB data into the AI service
 */

import { connectDB, closeDB, getCollection } from "../src/db/mongo.js";
import { config } from "../src/config.js";
import axios from "axios";

const AI_SERVICE_URL = process.env.AI_SERVICE_URL || "http://localhost:8000";

async function syncRAGToFAISS() {
  console.log("[SYNC-RAG] Starting sync from MongoDB to FAISS...");

  try {
    // Connect to MongoDB
    await connectDB();
    console.log("[SYNC-RAG] Connected to MongoDB");

    // Get all RAG documents
    const ragCol = getCollection("rag_docs");
    const docs = await ragCol.find({}).toArray();

    console.log(`[SYNC-RAG] Found ${docs.length} documents in MongoDB`);

    if (docs.length === 0) {
      console.log("[SYNC-RAG] No documents to sync");
      return;
    }

    // Sync each document to AI service
    let successCount = 0;
    let errorCount = 0;

    for (const doc of docs) {
      try {
        const payload = {
          text: doc.content,
          source: doc.metadata?.source || "mongodb",
          guild_id: doc.metadata?.guild_id,
          metadata: {
            ...doc.metadata,
            synced_from_mongodb: true,
            synced_at: new Date().toISOString(),
          },
        };

        console.log(`[SYNC-RAG] Inserting: ${doc.content.substring(0, 50)}...`);

        const response = await axios.post(
          `${AI_SERVICE_URL}/rag/insert`,
          payload,
          {
            headers: { "Content-Type": "application/json" },
            timeout: 30000, // 30 second timeout
          }
        );

        if (response.data.ok) {
          successCount++;
          console.log(`[SYNC-RAG] ✓ Inserted document ${successCount}/${docs.length}`);
        } else {
          errorCount++;
          console.error(`[SYNC-RAG] ✗ Failed:`, response.data.error);
        }
      } catch (error) {
        errorCount++;
        console.error(`[SYNC-RAG] ✗ Error:`, error.message);
      }

      // Small delay to avoid overwhelming the service
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    console.log("\n[SYNC-RAG] Sync complete!");
    console.log(`[SYNC-RAG] Success: ${successCount}, Errors: ${errorCount}, Total: ${docs.length}`);

    // Test search
    console.log("\n[SYNC-RAG] Testing search...");
    const testResponse = await axios.post(
      `${AI_SERVICE_URL}/rag/search`,
      {
        query: "who is Elio",
        top_k: 3,
        generate_answer: false,
      },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 10000,
      }
    );

    if (testResponse.data.ok) {
      console.log(`[SYNC-RAG] Search test successful! Found ${testResponse.data.data.hits.length} results`);
      testResponse.data.data.hits.forEach((hit, i) => {
        console.log(`  ${i + 1}. Score: ${hit.score.toFixed(3)} - ${hit.chunk.substring(0, 60)}...`);
      });
    }
  } catch (error) {
    console.error("[SYNC-RAG] Fatal error:", error.message);
    throw error;
  } finally {
    await closeDB();
    console.log("[SYNC-RAG] Disconnected from MongoDB");
  }
}

// Run
syncRAGToFAISS()
  .then(() => {
    console.log("\n[SYNC-RAG] Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n[SYNC-RAG] Failed:", error);
    process.exit(1);
  });
