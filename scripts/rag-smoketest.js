#!/usr/bin/env node
/**
 * scripts/rag-smoketest.js
 * Quick smoke test for RAG search functionality
 */

import dotenv from "dotenv";
import { connectDB, closeDB } from "../src/db/mongo.js";
import { search } from "../src/services/ragService.js";
import { logger } from "../src/util/logger.js";

dotenv.config();

const TEST_QUERIES = [
  { query: "Who is Elio Solis?", filters: { subject: "characters" } },
  { query: "What is the Communiverse?", filters: {} },
  { query: "Tell me about Lord Grigon", filters: {} },
  { query: "Elio relationship with Olga", filters: { type: "wiki_fandom_character" } },
  { query: "space travel wormhole", filters: {} },
];

async function runSmokeTest() {
  logger.info("[TEST] Starting RAG smoke test...");

  await connectDB();

  for (let i = 0; i < TEST_QUERIES.length; i++) {
    const { query, filters } = TEST_QUERIES[i];

    console.log(`\n${"=".repeat(80)}`);
    console.log(`TEST ${i + 1}/${TEST_QUERIES.length}: "${query}"`);
    console.log(`Filters:`, JSON.stringify(filters));
    console.log("=".repeat(80));

    const result = await search({ query, filters, topK: 5 });

    if (result.ok) {
      console.log(`✅ Success! Found ${result.data.count} results\n`);

      result.data.results.forEach((hit, idx) => {
        console.log(`${idx + 1}. [Score: ${hit.score.toFixed(3)}] ${hit.metadata.source}`);
        console.log(`   Type: ${hit.metadata.type} | Subject: ${hit.metadata.subject}`);
        console.log(`   Section: ${hit.metadata.section || "N/A"}`);
        console.log(`   Tags: ${hit.metadata.tags.join(", ") || "none"}`);
        console.log(`   Preview: ${hit.text.substring(0, 150)}...`);
        console.log();
      });
    } else {
      console.log(`❌ Error: ${result.error.code} - ${result.error.message}`);
      if (result.error.details) {
        console.log(`   Details:`, result.error.details);
      }
    }
  }

  await closeDB();
  logger.info("[TEST] Smoke test complete!");
}

runSmokeTest().catch((error) => {
  console.error("[ERR] Smoke test failed:", error);
  process.exit(1);
});
