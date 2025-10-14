// Slash command: /caption (image attachment) [question]
// If question provided -> VQA; else -> caption.
// English-only.

import { SlashCommandBuilder } from 'discord.js';
import { captionB64, vqaB64 } from '../services/ai/images.js';
import { counterInc, histogramObserve } from '../util/metrics.js';
import { logError } from '../util/logger.js';

async function fetchAsBase64(url) {
  const res = await fetch(url);
  const buf = await res.arrayBuffer();
  const b64 = Buffer.from(buf).toString('base64');
  return b64;
}

export const data = new SlashCommandBuilder()
  .setName('caption')
  .setDescription('Image caption or VQA (attach an image).')
  .addAttachmentOption(o => o.setName('image').setDescription('Image file').setRequired(true))
  .addStringOption(o => o.setName('question').setDescription('If provided, run VQA on the image'));

export async function execute(interaction) {
  const t0 = Date.now();
  await interaction.deferReply({ ephemeral: false });

  const att = interaction.options.getAttachment('image', true);
  const q = interaction.options.getString('question');

  try {
    const b64 = await fetchAsBase64(att.url);
    let res;
    if (q && q.trim()) {
      res = await vqaB64(b64, q.trim(), 128);
    } else {
      res = await captionB64(b64, 80);
    }

    if (!res.ok) {
      counterInc('commands_total', { command: 'caption', outcome: 'error' });
      await interaction.editReply('❌ Image processing failed.');
    } else {
      counterInc('commands_total', { command: 'caption', outcome: 'ok' });
      const out = res.data.answer ?? res.data.caption ?? '(no output)';
      await interaction.editReply(out);
    }
  } catch (e) {
    counterInc('commands_total', { command: 'caption', outcome: 'exception' });
    logError('[CMD]', { guildId: interaction.guildId, channelId: interaction.channelId, userId: interaction.user.id, command: 'caption', error: String(e) });
    await interaction.editReply('❌ Failed to read attachment.');
  }

  histogramObserve('command_latency_seconds', (Date.now() - t0) / 1000, { command: 'caption' });
}
