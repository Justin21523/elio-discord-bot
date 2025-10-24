/**
 * src/jobs/scheduleDataUpdates.js
 * Schedule dynamic data updates to run periodically
 */

import cron from "node-cron";
import { runDynamicDataUpdate } from "./dynamicDataUpdater.js";
import { logger } from "../util/logger.js";

/**
 * Setup scheduled data updates
 * @param {Object} scheduler - Scheduler service (unused, kept for signature compatibility)
 * @param {Object} ai - AI service facade
 */
export function setupDataUpdateSchedule(scheduler, ai) {
  try {
    // Run weekly on Sundays at 3 AM
    const weeklySchedule = "0 3 * * 0";

    cron.schedule(weeklySchedule, async () => {
      logger.info("[SCHEDULE] Running weekly dynamic data update");
      try {
        const result = await runDynamicDataUpdate(ai);
        logger.info("[SCHEDULE] Weekly dynamic data update complete", result);
      } catch (error) {
        logger.error("[SCHEDULE] Weekly dynamic data update failed", {
          error: error.message,
          stack: error.stack
        });
      }
    });

    logger.info("[SCHEDULE] Dynamic data update job scheduled", {
      schedule: weeklySchedule,
      description: "Weekly on Sundays at 3 AM"
    });

    // Optional: Run daily for high-activity servers (commented out by default)
    /*
    const dailySchedule = "0 2 * * *";
    cron.schedule(dailySchedule, async () => {
      logger.info("[SCHEDULE] Running daily dynamic data update");
      try {
        const result = await runDynamicDataUpdate(ai);
        logger.info("[SCHEDULE] Daily dynamic data update complete", result);
      } catch (error) {
        logger.error("[SCHEDULE] Daily dynamic data update failed", {
          error: error.message
        });
      }
    });
    */

    return true;
  } catch (error) {
    logger.error("[SCHEDULE] Failed to setup data update schedule", {
      error: error.message,
      stack: error.stack
    });
    return false;
  }
}

/**
 * Manually trigger data update (for testing or admin command)
 */
export async function triggerManualDataUpdate(ai) {
  logger.info("[MANUAL] Triggering manual data update");
  return await runDynamicDataUpdate(ai);
}

export default {
  setupDataUpdateSchedule,
  triggerManualDataUpdate
};
