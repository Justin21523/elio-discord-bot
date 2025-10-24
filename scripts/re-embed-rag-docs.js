/**
 * Re-embed all RAG documents with current embedding model
 * Fixes dimension mismatch between old (384d) and new (1024d) embeddings
 */

import { getCollection } from '../src/db/mongo.js';
import { embed } from '../src/services/ai/embeddings.js';
import { logger } from '../src/util/logger.js';

async function reEmbedDocuments() {
  try {
    const collection = getCollection('rag_docs');

    // Get all documents
    const docs = await collection.find({}).toArray();
    logger.info(`[RE-EMBED] Found ${docs.length} documents to re-embed`);

    let updated = 0;
    let failed = 0;

    for (const doc of docs) {
      try {
        const content = doc.content || '';
        if (!content) {
          logger.warn(`[RE-EMBED] Skipping document ${doc._id} - no content`);
          continue;
        }

        // Generate new embedding with current model (bge-m3, 1024 dims)
        const result = await embed({ texts: [content] });

        if (!result.ok || !result.data?.vectors || result.data.vectors.length === 0) {
          logger.error(`[RE-EMBED] Failed to embed document ${doc._id}`);
          failed++;
          continue;
        }

        const newEmbedding = result.data.vectors[0];

        // Update document with new embedding
        await collection.updateOne(
          { _id: doc._id },
          { $set: { embedding: newEmbedding, embeddingDim: newEmbedding.length } }
        );

        updated++;
        logger.info(`[RE-EMBED] Updated ${updated}/${docs.length}: ${doc._id} (${newEmbedding.length} dims)`);
      } catch (error) {
        logger.error(`[RE-EMBED] Error processing document ${doc._id}:`, error.message);
        failed++;
      }
    }

    logger.info(`[RE-EMBED] Complete! Updated: ${updated}, Failed: ${failed}`);
    process.exit(0);
  } catch (error) {
    logger.error('[RE-EMBED] Fatal error:', error);
    process.exit(1);
  }
}

reEmbedDocuments();
