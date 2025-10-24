#!/usr/bin/env node
/**
 * scripts/ingest-rag.js
 * RAG ingestion pipeline: load markdown files, chunk, embed, upsert to MongoDB
 * Supports YAML frontmatter and intelligent chunking with heading boundaries
 */

import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";
import { embed as embedTexts } from "../src/services/ai/embeddings.js";
import { logger } from "../src/util/logger.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAG_RESOURCES_DIR = path.join(__dirname, "..", "data", "rag-resources");

// Configuration from environment
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017";
const DB_NAME = process.env.DB_NAME || "communiverse_bot";
const RAG_EMBEDDING_MODEL = process.env.RAG_EMBEDDING_MODEL || "bge-m3";
const RAG_EMBEDDING_DIM = parseInt(process.env.RAG_EMBEDDING_DIM || "1024", 10);
const CHUNK_SIZE_MIN = 700;
const CHUNK_SIZE_MAX = 900;
const CHUNK_OVERLAP = 140;

/**
 * Parse YAML frontmatter from markdown
 * @param {string} content - Raw file content
 * @returns {{ frontmatter: object, body: string }}
 */
function parseFrontmatter(content) {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const [, yamlStr, body] = match;
  const frontmatter = {};

  // Simple YAML parser (handles basic key-value and arrays)
  const lines = yamlStr.split("\n");
  let currentKey = null;
  let currentArray = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    // Array item
    if (trimmed.startsWith("-")) {
      const value = trimmed.slice(1).trim().replace(/^["']|["']$/g, "");
      currentArray.push(value);
      continue;
    }

    // Key-value pair
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx > 0) {
      // Save previous array if exists
      if (currentKey && currentArray.length > 0) {
        frontmatter[currentKey] = currentArray;
        currentArray = [];
      }

      currentKey = trimmed.slice(0, colonIdx).trim();
      let value = trimmed.slice(colonIdx + 1).trim();

      // Remove quotes
      value = value.replace(/^["']|["']$/g, "");

      if (value) {
        frontmatter[currentKey] = value;
        currentKey = null;
      }
    }
  }

  // Save last array
  if (currentKey && currentArray.length > 0) {
    frontmatter[currentKey] = currentArray;
  }

  return { frontmatter, body };
}

/**
 * Chunk text into segments respecting heading boundaries
 * @param {string} text - Text to chunk
 * @param {string} filePath - Source file path for debugging
 * @returns {Array<{text: string, section: string}>}
 */
function chunkText(text, filePath) {
  const chunks = [];
  const lines = text.split("\n");

  let currentChunk = [];
  let currentSection = "Introduction";
  let currentTokens = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineTokens = estimateTokens(line);

    // Detect heading (markdown)
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      // Save previous chunk if it has content
      if (currentChunk.length > 0 && currentTokens > 100) {
        chunks.push({
          text: currentChunk.join("\n").trim(),
          section: currentSection,
        });

        // Start new chunk with overlap (last few lines)
        const overlapLines = currentChunk.slice(-3);
        currentChunk = [...overlapLines, line];
        currentTokens = overlapLines.reduce((sum, l) => sum + estimateTokens(l), 0) + lineTokens;
      } else {
        currentChunk.push(line);
        currentTokens += lineTokens;
      }

      currentSection = headingMatch[2].trim();
      continue;
    }

    // Add line to current chunk
    currentChunk.push(line);
    currentTokens += lineTokens;

    // If chunk exceeds max size, split it
    if (currentTokens >= CHUNK_SIZE_MAX) {
      chunks.push({
        text: currentChunk.join("\n").trim(),
        section: currentSection,
      });

      // Create overlap
      const overlapText = currentChunk.slice(-5).join("\n");
      const overlapTokenCount = estimateTokens(overlapText);

      currentChunk = currentChunk.slice(-5);
      currentTokens = overlapTokenCount;
    }
  }

  // Add final chunk
  if (currentChunk.length > 0 && currentTokens > 50) {
    chunks.push({
      text: currentChunk.join("\n").trim(),
      section: currentSection,
    });
  }

  return chunks;
}

/**
 * Estimate token count (rough approximation: 1 token ≈ 4 chars)
 * @param {string} text
 * @returns {number}
 */
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

/**
 * Recursively find all .md files
 * @param {string} dir - Directory to search
 * @returns {Promise<Array<string>>}
 */
