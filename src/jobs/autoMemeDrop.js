/**
 * autoMemeDrop.js
 * Automatically drop random memes from local data/memes/ folder to Discord channels
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { AttachmentBuilder } from "discord.js";
import { logger } from "../util/logger.js";
import { getCollection } from "../db/mongo.js";

// Get project root directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, "../..");

// Constants
const MEMES_DIR = path.join(PROJECT_ROOT, "data/memes");
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB Discord limit
const DEFAULT_COOLDOWN_HOURS = 72; // 3 days before repeating same meme

// Valid file extensions
const IMAGE_EXTENSIONS = [".jpg", ".jpeg", ".png", ".gif", ".webp"];
const VIDEO_EXTENSIONS = [".mp4", ".webm", ".mov"];

/**
 * Get list of local meme files
 */
function getLocalMemes(config = {}) {
  const memeType = config.memeType || "all";
  const memes = [];

  try {
    // Get images
    if (memeType === "all" || memeType === "images") {
      const imagesDir = path.join(MEMES_DIR, "images");
      if (fs.existsSync(imagesDir)) {
        const imageFiles = fs.readdirSync(imagesDir);
        for (const file of imageFiles) {
          const ext = path.extname(file).toLowerCase();
          if (IMAGE_EXTENSIONS.includes(ext)) {
            const filePath = path.join(imagesDir, file);
            const stats = fs.statSync(filePath);
            if (stats.size <= MAX_FILE_SIZE) {
              memes.push({
                filename: file,
                path: filePath,
                type: "image",
                size: stats.size,
              });
            }
          }
        }
      }
    }

    // Get videos
    if (memeType === "all" || memeType === "videos") {
      const videosDir = path.join(MEMES_DIR, "videos");
      if (fs.existsSync(videosDir)) {
        const videoFiles = fs.readdirSync(videosDir);
        for (const file of videoFiles) {
          const ext = path.extname(file).toLowerCase();
          if (VIDEO_EXTENSIONS.includes(ext)) {
            const filePath = path.join(videosDir, file);
            const stats = fs.statSync(filePath);
            if (stats.size <= MAX_FILE_SIZE) {
              memes.push({
                filename: file,
                path: filePath,
                type: "video",
                size: stats.size,
              });
            }
          }
        }
      }
    }

    logger.info(`[JOB] Found ${memes.length} memes (type: ${memeType})`);
    return memes;
  } catch (error) {
    logger.error("[JOB] Error reading meme files", { error: error.message });
    return [];
  }
}

/**
 * Filter out recently dropped memes
 */
async function filterRecentlyDropped(memes, cooldownHours = DEFAULT_COOLDOWN_HOURS) {
  try {
    const cutoff = new Date(Date.now() - cooldownHours * 60 * 60 * 1000);
    const recentDrops = await getCollection("meme_drops")
      .find({ droppedAt: { $gt: cutoff } })
      .toArray();

    const recentFiles = new Set(recentDrops.map((d) => d.filename));
    const filtered = memes.filter((m) => !recentFiles.has(m.filename));

    logger.info(
      `[JOB] Filtered ${memes.length - filtered.length} recently dropped memes, ${filtered.length} available`
    );

    // If all memes were recently dropped, reset and allow any
    if (filtered.length === 0 && memes.length > 0) {
      logger.info("[JOB] All memes were recently dropped, allowing any meme");
      return memes;
    }

    return filtered;
  } catch (error) {
    logger.error("[JOB] Error filtering recent drops", { error: error.message });
    return memes; // On error, allow any meme
  }
}

/**
 * Record a dropped meme in database
 */
async function recordDroppedMeme(meme, channelIds) {
  try {
    await getCollection("meme_drops").insertOne({
      filename: meme.filename,
      type: meme.type,
      size: meme.size,
      channelIds,
      droppedAt: new Date(),
    });
  } catch (error) {
    logger.error("[JOB] Error recording meme drop", { error: error.message });
  }
}

