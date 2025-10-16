// src/commands/story.js
// ============================================================================
// Story Commands - AI-powered story generation and management
// ============================================================================

import { SlashCommandBuilder } from "discord.js";
import {
  generate,
  continueStory,
  generateDialogue,
  developCharacter,
  analyzeStory,
} from "../services/ai/story.js";
import { logger } from "../util/logger.js";
import { sendErrorReply, sendSuccessReply } from "../util/replies.js";
import { incrementCounter, observeHistogram } from "../util/metrics.js";

export const data = new SlashCommandBuilder()
  .setName("story")
  .setDescription("AI-powered story generation")
  .addSubcommand((sub) =>
    sub
      .setName("generate")
      .setDescription("Generate a complete story")
      .addStringOption((opt) =>
        opt
          .setName("prompt")
          .setDescription("Story prompt or theme")
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName("genre")
          .setDescription("Story genre")
          .setRequired(false)
          .addChoices(
            { name: "Fantasy", value: "fantasy" },
            { name: "Sci-Fi", value: "scifi" },
            { name: "Mystery", value: "mystery" },
            { name: "Romance", value: "romance" },
            { name: "Horror", value: "horror" },
            { name: "Adventure", value: "adventure" }
          )
      )
      .addStringOption((opt) =>
        opt
          .setName("length")
          .setDescription("Story length")
          .setRequired(false)
          .addChoices(
            { name: "Short", value: "short" },
            { name: "Medium", value: "medium" },
            { name: "Long", value: "long" }
          )
      )
      .addStringOption((opt) =>
        opt
          .setName("setting")
          .setDescription("Story setting")
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("continue")
      .setDescription("Continue an existing story")
      .addStringOption((opt) =>
        opt
          .setName("story")
          .setDescription("Story text so far")
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName("direction")
          .setDescription("Direction to take the story")
          .setRequired(false)
      )
      .addIntegerOption((opt) =>
        opt
          .setName("length")
          .setDescription("Words to generate (100-2000)")
          .setRequired(false)
          .setMinValue(100)
          .setMaxValue(2000)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("dialogue")
      .setDescription("Generate character dialogue")
      .addStringOption((opt) =>
        opt
          .setName("characters")
          .setDescription("Character names (comma-separated, min 2)")
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName("context")
          .setDescription("Dialogue context/scenario")
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName("tone")
          .setDescription("Dialogue tone")
          .setRequired(false)
          .addChoices(
            { name: "Serious", value: "serious" },
            { name: "Humorous", value: "humorous" },
            { name: "Tense", value: "tense" },
            { name: "Casual", value: "casual" }
          )
      )
      .addIntegerOption((opt) =>
        opt
          .setName("turns")
          .setDescription("Number of dialogue exchanges (2-20)")
          .setRequired(false)
          .setMinValue(2)
          .setMaxValue(20)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("character")
      .setDescription("Develop a character profile")
      .addStringOption((opt) =>
        opt
          .setName("name")
          .setDescription("Character name")
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName("aspect")
          .setDescription("What to develop")
          .setRequired(false)
          .addChoices(
            { name: "Personality", value: "personality" },
            { name: "Backstory", value: "backstory" },
            { name: "Motivations", value: "motivations" },
            { name: "Character Arc", value: "arc" }
          )
      )
      .addStringOption((opt) =>
        opt
          .setName("traits")
          .setDescription("Character traits (comma-separated)")
          .setRequired(false)
      )
      .addStringOption((opt) =>
        opt
          .setName("background")
          .setDescription("Character background")
          .setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("analyze")
      .setDescription("Analyze a story")
      .addStringOption((opt) =>
        opt
          .setName("story")
          .setDescription("Story text to analyze")
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName("type")
          .setDescription("Analysis type")
          .setRequired(false)
          .addChoices(
            { name: "Structure", value: "structure" },
            { name: "Themes", value: "themes" },
            { name: "Characters", value: "characters" },
            { name: "Pacing", value: "pacing" }
          )
      )
  );

export async function execute(interaction) {
  const startTime = Date.now();
  const subcommand = interaction.options.getSubcommand();

  await interaction.deferReply();

  logger.info("[CMD] /story command invoked", {
    subcommand,
    guildId: interaction.guildId,
    userId: interaction.user.id,
  });

  incrementCounter("commands_total", { command: "story", subcommand });

  try {
    let result;

    if (subcommand === "generate") {
      const prompt = interaction.options.getString("prompt");
      const genre = interaction.options.getString("genre");
      const length = interaction.options.getString("length") || "medium";
      const setting = interaction.options.getString("setting");

      result = await generate({
        prompt,
        genre,
        length,
        setting,
      });

      if (!result.ok) {
        await sendErrorReply(interaction, result.error);
        return;
      }

      // Split long stories into multiple messages
      const story = result.data.story;
      if (story.length > 4000) {
        await sendSuccessReply(interaction, {
          title: `📖 Generated Story: ${genre || "Story"}`,
          description: story.substring(0, 3900) + "...\n\n_Story truncated. Full version saved._",
          fields: [
            { name: "Words", value: result.data.wordCount.toString(), inline: true },
            { name: "Paragraphs", value: result.data.paragraphCount.toString(), inline: true },
          ],
        });
      } else {
        await sendSuccessReply(interaction, {
          title: `📖 Generated Story: ${genre || "Story"}`,
          description: story,
          fields: [
            { name: "Words", value: result.data.wordCount.toString(), inline: true },
            { name: "Paragraphs", value: result.data.paragraphCount.toString(), inline: true },
          ],
        });
      }
    } else if (subcommand === "continue") {
      const story = interaction.options.getString("story");
      const direction = interaction.options.getString("direction");
      const length = interaction.options.getInteger("length") || 500;

      result = await continueStory({
        existingStory: story,
        direction,
        length,
      });

      if (!result.ok) {
        await sendErrorReply(interaction, result.error);
        return;
      }

      await sendSuccessReply(interaction, {
        title: "📝 Story Continuation",
        description: result.data.continuation,
        fields: [
          { name: "Words Added", value: result.data.continuationWordCount.toString(), inline: true },
        ],
      });
    } else if (subcommand === "dialogue") {
      const charactersStr = interaction.options.getString("characters");
      const characters = charactersStr.split(",").map((c) => c.trim());
      const context = interaction.options.getString("context");
      const tone = interaction.options.getString("tone");
      const turns = interaction.options.getInteger("turns") || 5;

      if (characters.length < 2) {
        await sendErrorReply(interaction, {
          code: "BAD_REQUEST",
          message: "Please provide at least 2 characters (comma-separated)",
        });
        return;
      }

      result = await generateDialogue({
        characters,
        context,
        tone,
        turns,
      });

      if (!result.ok) {
        await sendErrorReply(interaction, result.error);
        return;
      }

      await sendSuccessReply(interaction, {
        title: `💬 Dialogue: ${characters.join(" & ")}`,
        description: result.data.dialogue,
        fields: [
          { name: "Lines", value: result.data.totalLines.toString(), inline: true },
          { name: "Tone", value: tone || "Natural", inline: true },
        ],
      });
    } else if (subcommand === "character") {
      const name = interaction.options.getString("name");
      const aspect = interaction.options.getString("aspect") || "personality";
      const traitsStr = interaction.options.getString("traits");
      const background = interaction.options.getString("background");

      const traits = traitsStr ? traitsStr.split(",").map((t) => t.trim()) : null;

      result = await developCharacter({
        characterName: name,
        traits,
        background,
        developmentAspect: aspect,
      });

      if (!result.ok) {
        await sendErrorReply(interaction, result.error);
        return;
      }

      await sendSuccessReply(interaction, {
        title: `👤 Character Development: ${name}`,
        description: `**${aspect.charAt(0).toUpperCase() + aspect.slice(1)}**\n\n${result.data.development}`,
      });
    } else if (subcommand === "analyze") {
      const story = interaction.options.getString("story");
      const analysisType = interaction.options.getString("type") || "structure";

      result = await analyzeStory({
        storyText: story,
        analysisType,
      });

      if (!result.ok) {
        await sendErrorReply(interaction, result.error);
        return;
      }

      await sendSuccessReply(interaction, {
        title: `🔍 Story Analysis: ${analysisType.charAt(0).toUpperCase() + analysisType.slice(1)}`,
        description: result.data.analysis,
      });
    }

    const latency = Date.now() - startTime;
    observeHistogram("command_latency_seconds", latency / 1000, {
      command: "story",
      subcommand,
    });

    logger.info("[CMD] /story command succeeded", {
      subcommand,
      guildId: interaction.guildId,
      latencyMs: latency,
    });
  } catch (error) {
    logger.error("[ERR] /story command failed", {
      error: error.message,
      stack: error.stack,
      guildId: interaction.guildId,
      userId: interaction.user.id,
    });

    await sendErrorReply(interaction, {
      code: "UNKNOWN",
      message: "An unexpected error occurred",
    });
  }
}
