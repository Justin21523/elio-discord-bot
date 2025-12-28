/**
 * scripts/copy-build-assets.js
 * Copy runtime assets needed by the compiled `dist/` output.
 * - `data/` is referenced via relative paths inside many modules.
 * All code/comments in English only.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, "..");
const distDir = path.join(projectRoot, "dist");
const dataSrcDir = path.join(projectRoot, "data");
const dataDestDir = path.join(distDir, "data");

async function pathExists(filePath) {
  try {
    await fs.lstat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  await fs.mkdir(distDir, { recursive: true });

  // In some Docker builds we intentionally exclude `data/` from the build context
  // (see `.dockerignore`) and mount it at runtime instead.
  if (!(await pathExists(dataSrcDir))) {
    console.warn("[BUILD] data/ not found; skipping asset copy.");
    return;
  }

  // Keep the copy idempotent to avoid stale assets.
  await fs.rm(dataDestDir, { recursive: true, force: true });
  await fs.cp(dataSrcDir, dataDestDir, { recursive: true });
}

main().catch((error) => {
  console.error("[BUILD] Failed to copy build assets:", error);
  process.exitCode = 1;
});