/**
 * Get auto meme drop configuration
 */
async function getAutoMemeConfig() {
  try {
    const configCol = getCollection("bot_config");
    let config = await configCol.findOne({ key: "auto_meme_drop" });

    if (!config) {
      // Create default config
      config = {
        key: "auto_meme_drop",
        enabled: false,
        channelIds: [],
        memeType: "all",
        cooldownHours: DEFAULT_COOLDOWN_HOURS,
        updatedAt: new Date(),
      };

      await configCol.insertOne(config);
    }

    return config;
  } catch (error) {
    logger.error("[JOB] Failed to get auto meme config", {
      error: error.message,
    });
    return { enabled: false, channelIds: [] };
  }
}

/**
 * Update auto meme drop configuration
 */
export async function updateConfig(updates) {
  try {
    const configCol = getCollection("bot_config");

    await configCol.updateOne(
      { key: "auto_meme_drop" },
      {
        $set: {
          ...updates,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );

    logger.info("[JOB] Auto meme drop config updated");
  } catch (error) {
    logger.error("[JOB] Failed to update auto meme config", {
      error: error.message,
    });
  }
}

/**
 * Main job runner - drop random meme from local files
 */
export async function run(client) {
  try {
    logger.info("[JOB] autoMemeDrop started");

    const config = await getAutoMemeConfig();

    if (!config.enabled) {
      logger.info("[JOB] autoMemeDrop is disabled");
      return;
    }

    if (!config.channelIds || config.channelIds.length === 0) {
      logger.info("[JOB] autoMemeDrop has no channels configured");
      return;
    }

    // Get local memes
    const allMemes = getLocalMemes(config);
    if (allMemes.length === 0) {
      logger.warn("[JOB] No memes found in data/memes/");
      return;
    }

    // Filter recently dropped
    const cooldownHours = config.cooldownHours || DEFAULT_COOLDOWN_HOURS;
    const availableMemes = await filterRecentlyDropped(allMemes, cooldownHours);
    if (availableMemes.length === 0) {
      logger.warn("[JOB] No available memes after filtering");
      return;
    }

    // Random selection
    const selectedMeme = availableMemes[Math.floor(Math.random() * availableMemes.length)];
    logger.info(`[JOB] Selected meme: ${selectedMeme.filename} (${selectedMeme.type}, ${(selectedMeme.size / 1024).toFixed(1)}KB)`);

    // Send to all configured channels
    const successfulChannels = [];

    for (const channelId of config.channelIds) {
      try {
        const channel = await client.channels.fetch(channelId);

        if (!channel) {
          logger.warn(`[JOB] Channel ${channelId} not found`);
          continue;
        }

        // Create attachment from local file
        const attachment = new AttachmentBuilder(selectedMeme.path, {
          name: selectedMeme.filename,
        });

        // Generate fun caption based on meme type
        const captions = selectedMeme.type === "video"
          ? ["🎬 Check this out!", "🎥 Meme time!", "📹 Found this gem!"]
          : ["😂 Meme drop!", "🎭 Fresh meme!", "✨ Here's one for you!"];
        const caption = captions[Math.floor(Math.random() * captions.length)];

        await channel.send({
          content: caption,
          files: [attachment],
        });

        successfulChannels.push(channelId);
        logger.info(`[JOB] Posted meme to channel ${channel.name || channelId}`);
      } catch (error) {
        logger.error(`[JOB] Failed to post meme to channel ${channelId}`, {
          error: error.message,
        });
      }
    }

    // Record the drop if at least one channel succeeded
    if (successfulChannels.length > 0) {
      await recordDroppedMeme(selectedMeme, successfulChannels);
    }

    logger.info(`[JOB] autoMemeDrop completed - sent to ${successfulChannels.length}/${config.channelIds.length} channels`);
  } catch (error) {
    logger.error("[JOB] autoMemeDrop failed", { error: error.message });
  }
}
