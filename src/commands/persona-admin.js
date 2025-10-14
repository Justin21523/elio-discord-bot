// /persona-admin get|set
// English-only.

import { SlashCommandBuilder } from 'discord.js';
import * as personas from '../services/persona.js';
import { observeHistogram } from '../util/metrics.js';
import { logError } from '../util/logger.js';

export const data = new SlashCommandBuilder()
  .setName('persona-admin')
  .setDescription('Get or set persona config for this guild.')
  .addSubcommand(sc => sc.setName('get').setDescription('Show current persona config.'))
  .addSubcommand(sc =>
    sc.setName('set')
      .setDescription('Update persona config.')
      .addStringOption(o => o.setName('name').setDescription('Persona name'))
      .addStringOption(o => o.setName('style').setDescription('Style, e.g., "gentle, playful"'))
      .addBooleanOption(o => o.setName('memory').setDescription('Enable memory (summary only)'))
      .addBooleanOption(o => o.setName('triggers').setDescription('Enable keyword triggers')));

export async function execute(interaction) {
  const t0 = Date.now();
  await interaction.deferReply({ ephemeral: true });
  const guildId = interaction.guildId;

  try {
    const sub = interaction.options.getSubcommand(true);
    if (sub === 'get') {
      const r = await personas.getConfig(guildId);
      if (!r.ok) return await interaction.editReply(`❌ ${r.error.message}`);
      const c = r.data;
      await interaction.editReply(`**Name:** ${c.name}\n**Style:** ${c.style}\n**Memory:** ${c.memoryOptIn}\n**Triggers:** ${c.keywordTriggersEnabled}`);
      return;
    }

    if (sub === 'set') {
      const patch = {};
      const name = interaction.options.getString('name');
      const style = interaction.options.getString('style');
      const memory = interaction.options.getBoolean('memory');
      const triggers = interaction.options.getBoolean('triggers');
      if (name) patch.name = name;
      if (style) patch.style = style;
      if (typeof memory === 'boolean') patch.memoryOptIn = memory;
      if (typeof triggers === 'boolean') patch.keywordTriggersEnabled = triggers;

      const r = await personas.setConfig(guildId, patch);
      await interaction.editReply(r.ok ? '✅ Persona updated.' : `❌ ${r.error.message}`);
      return;
    }
  } catch (e) {
    logError('[CMD]', { command: 'persona-admin', error: String(e) });
    await interaction.editReply('❌ Persona-admin failed.');
  } finally {
    observeHistogram('command_latency_seconds', (Date.now() - t0) / 1000, { command: 'persona-admin' });
  }
}
