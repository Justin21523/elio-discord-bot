// /src/commands/ai-check.js
// English-only code & comments.
//
// Slash command: /ai-check
// Renders AI sidecar /health into a Discord embed with handy fields.

import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { health as aiHealth } from '../services/ai/status.js';
import { CONFIG } from '../config.js';
import { logger } from '../util/logger.js';

export const data = new SlashCommandBuilder()
  .setName('ai-check')
  .setDescription('Run AI sidecar health check and show detailed status.');

export async function execute(interaction) {
  const t0 = Date.now();
  await interaction.deferReply({ ephemeral: true }).catch(() => {});
  const meta = { guildId: interaction.guildId, channelId: interaction.channelId, userId: interaction.user.id };

  const res = await aiHealth();
  if (!res.ok) {
    logger.error({ ...meta, err: res.error }, '[CMD] /ai-check failed');
    const msg = `❌ AI health check failed: ${res.error.code}\n${res.error.message}`;
    return interaction.editReply({ content: msg });
  }

  const h = res.data || {};
  // Expected shape (sidecar): { ok, service, features, versions, device, llm, vlm, embeddings, mongo, atlas? }
  const device = h.device || {};
  const llm = h.llm || {};
  const vlm = h.vlm || {};
  const emb = h.embeddings || h.embedding || {};
  const db = h.mongo || {};
  const atlas = h.atlas || {};
  const feats = h.features || {};

  const embed = new EmbedBuilder()
    .setTitle('AI Health')
    .setColor(llm.ok && emb.ok && (vlm.ok ?? true) && (db.ok ?? true) ? 0x4caf50 : 0xff5252)
    .setDescription(`Sidecar: \`${h.service || 'unknown'}\`  \nBase URL: \`${CONFIG.ai.baseUrl}\``)
    .addFields(
      {
        name: 'LLM',
        value:
          `• ok: **${llm.ok ? 'yes' : 'no'}**\n` +
          `• model: \`${llm.model || 'n/a'}\`\n` +
          (llm.adapter ? `• adapter: \`${llm.adapter}\`\n` : '') +
          (llm.max_tokens ? `• max_new_tokens: \`${llm.max_tokens}\`\n` : ''),
        inline: true,
      },
      {
        name: 'VLM',
        value:
          (feats.vlm === false ? 'disabled\n' : '') +
          `• ok: **${vlm.ok ? 'yes' : (feats.vlm === false ? 'n/a' : 'no')}**\n` +
          `• model: \`${vlm.model || 'n/a'}\``,
        inline: true,
      },
      {
        name: 'Embeddings',
        value:
          `• ok: **${emb.ok ? 'yes' : 'no'}**\n` +
          `• model: \`${emb.model || 'n/a'}\`\n` +
          `• dim: \`${emb.dim ?? 'n/a'}\``,
        inline: true,
      },
    )
    .addFields(
      {
        name: 'MongoDB',
        value:
          `• ok: **${db.ok ? 'yes' : 'no'}**\n` +
          (db.uri ? `• uri: \`${db.uri.replace(/\/\/.*@/, '//***@')}\`\n` : '') +
          (db.db ? `• db: \`${db.db}\`\n` : ''),
        inline: true,
      },
      {
        name: 'Atlas VS',
        value:
          (atlas.enabled === false ? 'disabled\n' :
            `• enabled: **${atlas.enabled ? 'yes' : 'no'}**\n` +
            (atlas.index ? `• index: \`${atlas.index}\`\n` : '') +
            (atlas.dim ? `• dim: \`${atlas.dim}\`\n` : '') +
            (atlas.status ? `• status: \`${atlas.status}\`` : '')
          ),
        inline: true,
      },
      {
        name: 'Device',
        value:
          `• type: \`${device.type || 'cpu'}\`\n` +
          (device.name ? `• name: \`${device.name}\`\n` : '') +
          (device.cuda ? `• cuda: \`${device.cuda}\`\n` : '') +
          (h.versions?.torch ? `• torch: \`${h.versions.torch}\`` : ''),
        inline: true,
      },
    )
    .setFooter({ text: `features: ${Object.entries(feats).filter(([,v])=>v).map(([k])=>k).join(', ') || 'n/a'}` })
    .setTimestamp(new Date());

  logger.info({ ...meta, ok: true, ms: Date.now() - t0 }, '[CMD] /ai-check success');
  return interaction.editReply({ embeds: [embed] });
}