async function findMarkdownFiles(dir) {
  const files = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findMarkdownFiles(fullPath)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Process a single markdown file
 * @param {string} filePath
 * @returns {Promise<Array<object>>} - Array of chunk documents
 */
async function processFile(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const { frontmatter, body } = parseFrontmatter(content);

    // Extract metadata
    const relativePath = path.relative(RAG_RESOURCES_DIR, filePath);
    const fileName = path.basename(filePath, ".md");

    const metadata = {
      source: frontmatter.title || fileName,
      url: frontmatter.source || frontmatter.url || null,
      type: frontmatter.category || frontmatter.type || "document",
      subject: frontmatter.subject || inferSubject(filePath),
      tags: Array.isArray(frontmatter.tags) ? frontmatter.tags : [],
      lang: frontmatter.lang || "en",
      updated_at: frontmatter.last_updated || new Date().toISOString().split("T")[0],
      file_path: relativePath,
    };

    // Chunk the body
    const chunks = chunkText(body, filePath);

    // Create chunk documents
    const documents = chunks.map((chunk, idx) => {
      const chunkId = `${fileName}_chunk_${idx}`;
      return {
        id: chunkId,
        text: chunk.text,
        bm25Text: chunk.text.toLowerCase(), // For BM25 search
        meta: {
          ...metadata,
          section: chunk.section,
          chunk_index: idx,
          total_chunks: chunks.length,
        },
        embedding: null, // Will be filled after embedding
      };
    });

    logger.info(`[INGEST] Processed ${filePath}: ${documents.length} chunks`);
    return documents;
  } catch (error) {
    logger.error(`[INGEST] Error processing ${filePath}:`, error);
    return [];
  }
}

/**
 * Infer subject from file path
 * @param {string} filePath
 * @returns {string}
 */
function inferSubject(filePath) {
  const parts = filePath.split(path.sep);
  const ragIndex = parts.indexOf("rag-resources");

  if (ragIndex >= 0 && ragIndex < parts.length - 1) {
    return parts[ragIndex + 1];
  }

  if (filePath.includes("character")) return "characters";
  if (filePath.includes("world")) return "world";
  if (filePath.includes("persona")) return "personas";
  if (filePath.includes("encyclopedia")) return "encyclopedia";

  return "general";
}

/**
 * Embed documents in batches
 * @param {Array<object>} documents
 * @returns {Promise<Array<object>>}
 */
async function embedDocuments(documents) {
  // Reduced batch size to avoid timeout (embedding large batches takes >60s)
  const BATCH_SIZE = 8;
  const embedded = [];

  for (let i = 0; i < documents.length; i += BATCH_SIZE) {
    const batch = documents.slice(i, i + BATCH_SIZE);
    const texts = batch.map((doc) => doc.text);

    logger.info(`[INGEST] Embedding batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(documents.length / BATCH_SIZE)} (${batch.length} chunks)`);

    const result = await embedTexts(texts, { normalize: true });

    if (result.ok) {
      batch.forEach((doc, idx) => {
        doc.embedding = result.data.vectors[idx];
      });
      embedded.push(...batch);
      logger.info(`[INGEST] ✅ Batch embedded successfully (total: ${embedded.length}/${documents.length})`);
    } else {
      logger.error(`[INGEST] ❌ Embedding failed for batch starting at index ${i}:`, result.error);
      // Continue with other batches even if one fails
    }

    // Rate limiting - wait longer between batches to avoid overwhelming AI service
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  return embedded;
}

/**
 * Upsert documents to MongoDB
 * @param {Array<object>} documents
 * @param {object} collection - MongoDB collection
 */
async function upsertDocuments(documents, collection) {
  const bulkOps = documents.map((doc) => ({
    updateOne: {
      filter: { id: doc.id },
      update: { $set: doc },
      upsert: true,
    },
  }));

  if (bulkOps.length > 0) {
    const result = await collection.bulkWrite(bulkOps);
    logger.info(`[INGEST] Upserted ${result.upsertedCount + result.modifiedCount} documents`);
  }
}

/**
 * Main ingestion pipeline
 */
async function main() {
  logger.info("[INGEST] Starting RAG ingestion pipeline...");
  logger.info(`[INGEST] RAG resources directory: ${RAG_RESOURCES_DIR}`);
  logger.info(`[INGEST] Embedding model: ${RAG_EMBEDDING_MODEL} (dim=${RAG_EMBEDDING_DIM})`);

  // Connect to MongoDB
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db(DB_NAME);
  const collection = db.collection("rag_chunks");

  logger.info(`[INGEST] Connected to MongoDB: ${DB_NAME}.rag_chunks`);

  try {
    // Find all markdown files
    const files = await findMarkdownFiles(RAG_RESOURCES_DIR);
    logger.info(`[INGEST] Found ${files.length} markdown files`);

    if (files.length === 0) {
      logger.warn("[INGEST] No markdown files found. Exiting.");
      return;
    }

    // Process all files
    const allDocuments = [];
    for (const file of files) {
      const docs = await processFile(file);
      allDocuments.push(...docs);
    }

    logger.info(`[INGEST] Total chunks created: ${allDocuments.length}`);

    // Embed all documents
    logger.info("[INGEST] Starting embedding process...");
    const embeddedDocs = await embedDocuments(allDocuments);
    logger.info(`[INGEST] Successfully embedded ${embeddedDocs.length} chunks`);

    // Upsert to MongoDB
    logger.info("[INGEST] Upserting to MongoDB...");
    await upsertDocuments(embeddedDocs, collection);

    logger.info("[INGEST] ✅ Ingestion complete!");
    logger.info(`[INGEST] Summary: ${files.length} files → ${embeddedDocs.length} chunks`);
  } catch (error) {
    logger.error("[INGEST] Fatal error:", error);
    throw error;
  } finally {
    await client.close();
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error("[ERR] Ingestion failed:", error);
    process.exit(1);
  });
}

export { processFile, chunkText, parseFrontmatter };
