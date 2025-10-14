// Slash command: /moderate "text"
// English-only.

import { SlashCommandBuilder } from 'discord.js';
import { scan } from '../services/ai/moderation.js';
import { incCounter, observeHistogram } from '../util/metrics.js';
import { logError } from '../util/logger.js';

export const data = new SlashCommandBuilder()
  .setName('moderate')
  .setDescription('Run a quick moderation scan on text.')
  .addStringOption(o => o.setName('text').setDescription('Text to scan').setRequired(true));

export async function execute(interaction) {
  const t0 = Date.now();
  await interaction.deferReply({ ephemeral: true });

  const text = interaction.options.getString('text', true);

  const res = await scan(text);
  if (!res.ok) {
    incCounter('commands_total', { command: 'moderate', outcome: 'error' });
    logError('[CMD]', { guildId: interaction.guildId, channelId: interaction.channelId, userId: interaction.user.id, command: 'moderate', error: res.error });
    await interaction.editReply('❌ Moderation service error.');
  } else {
    incCounter('commands_total', { command: 'moderate', outcome: 'ok' });
    const { blocked, score } = res.data;
    await interaction.editReply(`Moderation: **${blocked ? 'BLOCKED' : 'OK'}** (score=${Number(score).toFixed(2)})`);
  }

  observeHistogram('command_latency_seconds', (Date.now() - t0) / 1000, { command: 'moderate' });
}
