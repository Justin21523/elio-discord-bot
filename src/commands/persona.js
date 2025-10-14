// Slash command: /persona "text" [name] [style]
// English-only.

import { SlashCommandBuilder } from 'discord.js';
import { compose } from '../services/ai/persona.js';
import { scan } from '../services/ai/moderation.js';
import { incCounter, observeHistogram } from '../util/metrics.js';
import { logError } from '../util/logger.js';

export const data = new SlashCommandBuilder()
  .setName('persona')
  .setDescription('Reply in a configured persona.')
  .addStringOption(o => o.setName('text').setDescription('User text').setRequired(true))
  .addStringOption(o => o.setName('name').setDescription('Persona name (default Elio)'))
  .addStringOption(o => o.setName('style').setDescription('Persona style (default playful, supportive)'))
  .addIntegerOption(o => o.setName('max').setDescription('Max length (default 180)'));

export async function execute(interaction) {
  const t0 = Date.now();
  await interaction.deferReply({ ephemeral: false });

  const text = interaction.options.getString('text', true);
  const name = interaction.options.getString('name') ?? 'Elio';
  const style = interaction.options.getString('style') ?? 'playful, supportive';
  const max = interaction.options.getInteger('max') ?? 180;

  // pre-scan
  const m = await scan(text);
  if (!m.ok) {
    logError('[CMD]', { guildId: interaction.guildId, channelId: interaction.channelId, userId: interaction.user.id, command: 'persona', error: m.error });
    incCounter('commands_total', { command: 'persona', outcome: 'error' });
    await interaction.editReply('❌ Moderation unavailable.');
    return;
  }
  if (m.data.blocked) {
    incCounter('commands_total', { command: 'persona', outcome: 'blocked' });
    await interaction.editReply('⚠️ Your text was flagged by moderation.');
    return;
  }

  const res = await compose(text, { name, style }, max);
  if (!res.ok) {
    incCounter('commands_total', { command: 'persona', outcome: 'error' });
    await interaction.editReply(`❌ Persona error: ${res.error.message}`);
  } else {
    incCounter('commands_total', { command: 'persona', outcome: 'ok' });
    await interaction.editReply(res.data.reply ?? '(no reply)');
  }

  observeHistogram('command_latency_seconds', (Date.now() - t0) / 1000, { command: 'persona' });
}
