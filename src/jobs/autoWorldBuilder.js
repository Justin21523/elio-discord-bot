/**
 * autoWorldBuilder.js
 * AI autonomously generates and archives new Communiverse lore (characters, locations, events)
 * Uses Agent + RAG + LLM + VLM to create rich, consistent world-building content
 */

import { EmbedBuilder } from "discord.js";
import { logger } from "../util/logger.js";
import { getCollection } from "../db/mongo.js";

/**
 * Generate new lore entries and add them to RAG knowledge base
 */
export async function run(client) {
  try {
    logger.info("[JOB] autoWorldBuilder started");

    const config = await getAutoWorldBuilderConfig();

    if (!config.enabled) {
      logger.info("[JOB] autoWorldBuilder is disabled");
      return;
    }

    const { default: ai } = await import("../services/ai/index.js");
    const { default: webhooks } = await import("../services/webhooks.js");

    // Decide what type of lore to generate
    const loreTypes = [
      "character",
      "location",
      "technology",
      "species",
      "event",
      "tradition",
    ];
    const selectedType = loreTypes[Math.floor(Math.random() * loreTypes.length)];

    // Use RAG to get existing lore for consistency
    const existingLoreResult = await ai.rag.search({
      query: `Communiverse ${selectedType} lore existing`,
      topK: 10,
    });

    let existingLore = "";
    if (existingLoreResult.ok && existingLoreResult.data.hits?.length > 0) {
      existingLore = existingLoreResult.data.hits
        .map((h) => h.chunk)
        .slice(0, 5)
        .join("\n");
    }

    // Use Agent to design the new lore entry
    const loreDesignTask = {
      goal: `Design a new ${selectedType} for the Communiverse that fits the established lore`,
      context: {
        type: selectedType,
        existingLore: existingLore,
        constraints: [
          "Must be family-friendly",
          "Must fit sci-fi/space theme",
          "Must be consistent with existing lore",
          "Should be interesting and memorable",
        ],
      },
    };

    const designResult = await ai.agent.orchestrate(loreDesignTask);

    if (!designResult.ok) {
      logger.warn("[JOB] Agent failed to design lore");
      return;
    }

    // Generate detailed lore entry using LLM
    const lorePrompt = `Create a detailed lore entry for the Communiverse.

Type: ${selectedType}
${designResult.data.concept ? `Concept: ${JSON.stringify(designResult.data.concept)}` : ""}

Existing lore for context:
${existingLore || "The Communiverse is a vast universe where different alien species coexist peacefully."}

Write a comprehensive lore entry (200-300 words) that includes:
1. Name and basic description
2. Key characteristics or features
3. Relation to existing characters/locations
4. Interesting details that add depth

Style: Engaging, imaginative, suitable for all ages`;

    const loreResult = await ai.llm.generate(lorePrompt, {
      maxTokens: 400,
      temperature: 0.8,
    });

    if (!loreResult.ok) {
      logger.warn("[JOB] Failed to generate lore text");
      return;
    }

    const loreText = loreResult.data.text;

    // Extract name from generated lore
    const nameMatch = loreText.match(/(?:Name|Called):\s*([^\n]+)/i) ||
      loreText.match(/^([^.!?]+)/);
    const loreName = nameMatch ? nameMatch[1].trim() : `New ${selectedType}`;

    // Check if lore passes moderation
    const moderationResult = await ai.moderation.check(loreText);

    if (!moderationResult.ok || !moderationResult.data.safe) {
      logger.warn("[JOB] Generated lore failed moderation");
      return;
    }

    // Store in lore database
    const loreCol = getCollection("world_lore");
    const loreEntry = {
      type: selectedType,
      name: loreName,
      description: loreText,
      aiGenerated: true,
      createdAt: new Date(),
      approved: false, // Can be manually reviewed
    };

    const insertResult = await loreCol.insertOne(loreEntry);

    // Add to RAG knowledge base for future reference
    const ragInsertResult = await ai.rag.insert({
      text: `${selectedType.toUpperCase()}: ${loreName}\n\n${loreText}`,
      source: `auto_generated_lore_${selectedType}`,
      metadata: {
        type: selectedType,
        name: loreName,
        auto_generated: true,
        created: new Date().toISOString(),
      },
    });

    if (ragInsertResult.ok) {
      logger.info(`[JOB] Added lore to RAG: ${loreName}`);
    }

    // Optionally generate an image for visual lore (locations, characters, species)
    let imageUrl = null;
    if (["character", "location", "species"].includes(selectedType)) {
      // Use web search to find relevant imagery
      const imageSearchQuery = `${loreName} ${selectedType} sci-fi space concept art`;
      const searchResult = await ai.web.search(imageSearchQuery, 10);

      if (searchResult.ok && searchResult.data.results?.length > 0) {
        const imageResults = searchResult.data.results.filter(
          (r) => r.image_url || r.url?.match(/\.(jpg|jpeg|png|gif|webp)$/i)
        );

        if (imageResults.length > 0) {
          const selectedImage = imageResults[0];
          imageUrl = selectedImage.image_url || selectedImage.url;

          // Use VLM to verify image relevance
          const captionResult = await ai.vlm.describe({
            imageUrl,
            maxTokens: 100,
          });

          if (captionResult.ok) {
            logger.info(`[JOB] Found image for ${loreName}: ${captionResult.data.caption}`);
          }
        }
      }
    }

    // Update lore entry with image if found
    if (imageUrl) {
      await loreCol.updateOne(
        { _id: insertResult.insertedId },
        { $set: { imageUrl } }
      );
    }

    // Post to configured channels
    const personas = await getCollection("personas").find({}).toArray();
    const curator = personas[Math.floor(Math.random() * personas.length)];

    for (const channelId of config.channelIds) {
      try {
        const channel = await client.channels.fetch(channelId);

        if (!channel?.isTextBased()) {
          logger.warn(`[JOB] Channel ${channelId} not found or not text-based`);
          continue;
        }

        const embed = new EmbedBuilder()
          .setColor(curator.color || "#5865F2")
          .setAuthor({
            name: `${curator.name} - Lore Keeper`,
            iconURL: curator.avatar,
          })
          .setTitle(`🌌 New ${selectedType.charAt(0).toUpperCase() + selectedType.slice(1)}`)
          .setDescription(`**${loreName}**\n\n${loreText}`)
          .setFooter({
            text: "AI-generated lore • React to approve!",
          })
          .setTimestamp();

        if (imageUrl) {
          embed.setImage(imageUrl);
        }

        const introTexts = [
          `I've discovered something fascinating in the Communiverse archives!`,
          `Let me share some newly uncovered lore...`,
          `The Communiverse just got more interesting!`,
          `I found this interesting entry in the historical database:`,
        ];

        const intro = introTexts[Math.floor(Math.random() * introTexts.length)];

        await webhooks.sendAsPersona(
          channel,
          {
            name: curator.name,
            avatar: curator.avatar,
            color: curator.color,
          },
          { content: intro, embeds: [embed] }
        );

        logger.info(`[JOB] Posted lore ${loreName} to ${channel.name}`);
      } catch (error) {
        logger.error(`[JOB] Failed to post to channel ${channelId}`, {
          error: error.message,
        });
      }
    }

    logger.info("[JOB] autoWorldBuilder completed");
  } catch (error) {
    logger.error("[JOB] autoWorldBuilder failed", { error: error.message });
  }
}

/**
 * Get auto world builder configuration
 */
async function getAutoWorldBuilderConfig() {
  try {
    const configCol = getCollection("bot_config");
    let config = await configCol.findOne({ key: "auto_world_builder" });

    if (!config) {
      config = {
        key: "auto_world_builder",
        enabled: true,
        channelIds: [],
        frequency: "0 0 * * *", // Daily at midnight
        loreTypes: ["character", "location", "technology", "species", "event", "tradition"],
        updatedAt: new Date(),
      };

      await configCol.insertOne(config);
    }

    return config;
  } catch (error) {
    logger.error("[JOB] Failed to get auto world builder config", {
      error: error.message,
    });
    return { enabled: false, channelIds: [] };
  }
}

/**
 * Update auto world builder configuration
 */
export async function updateConfig(updates) {
  try {
    const configCol = getCollection("bot_config");

    await configCol.updateOne(
      { key: "auto_world_builder" },
      {
        $set: {
          ...updates,
          updatedAt: new Date(),
        },
      },
      { upsert: true }
    );

    logger.info("[JOB] Auto world builder config updated");
  } catch (error) {
    logger.error("[JOB] Failed to update auto world builder config", {
      error: error.message,
    });
  }
}
