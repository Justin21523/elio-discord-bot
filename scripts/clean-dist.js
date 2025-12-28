/**
 * scripts/clean-dist.js
 * Clean the build output directory before `tsc` runs.
 * All code/comments in English only.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, "..");
const distDir = path.join(projectRoot, "dist");

async function main() {
  await fs.rm(distDir, { recursive: true, force: true });
}

main().catch((error) => {
  console.error("[BUILD] Failed to clean dist:", error);
  process.exitCode = 1;
});
