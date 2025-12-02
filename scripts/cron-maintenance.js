/**
 * Simple maintenance scheduler using node-cron.
 * Runs metrics daily, leaderboard reset weekly, achievements reset weekly.
 * Usage: node scripts/cron-maintenance.js
 */
import cron from "node-cron";
import { spawn } from "child_process";

function run(cmd, args) {
  const p = spawn(cmd, args, { stdio: "inherit" });
  p.on("close", (code) => {
    if (code !== 0) {
      console.error(`[CRON] ${cmd} ${args.join(" ")} exited with code ${code}`);
    }
  });
}

// Metrics daily at 02:00
cron.schedule("0 2 * * *", () => run("node", ["scripts/compute-user-metrics.js"]));

// Leaderboard reset weekly Sunday 03:00
cron.schedule("0 3 * * 0", () => run("node", ["scripts/reset-leaderboards.js"]));

// Achievements refresh weekly Sunday 03:15
cron.schedule("15 3 * * 0", () => run("node", ["scripts/reset-achievements.js"]));

console.log("[CRON] Maintenance scheduler started.");
