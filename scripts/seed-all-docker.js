/**
 * scripts/seed-all-docker.js
 * 在 Docker 容器内运行所有 seed 脚本
 * 使用 mongo:27017 (Docker internal hostname)
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 使用 Docker 内部的 MongoDB 主机名
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://dev:devpass@mongo:27017/?authSource=admin';

const scripts = [
  'seed-personas.js',    // Personas 和 Scenarios
  'seed-greetings.js',   // Greetings
  'seed-media.js',       // Media
  'seed-points.js',      // Test Points
];

async function runScript(scriptName) {
  return new Promise((resolve, reject) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🌱 Running: ${scriptName}`);
    console.log('='.repeat(60));

    const scriptPath = join(__dirname, scriptName);
    const child = spawn('node', [scriptPath], {
      env: {
        ...process.env,
        MONGODB_URI,
      },
      stdio: 'inherit',
      shell: false,
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ ${scriptName} completed`);
        resolve();
      } else {
        console.error(`❌ ${scriptName} failed (exit code: ${code})`);
        reject(new Error(`${scriptName} failed with code ${code}`));
      }
    });

    child.on('error', (err) => {
      console.error(`❌ ${scriptName} error:`, err);
      reject(err);
    });
  });
}

async function main() {
  console.log('\n🚀 Starting seed process in Docker...\n');
  console.log(`📍 MongoDB URI: ${MONGODB_URI}`);
  console.log(`📝 Running ${scripts.length} scripts\n`);

  let successCount = 0;
  let failCount = 0;

  for (const script of scripts) {
    try {
      await runScript(script);
      successCount++;
    } catch (err) {
      console.error(`\n⚠️  Skipping ${script}:`, err.message);
      failCount++;
      // Continue with other scripts
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 Seed Summary');
  console.log('='.repeat(60));
  console.log(`✅ Success: ${successCount}/${scripts.length}`);
  console.log(`❌ Failed: ${failCount}/${scripts.length}`);

  if (failCount === 0) {
    console.log('\n🎉 All data seeded successfully!');
    console.log('\n📋 Next steps:');
    console.log('   1. Test Discord commands: /persona list');
    console.log('   2. View logs: docker compose logs -f bot');
    console.log('   3. Check DOCKER_COMPLETE_GUIDE.md for testing');
  } else {
    console.log('\n⚠️  Some scripts failed, but other data was seeded.');
    console.log('   Check error messages above for details.');
  }

  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('\n❌ Seed process failed:', err);
  process.exit(1);
});
