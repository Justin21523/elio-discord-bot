// Slash command: /vlm caption|vqa
// English-only. Uses sidecar URL endpoints to avoid uploading big images.

import { SlashCommandBuilder } from 'discord.js';
import { captionUrl, vqaUrl } from '../services/ai/images.js';
import { incCounter, observeHistogram } from '../util/metrics.js';
import { logError } from '../util/logger.js';

function safeUrl(att) {
  // Discord attachment URLs are short-lived but public; pass directly to sidecar.
  return att?.url;
}

export const data = new SlashCommandBuilder()
  .setName('vlm')
  .setDescription('Visual-Language tasks (caption or VQA).')
  .addSubcommand(sc =>
    sc.setName('caption')
      .setDescription('Generate a caption for the image.')
      .addAttachmentOption(o => o.setName('image').setDescription('Image file').setRequired(true))
      .addIntegerOption(o => o.setName('max').setDescription('Max length').setMinValue(16).setMaxValue(512)))
  .addSubcommand(sc =>
    sc.setName('vqa')
      .setDescription('Ask a question about the image.')
      .addAttachmentOption(o => o.setName('image').setDescription('Image file').setRequired(true))
      .addStringOption(o => o.setName('question').setDescription('Your question about the image').setRequired(true))
      .addIntegerOption(o => o.setName('max').setDescription('Max length').setMinValue(16).setMaxValue(512)));

export async function execute(interaction) {
  const t0 = Date.now();
  const ctx = { guildId: interaction.guildId, channelId: interaction.channelId, userId: interaction.user.id };

  const sub = interaction.options.getSubcommand(true);
  await interaction.deferReply({ ephemeral: false });

  try {
    if (sub === 'caption') {
      const att = interaction.options.getAttachment('image', true);
      const url = safeUrl(att);
      const max = interaction.options.getInteger('max') ?? 80;

      const res = await captionUrl(url, max);
      if (!res.ok) {
        incCounter('commands_total', { command: 'vlm_caption', outcome: 'error' });
        logError('[CMD]', { ...ctx, command: 'vlm caption', error: res.error });
        await interaction.editReply('❌ Caption failed.');
      } else {
        incCounter('commands_total', { command: 'vlm_caption', outcome: 'ok' });
        await interaction.editReply(res.data.caption || '(no caption)');
      }
    }

    if (sub === 'vqa') {
      const att = interaction.options.getAttachment('image', true);
      const q = interaction.options.getString('question', true);
      const url = safeUrl(att);
      const max = interaction.options.getInteger('max') ?? 128;

      const res = await vqaUrl(url, q, max);
      if (!res.ok) {
        incCounter('commands_total', { command: 'vlm_vqa', outcome: 'error' });
        logError('[CMD]', { ...ctx, command: 'vlm vqa', error: res.error });
        await interaction.editReply('❌ VQA failed.');
      } else {
        incCounter('commands_total', { command: 'vlm_vqa', outcome: 'ok' });
        await interaction.editReply(res.data.answer || '(no answer)');
      }
    }
  } catch (e) {
    incCounter('commands_total', { command: 'vlm', outcome: 'exception' });
    logError('[CMD]', { ...ctx, command: 'vlm', error: String(e) });
    await interaction.editReply('❌ Unexpected error.');
  } finally {
    observeHistogram('command_latency_seconds', (Date.now() - t0) / 1000, { command: 'vlm' });
  }
}
