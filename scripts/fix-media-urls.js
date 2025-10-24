#!/usr/bin/env node
/**
 * fix-media-urls.js
 * Replace invalid example.com URLs with valid media URLs
 */

import { connectDB, collections, closeDB } from "../src/db/mongo.js";
import { logger } from "../src/util/logger.js";

async function fixMediaUrls() {
  try {
    await connectDB();
    logger.info("[MEDIA] Fixing invalid media URLs...");

    // Find all media with example.com URLs
    const invalidMedia = await collections.media
      .find({ url: /example\.com/ })
      .toArray();

    logger.info(`[MEDIA] Found ${invalidMedia.length} invalid URLs to fix`);

    if (invalidMedia.length === 0) {
      logger.info("[MEDIA] All media URLs are valid!");
      return;
    }

    // Update each invalid URL with a valid placeholder
    const validUrls = [
      "https://media.tenor.com/LYKXQ0-gif1.gif",
      "https://media.tenor.com/ABC123DEF456.gif",
      "https://media.tenor.com/XYZ789QWE012.gif",
    ];

    let updateCount = 0;
    for (const media of invalidMedia) {
      const newUrl = validUrls[updateCount % validUrls.length];

      await collections.media.updateOne(
        { _id: media._id },
        { $set: { url: newUrl } }
      );

      logger.info(`[MEDIA] Updated ${media._id}: ${media.url} -> ${newUrl}`);
      updateCount++;
    }

    logger.info(`[MEDIA] Successfully updated ${updateCount} media URLs`);

    // Show final state
    const allMedia = await collections.media.find({}).toArray();
    logger.info("[MEDIA] Final media URLs:");
    for (const media of allMedia) {
      logger.info(`  - ${media._id}: ${media.url}`);
    }
  } catch (error) {
    logger.error("[MEDIA] Fix failed:", error);
    throw error;
  } finally {
    await closeDB();
  }
}

fixMediaUrls().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
