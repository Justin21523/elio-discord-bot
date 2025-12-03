/**
 * Export Interactions Job
 * Weekly export of user interactions to JSONL training data format
 * Supports continuous learning and concept drift mitigation
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { getUnexportedInteractions, getQualityInteractions, markExported, getStats } from '../db/models/interaction.js';
import { logger } from '../util/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Output directory for exported training data
const EXPORT_DIR = path.join(__dirname, '../../data/training/user-interactions');

/**
 * Export interactions to JSONL format for ML training
 * @param {Object} options
 * @param {boolean} options.qualityOnly - Only export high-quality (positive feedback) interactions
 * @param {number} options.limit - Maximum interactions to export per run
 * @param {boolean} options.dryRun - Don't mark as exported (for testing)
 */
async function exportInteractionsToJSONL({ qualityOnly = false, limit = 1000, dryRun = false } = {}) {
  logger.info('[ExportInteractions] Starting export job', { qualityOnly, limit, dryRun });

  try {
    // Fetch interactions
    const result = qualityOnly
      ? await getQualityInteractions({ limit })
      : await getUnexportedInteractions({ limit });

    if (!result.ok || !result.data || result.data.length === 0) {
      logger.info('[ExportInteractions] No interactions to export');
      return { ok: true, data: { exported: 0 } };
    }

    const interactions = result.data;
    logger.info(`[ExportInteractions] Found ${interactions.length} interactions to export`);

    // Group by persona
    const byPersona = {};
    for (const interaction of interactions) {
      const persona = interaction.persona || 'unknown';
      if (!byPersona[persona]) byPersona[persona] = [];
      byPersona[persona].push(interaction);
    }

    // Ensure export directory exists
    await fs.mkdir(EXPORT_DIR, { recursive: true });

    // Generate timestamp for filename
    const timestamp = new Date().toISOString().split('T')[0];
    const filename = `user-interactions-${timestamp}.jsonl`;
    const filepath = path.join(EXPORT_DIR, filename);

    // Convert to JSONL format
    const jsonlLines = [];
    for (const interaction of interactions) {
      const entry = {
        messages: [
          {
            role: 'system',
            content: `You are ${interaction.persona} from Pixar's Elio film. Speak in first person.`
          },
          {
            role: 'user',
            content: interaction.userMessage
          },
          {
            role: 'assistant',
            content: interaction.botResponse
          }
        ],
        metadata: {
          character: interaction.persona,
          scenario: 'user_interaction',
          source: 'discord_live',
          responseSource: interaction.responseSource,
          feedback: {
            thumbsUp: interaction.feedback?.thumbsUp || false,
            thumbsDown: interaction.feedback?.thumbsDown || false,
            rating: interaction.feedback?.rating || null
          },
          timestamp: interaction.timestamp,
          validated_first_person: true
        }
      };
      jsonlLines.push(JSON.stringify(entry));
    }

    // Write to file
    await fs.writeFile(filepath, jsonlLines.join('\n') + '\n');
    logger.info(`[ExportInteractions] Wrote ${jsonlLines.length} entries to ${filename}`);

    // Mark as exported (unless dry run)
    if (!dryRun) {
      const ids = interactions.map(i => i._id.toString());
      await markExported(ids);
      logger.info(`[ExportInteractions] Marked ${ids.length} interactions as exported`);
    }

    // Log statistics
    const statsResult = await getStats();
    if (statsResult.ok) {
      logger.info('[ExportInteractions] Current statistics:', statsResult.data);
    }

    return {
      ok: true,
      data: {
        exported: interactions.length,
        filename,
        byPersona: Object.fromEntries(
          Object.entries(byPersona).map(([k, v]) => [k, v.length])
        )
      }
    };
  } catch (error) {
    logger.error('[ExportInteractions] Export failed:', error.message);
    return { ok: false, error: error.message };
  }
}

/**
 * Get export statistics
 */
async function getExportStats() {
  try {
    // Get interaction stats
    const statsResult = await getStats();

    // Count exported files
    let exportedFiles = [];
    try {
      const files = await fs.readdir(EXPORT_DIR);
      exportedFiles = files.filter(f => f.endsWith('.jsonl'));
    } catch {
      // Directory might not exist yet
    }

    return {
      ok: true,
      data: {
        interactionStats: statsResult.ok ? statsResult.data : [],
        exportedFiles: exportedFiles.length,
        exportDir: EXPORT_DIR
      }
    };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

/**
 * Cron job handler - called daily
 * Schedule: Every day at 4:00 AM
 */
async function dailyExportJob() {
  logger.info('[ExportInteractions] Running daily export job');

  const result = await exportInteractionsToJSONL({
    qualityOnly: false, // Export all non-negative interactions
    limit: 5000,
    dryRun: false
  });

  if (result.ok) {
    logger.info('[ExportInteractions] Daily export completed:', result.data);
  } else {
    logger.error('[ExportInteractions] Daily export failed:', result.error);
  }

  return result;
}

// Alias for backwards compatibility
const weeklyExportJob = dailyExportJob;

export {
  exportInteractionsToJSONL,
  getExportStats,
  dailyExportJob,
  weeklyExportJob
};
