// src/services/ai/finetune.js
// ============================================================================
// Fine-tuning Service - Model training and management
// ============================================================================

import { post, get } from "./client.js";
import { logger } from "../../util/logger.js";

/**
 * Start a fine-tuning job
 * @param {object} params
 * @param {string} params.jobName - Job name
 * @param {string} params.baseModel - Base model identifier
 * @param {string} params.datasetPath - Path to training dataset
 * @param {string} params.taskType - Task type (sft, dpo, persona, story, dialogue)
 * @param {object} [params.hyperparameters] - Training hyperparameters
 * @param {string} [params.outputDir] - Output directory
 * @param {number} [params.validationSplit] - Validation split ratio (0.0-0.5)
 * @param {boolean} [params.earlyStopping] - Enable early stopping
 * @returns {Promise<{ok: true, data: object} | {ok: false, error: object}>}
 */
export async function startTraining(params) {
  const {
    jobName,
    baseModel,
    datasetPath,
    taskType,
    hyperparameters = {},
    outputDir,
    validationSplit = 0.1,
    earlyStopping = true,
  } = params;

  try {
    logger.info("[FINETUNE] Starting training job", {
      jobName,
      baseModel,
      taskType,
    });

    const result = await post("/finetune/start-training", {
      job_name: jobName,
      base_model: baseModel,
      dataset_path: datasetPath,
      task_type: taskType,
      hyperparameters,
      output_dir: outputDir,
      validation_split: validationSplit,
      early_stopping: earlyStopping,
    });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: {
        jobId: result.data.job_id,
        jobName: result.data.job_name,
        status: result.data.status,
        config: result.data.config,
      },
    };
  } catch (error) {
    logger.error("[FINETUNE] Start training error", {
      error: error.message,
      stack: error.stack,
    });

    return {
      ok: false,
      error: {
        code: "AI_MODEL_ERROR",
        message: "Failed to start training job",
        details: { cause: error.message },
      },
    };
  }
}

/**
 * Get training job status
 * @param {string} jobId - Job ID
 * @returns {Promise<{ok: true, data: object} | {ok: false, error: object}>}
 */
export async function getJobStatus(jobId) {
  try {
    logger.info("[FINETUNE] Getting job status", { jobId });

    const result = await post("/finetune/job-status", {
      job_id: jobId,
    });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: {
        jobId: result.data.job_id,
        jobName: result.data.job_name,
        status: result.data.status,
        progress: result.data.progress,
        currentStep: result.data.current_step,
        totalSteps: result.data.total_steps,
        metrics: result.data.metrics,
        outputModel: result.data.output_model,
        error: result.data.error,
      },
    };
  } catch (error) {
    logger.error("[FINETUNE] Get job status error", {
      error: error.message,
      stack: error.stack,
    });

    return {
      ok: false,
      error: {
        code: "AI_MODEL_ERROR",
        message: "Failed to get job status",
        details: { cause: error.message },
      },
    };
  }
}

/**
 * List all training jobs
 * @param {object} [options]
 * @param {string} [options.status] - Filter by status
 * @param {number} [options.limit] - Limit results
 * @returns {Promise<{ok: true, data: object} | {ok: false, error: object}>}
 */
export async function listJobs(options = {}) {
  const { status, limit = 50 } = options;

  try {
    logger.info("[FINETUNE] Listing jobs", { status, limit });

    const result = await get("/finetune/list-jobs", {
      status,
      limit,
    });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: {
        jobs: result.data.jobs,
        total: result.data.total,
      },
    };
  } catch (error) {
    logger.error("[FINETUNE] List jobs error", {
      error: error.message,
      stack: error.stack,
    });

    return {
      ok: false,
      error: {
        code: "AI_MODEL_ERROR",
        message: "Failed to list jobs",
        details: { cause: error.message },
      },
    };
  }
}

/**
 * Cancel a running training job
 * @param {string} jobId - Job ID
 * @returns {Promise<{ok: true, data: object} | {ok: false, error: object}>}
 */
export async function cancelJob(jobId) {
  try {
    logger.info("[FINETUNE] Cancelling job", { jobId });

    const result = await post("/finetune/cancel-job", {
      job_id: jobId,
    });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: {
        jobId: result.data.job_id,
        status: result.data.status,
        message: result.data.message,
      },
    };
  } catch (error) {
    logger.error("[FINETUNE] Cancel job error", {
      error: error.message,
      stack: error.stack,
    });

    return {
      ok: false,
      error: {
        code: "AI_MODEL_ERROR",
        message: "Failed to cancel job",
        details: { cause: error.message },
      },
    };
  }
}

