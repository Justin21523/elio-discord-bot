// /media add|random|disable|list
// English-only.

import { SlashCommandBuilder } from 'discord.js';
import * as mediaRepo from '../services/mediaRepo.js';
import { incCounter, observeHistogram } from '../util/metrics.js';
import { logError } from '../util/logger.js';

export const data = new SlashCommandBuilder()
  .setName('media')
  .setDescription('Manage media repository (Mongo).')
  .addSubcommand(sc =>
    sc.setName('add')
      .setDescription('Add a media URL.')
      .addStringOption(o => o.setName('url').setDescription('Image/GIF URL').setRequired(true))
      .addStringOption(o => o.setName('tags').setDescription('Comma-separated tags'))
      .addBooleanOption(o => o.setName('nsfw').setDescription('Is NSFW?')))
  .addSubcommand(sc =>
    sc.setName('random')
      .setDescription('Pick a random media.')
      .addStringOption(o => o.setName('tags').setDescription('Comma-separated tags (optional)'))
      .addBooleanOption(o => o.setName('nsfw').setDescription('Allow NSFW?')))
  .addSubcommand(sc =>
    sc.setName('disable')
      .setDescription('Disable or enable a media item by id.')
      .addStringOption(o => o.setName('id').setDescription('Media id').setRequired(true))
      .addBooleanOption(o => o.setName('disabled').setDescription('Disabled?').setRequired(true)))
  .addSubcommand(sc => sc.setName('list').setDescription('List latest media items.'));

export async function execute(interaction) {
  const t0 = Date.now();
  await interaction.deferReply({ ephemeral: true });

  try {
    const sub = interaction.options.getSubcommand(true);

    if (sub === 'add') {
      const url = interaction.options.getString('url', true);
      const tags = (interaction.options.getString('tags') || '').split(',').map(s => s.trim()).filter(Boolean);
      const nsfw = interaction.options.getBoolean('nsfw') || false;
      const res = await mediaRepo.add({ url, tags, nsfw });
      await interaction.editReply(res.ok ? `✅ Added \`${res.data.id}\`` : `❌ ${res.error.message}`);
      incCounter('media_posts_total', {});
      return;
    }

    if (sub === 'random') {
      const tags = (interaction.options.getString('tags') || '').split(',').map(s => s.trim()).filter(Boolean);
      const nsfw = interaction.options.getBoolean('nsfw') || false;
      const res = await mediaRepo.pickRandom({ nsfwAllowed: nsfw, tags });
      if (!res.ok) return await interaction.editReply(`❌ ${res.error.message}`);
      await interaction.editReply({ content: '🎲 Random pick:', ephemeral: true });
      await interaction.followUp({ content: res.data.url, ephemeral: false });
      return;
    }

    if (sub === 'disable') {
      const id = interaction.options.getString('id', true);
      const disabled = interaction.options.getBoolean('disabled', true);
      const res = await mediaRepo.disable(id, disabled);
      await interaction.editReply(res.ok ? `🛑 ${id} disabled=${disabled}` : `❌ ${res.error.message}`);
      return;
    }

    if (sub === 'list') {
      const res = await mediaRepo.list({ includeDisabled: true });
      if (!res.ok) return await interaction.editReply(`❌ ${res.error.message}`);
      const first10 = res.data.slice(0, 10).map(x => `• \`${x.id}\` ${x.disabled ? '❌' : '✅'} ${x.url}`).join('\n') || '(none)';
      await interaction.editReply(first10);
      return;
    }
  } catch (e) {
    logError('[CMD]', { command: 'media', error: String(e) });
    await interaction.editReply('❌ Media command failed.');
  } finally {
    observeHistogram('command_latency_seconds', (Date.now() - t0) / 1000, { command: 'media' });
  }
}
