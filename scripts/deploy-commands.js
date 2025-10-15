// /scripts/deploy-commands.js
// English-only code & comments.
// Deploy slash commands to a single dev guild (safer & faster).
// Reads all /src/commands/*.js modules that export { data, execute } and registers them.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import { CONFIG } from '../src/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  if (!CONFIG.DISCORD_TOKEN) throw new Error('Missing DISCORD_TOKEN');
  if (!CONFIG.APP_ID) throw new Error('Missing APP_ID');
  if (!CONFIG.GUILD_ID_DEV) throw new Error('Missing GUILD_ID_DEV');

  const commandsDir = path.resolve(__dirname, '..', 'src', 'commands');
  const files = fs.readdirSync(commandsDir).filter((f) => f.endsWith('.js'));

  const body = [];
  for (const file of files) {
    const modPath = path.join(commandsDir, file);
    const mod = await import(modPath);
    if (mod?.data?.toJSON && typeof mod?.execute === 'function') {
      const json = mod.data.toJSON();
      body.push(json);
      console.log(`- queued: ${json.name} (${file})`);
    }
  }

  if (body.length === 0) {
    console.warn('[WARN] No commands found under /src/commands.');
    return;
  }

  const rest = new REST({ version: '10' }).setToken(CONFIG.DISCORD_TOKEN);

  console.log(`[JOB] Deploying ${body.length} commands to guild ${CONFIG.GUILD_ID_DEV}...`);
  const route = Routes.applicationGuildCommands(CONFIG.APP_ID, CONFIG.GUILD_ID_DEV);

  try {
    const res = await rest.put(route, { body });
    console.log('[JOB] Deployment OK. Count =', Array.isArray(res) ? res.length : 'unknown');
  } catch (e) {
    console.error('[ERR] deploy-commands failed:', e?.rawError || e);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error('[ERR] Fatal in deploy-commands:', e);
    process.exit(1);
  });
}
