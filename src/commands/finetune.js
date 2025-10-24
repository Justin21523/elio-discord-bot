// src/commands/finetune.js
// ============================================================================
// Finetuning Commands - Model training and management
// ============================================================================

import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import {
  startTraining,
  getJobStatus,
  listJobs,
  cancelJob,
  prepareDataset,
} from "../services/ai/finetune.js";
import { logger } from "../util/logger.js";
import { sendErrorReply, sendSuccessReply } from "../util/replies.js";
import { incrementCounter, observeHistogram } from "../util/metrics.js";

export const data = new SlashCommandBuilder()
  .setName("finetune")
  .setDescription("Fine-tune AI models with dialogue datasets")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addSubcommand((sub) =>
    sub
      .setName("start")
      .setDescription("Start a fine-tuning job")
      .addStringOption((opt) =>
        opt
          .setName("job_name")
          .setDescription("Name for this training job")
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName("dataset")
          .setDescription("Dataset to use")
          .setRequired(true)
          .addChoices(
            { name: "OpenAssistant OASST1 (84K conversations)", value: "oasst1" },
            { name: "OpenAssistant OASST2 (135K conversations)", value: "oasst2" },
            { name: "UltraChat (1.4M conversations)", value: "ultrachat" },
            { name: "Alpaca (52K instructions)", value: "alpaca" },
            { name: "Alpaca GPT-4 (52K high-quality)", value: "alpaca-gpt4" },
            { name: "BELLE 0.5M CN (Chinese)", value: "belle-0.5m" },
            { name: "BELLE 2M CN (Chinese)", value: "belle-2m" },
            { name: "Firefly 1.1M (Chinese)", value: "firefly" }
          )
      )
      .addStringOption((opt) =>
        opt
          .setName("task_type")
          .setDescription("Type of training task")
          .setRequired(false)
          .addChoices(
            { name: "Supervised Fine-tuning (SFT)", value: "sft" },
            { name: "Dialogue Training", value: "dialogue" },
            { name: "Persona Training", value: "persona" },
            { name: "Story Generation", value: "story" }
          )
      )
      .addIntegerOption((opt) =>
        opt
          .setName("epochs")
          .setDescription("Number of training epochs (1-10)")
          .setRequired(false)
          .setMinValue(1)
          .setMaxValue(10)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("status")
      .setDescription("Check training job status")
      .addStringOption((opt) =>
        opt
          .setName("job_id")
          .setDescription("Job ID to check")
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("list")
      .setDescription("List all training jobs")
      .addStringOption((opt) =>
        opt
          .setName("filter")
          .setDescription("Filter by status")
          .setRequired(false)
          .addChoices(
            { name: "Running", value: "running" },
            { name: "Queued", value: "queued" },
            { name: "Completed", value: "completed" },
            { name: "Failed", value: "failed" },
            { name: "Cancelled", value: "cancelled" }
          )
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("cancel")
      .setDescription("Cancel a running training job")
      .addStringOption((opt) =>
        opt
          .setName("job_id")
          .setDescription("Job ID to cancel")
          .setRequired(true)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("prepare")
      .setDescription("Prepare dataset for training")
      .addStringOption((opt) =>
        opt
          .setName("dataset")
          .setDescription("Dataset to prepare")
          .setRequired(true)
      )
      .addStringOption((opt) =>
        opt
          .setName("format")
          .setDescription("Output format")
          .setRequired(true)
          .addChoices(
            { name: "SFT (Supervised Fine-tuning)", value: "sft" },
            { name: "Chat Format", value: "chat" },
            { name: "Instruction Format", value: "instruction" }
          )
      )
  );

// Dataset path mapping
const DATASET_PATHS = {
  "oasst1": "/mnt/ai_warehouse/datasets/OpenAssistant___oasst1",
  "oasst2": "/mnt/ai_warehouse/datasets/OpenAssistant___oasst2",
  "ultrachat": "/mnt/ai_warehouse/datasets/stingning___ultrachat",
  "alpaca": "/mnt/ai_warehouse/datasets/tatsu-lab___alpaca",
  "alpaca-gpt4": "/mnt/ai_warehouse/datasets/vicgalle___alpaca-gpt4",
  "belle-0.5m": "/mnt/ai_warehouse/datasets/BelleGroup___train_0.5_m_cn",
  "belle-2m": "/mnt/ai_warehouse/datasets/BelleGroup___train_2_m_cn",
  "firefly": "/mnt/ai_warehouse/datasets/YeungNLP___firefly-train-1.1_m",
};

export async function execute(interaction, services) {
  const startTime = Date.now();
  const subcommand = interaction.options.getSubcommand();

  await interaction.deferReply({ ephemeral: true });

  logger.info("[CMD] /finetune command invoked", {
    subcommand,
    guildId: interaction.guildId,
    userId: interaction.user.id,
  });

  incrementCounter("commands_total", { command: "finetune", subcommand });

  try {
    if (subcommand === "start") {
      const jobName = interaction.options.getString("job_name");
      const dataset = interaction.options.getString("dataset");
      const taskType = interaction.options.getString("task_type") || "dialogue";
      const epochs = interaction.options.getInteger("epochs") || 3;

      const datasetPath = DATASET_PATHS[dataset];
      if (!datasetPath) {
        await sendErrorReply(interaction, {
          code: "BAD_REQUEST",
          message: `Unknown dataset: ${dataset}`,
        });
        return;
      }

      // Start training job
      const result = await startTraining({
        jobName,
        baseModel: "deepseek-ai/deepseek-coder-6.7b-base",
        datasetPath,
        taskType,
        hyperparameters: {
          num_train_epochs: epochs,
          per_device_train_batch_size: 4,
          gradient_accumulation_steps: 4,
          learning_rate: 2e-5,
        },
        validationSplit: 0.1,
        earlyStopping: true,
      });

      if (!result.ok) {
        await sendErrorReply(interaction, result.error);
        return;
      }

      await sendSuccessReply(interaction, {
        title: "🚀 Fine-tuning Job Started",
        description: `**Job ID:** ${result.data.jobId}\n**Job Name:** ${result.data.jobName}\n**Status:** ${result.data.status}\n**Dataset:** ${dataset}\n**Task Type:** ${taskType}\n**Epochs:** ${epochs}\n\nUse \`/finetune status job_id:${result.data.jobId}\` to check progress.`,
      });
    } else if (subcommand === "status") {
      const jobId = interaction.options.getString("job_id");

      const result = await getJobStatus(jobId);

      if (!result.ok) {
        await sendErrorReply(interaction, result.error);
        return;
      }

      const { status, progress, currentStep, totalSteps, metrics, error } = result.data;

      let description = `**Job ID:** ${jobId}\n**Status:** ${status}\n`;

      if (status === "running") {
        const progressPercent = (progress * 100).toFixed(1);
        description += `**Progress:** ${progressPercent}% (${currentStep}/${totalSteps} steps)\n`;

        if (metrics && metrics.loss !== undefined) {
          description += `**Loss:** ${metrics.loss.toFixed(4)}\n`;
          description += `**Learning Rate:** ${metrics.learning_rate.toExponential(2)}\n`;
        }
      } else if (status === "completed") {
        description += `**Output Model:** ${result.data.outputModel || "N/A"}\n`;
      } else if (status === "failed") {
        description += `**Error:** ${error || "Unknown error"}\n`;
      }

      await sendSuccessReply(interaction, {
        title: "📊 Training Job Status",
        description,
      });
    } else if (subcommand === "list") {
      const filter = interaction.options.getString("filter");

      const result = await listJobs({
        status: filter,
        limit: 10,
      });

      if (!result.ok) {
        await sendErrorReply(interaction, result.error);
        return;
      }

      const { jobs, total } = result.data;

      if (jobs.length === 0) {
        await sendSuccessReply(interaction, {
          title: "📋 Training Jobs",
          description: "No training jobs found.",
        });
        return;
      }

      let description = `**Total Jobs:** ${total}\n\n`;

      description += jobs
        .slice(0, 10)
        .map((job, i) => {
          const progressPercent = (job.progress * 100).toFixed(0);
          return `${i + 1}. **${job.job_name}** (${job.status})\n   ID: \`${job.job_id}\`\n   Progress: ${progressPercent}%`;
        })
        .join("\n\n");

      await sendSuccessReply(interaction, {
        title: "📋 Training Jobs",
        description,
      });
    } else if (subcommand === "cancel") {
      const jobId = interaction.options.getString("job_id");

      const result = await cancelJob(jobId);

      if (!result.ok) {
        await sendErrorReply(interaction, result.error);
        return;
      }

      await sendSuccessReply(interaction, {
        title: "🛑 Job Cancelled",
        description: `Job **${jobId}** has been cancelled.`,
      });
    } else if (subcommand === "prepare") {
      const dataset = interaction.options.getString("dataset");
      const format = interaction.options.getString("format");

      const result = await prepareDataset({
        rawDataPath: dataset,
        outputPath: `/tmp/prepared_${Date.now()}`,
        formatType: format,
        validationSplit: 0.1,
        maxLength: 2048,
      });

      if (!result.ok) {
        await sendErrorReply(interaction, result.error);
        return;
      }

      await sendSuccessReply(interaction, {
        title: "✅ Dataset Prepared",
        description: `**Format:** ${format}\n**Train Samples:** ${result.data.trainSamples}\n**Val Samples:** ${result.data.valSamples}\n**Output:** ${result.data.outputPath}`,
      });
    }

    const latency = Date.now() - startTime;
    observeHistogram("command_latency_seconds", latency / 1000, {
      command: "finetune",
      subcommand,
    });

    logger.info("[CMD] /finetune command succeeded", {
      subcommand,
      guildId: interaction.guildId,
      latencyMs: latency,
    });
  } catch (error) {
    logger.error("[ERR] /finetune command failed", {
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