/**
 * Run hyperparameter tuning
 * @param {object} params
 * @param {string} params.baseModel - Base model
 * @param {string} params.datasetPath - Dataset path
 * @param {string} params.taskType - Task type
 * @param {object} params.searchSpace - Hyperparameter search space
 * @param {number} [params.numTrials] - Number of trials (1-100)
 * @param {string} [params.optimizationMetric] - Metric to optimize
 * @returns {Promise<{ok: true, data: object} | {ok: false, error: object}>}
 */
export async function hyperparameterTuning(params) {
  const {
    baseModel,
    datasetPath,
    taskType,
    searchSpace,
    numTrials = 10,
    optimizationMetric = "loss",
  } = params;

  try {
    logger.info("[FINETUNE] Starting hyperparameter tuning", {
      baseModel,
      taskType,
      numTrials,
    });

    const result = await post("/finetune/hyperparameter-tuning", {
      base_model: baseModel,
      dataset_path: datasetPath,
      task_type: taskType,
      search_space: searchSpace,
      num_trials: numTrials,
      optimization_metric: optimizationMetric,
    });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: {
        tuningId: result.data.tuning_id,
        status: result.data.status,
        numTrials: result.data.num_trials,
        bestParams: result.data.best_params,
        bestScore: result.data.best_score,
        optimizationMetric: result.data.optimization_metric,
      },
    };
  } catch (error) {
    logger.error("[FINETUNE] Hyperparameter tuning error", {
      error: error.message,
      stack: error.stack,
    });

    return {
      ok: false,
      error: {
        code: "AI_MODEL_ERROR",
        message: "Hyperparameter tuning failed",
        details: { cause: error.message },
      },
    };
  }
}

/**
 * Register a trained model version
 * @param {object} params
 * @param {string} params.modelPath - Path to model
 * @param {string} params.versionName - Version name
 * @param {object} [params.metadata] - Additional metadata
 * @param {string} [params.description] - Model description
 * @returns {Promise<{ok: true, data: object} | {ok: false, error: object}>}
 */
export async function registerModel(params) {
  const {
    modelPath,
    versionName,
    metadata,
    description,
  } = params;

  try {
    logger.info("[FINETUNE] Registering model", {
      versionName,
      modelPath,
    });

    const result = await post("/finetune/register-model", {
      model_path: modelPath,
      version_name: versionName,
      metadata,
      description,
    });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: {
        versionName: result.data.version_name,
        modelPath: result.data.model_path,
        registeredAt: result.data.registered_at,
        metadata: result.data.metadata,
        description: result.data.description,
        status: result.data.status,
      },
    };
  } catch (error) {
    logger.error("[FINETUNE] Register model error", {
      error: error.message,
      stack: error.stack,
    });

    return {
      ok: false,
      error: {
        code: "AI_MODEL_ERROR",
        message: "Model registration failed",
        details: { cause: error.message },
      },
    };
  }
}

/**
 * Prepare dataset for training
 * @param {object} params
 * @param {string} params.rawDataPath - Raw data path
 * @param {string} params.outputPath - Output path
 * @param {string} params.formatType - Format type (sft, dpo, chat, instruction)
 * @param {number} [params.validationSplit] - Validation split ratio
 * @param {number} [params.maxLength] - Max sequence length
 * @param {string} [params.personaName] - Persona name (for persona training)
 * @returns {Promise<{ok: true, data: object} | {ok: false, error: object}>}
 */
export async function prepareDataset(params) {
  const {
    rawDataPath,
    outputPath,
    formatType,
    validationSplit = 0.1,
    maxLength = 2048,
    personaName,
  } = params;

  try {
    logger.info("[FINETUNE] Preparing dataset", {
      formatType,
      rawDataPath,
      outputPath,
    });

    const result = await post("/finetune/prepare-dataset", {
      raw_data_path: rawDataPath,
      output_path: outputPath,
      format_type: formatType,
      validation_split: validationSplit,
      max_length: maxLength,
      persona_name: personaName,
    });

    if (!result.ok) {
      return result;
    }

    return {
      ok: true,
      data: {
        outputPath: result.data.output_path,
        formatType: result.data.format_type,
        trainSamples: result.data.train_samples,
        valSamples: result.data.val_samples,
        maxLength: result.data.max_length,
        personaName: result.data.persona_name,
      },
    };
  } catch (error) {
    logger.error("[FINETUNE] Prepare dataset error", {
      error: error.message,
      stack: error.stack,
    });

    return {
      ok: false,
      error: {
        code: "AI_MODEL_ERROR",
        message: "Dataset preparation failed",
        details: { cause: error.message },
      },
    };
  }
}
