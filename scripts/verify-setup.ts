/**
 * scripts/verify-setup.ts
 * Basic environment verification for local/dev deployments.
 * All code/comments in English only.
 */

import { MongoClient } from "mongodb";
import "dotenv/config";

type CheckResult = { ok: boolean; name: string; details?: string };

function ok(name: string, details?: string): CheckResult {
  return details ? { ok: true, name, details } : { ok: true, name };
}

function fail(name: string, details?: string): CheckResult {
  return details ? { ok: false, name, details } : { ok: false, name };
}

function hasEnv(key: string): boolean {
  const v = process.env[key];
  return typeof v === "string" && v.trim().length > 0;
}

async function main() {
  const results: CheckResult[] = [];

  // Node version
  results.push(ok("node_version", process.version));

  // Required env vars
  for (const key of ["DISCORD_TOKEN", "APP_ID", "MONGODB_URI"] as const) {
    results.push(hasEnv(key) ? ok(`env:${key}`) : fail(`env:${key}`, "missing"));
  }

  // Mongo connection (optional)
  if (hasEnv("MONGODB_URI")) {
    try {
      const uri = process.env.MONGODB_URI as string;
      const dbName = process.env.DB_NAME || "communiverse_bot";

      const client = new MongoClient(uri, { appName: "communiverse-bot-verify" });
      await client.connect();
      await client.db(dbName).command({ ping: 1 });
      await client.close();
      results.push(ok("mongo_ping"));
    } catch (error) {
      results.push(fail("mongo_ping", error instanceof Error ? error.message : String(error)));
    }
  } else {
    results.push(fail("mongo_ping", "skipped (no MONGODB_URI)"));
  }

  // AI service health (optional)
  if (process.env.AI_ENABLED === "true" && hasEnv("AI_SERVICE_URL")) {
    try {
      const url = new URL("/health", process.env.AI_SERVICE_URL);
      const res = await fetch(url, { method: "GET" });
      results.push(res.ok ? ok("ai_service_health", String(res.status)) : fail("ai_service_health", String(res.status)));
    } catch (error) {
      results.push(fail("ai_service_health", error instanceof Error ? error.message : String(error)));
    }
  } else {
    results.push(ok("ai_service_health", "skipped"));
  }

  const failures = results.filter((r) => !r.ok);
  for (const r of results) {
    const prefix = r.ok ? "[OK]" : "[FAIL]";
    console.log(prefix, r.name, r.details ? `- ${r.details}` : "");
  }

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[ERR] verify failed:", error);
  process.exitCode = 1;
});
