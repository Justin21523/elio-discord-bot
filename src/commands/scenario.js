// /scenario start|answer|reveal
// English-only.

import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ComponentType } from 'discord.js';
import * as scenarios from '../services/scenario.js';
import { formatErrorEmbed, safeEdit, ensureDeferred } from '../util/replies.js';
import { incCounter} from "../util/metrics.js";

export const data = new SlashCommandBuilder()
  .setName('scenario')
  .setDescription('Play a scenario quiz or speedrun.')
  .addSubcommand(sc => sc
    .setName('start')
    .setDescription('Start a scenario session')
    .addStringOption(o => o.setName('tag').setDescription('Scenario tag').setRequired(false))
    .addIntegerOption(o => o.setName('duration').setDescription('Duration seconds (default 30)').setRequired(false))
  )
  .addSubcommand(sc => sc
    .setName('reveal')
    .setDescription('Reveal the answer & stats')
  )
  .addSubcommand(sc => sc
    .setName('cancel')
    .setDescription('Cancel the active session (admin)')
  )
  .setDMPermission(false);


export async function execute(interaction) {
  const startAt = Date.now();
  const sub = interaction.options.getSubcommand();
  const guildId = interaction.guildId;
  const channelId = interaction.channelId;
  const userId = interaction.user.id;

  try {
    await ensureDeferred(interaction, false);

    if (sub === 'start') {
      const tag = interaction.options.getString('tag') || null;
      const duration = interaction.options.getInteger('duration') || 30;

      const result = await scenarios.startSession({ guildId, channelId, tag, durationSec: duration });
      if (!result.ok) return safeEdit(interaction, formatErrorEmbed(result.error, 'failed to start'));

      const s = result.data.session;
      const letters = ['A','B','C','D'];
      const title = `Scenario • ${s.hostPersonaName || 'Elio'} • ${s.durationSec}s`;

      const embed = new EmbedBuilder()
        .setTitle(title)
        .setColor(0x72C5FF)
        .setDescription(`**Q:** ${s.prompt}\n\n${s.options.map((o, i) => `**${letters[i]}** ${o}`).join('\n')}`)
        .setFooter({ text: 'Answer by clicking a button below' });

      const row = new ActionRowBuilder().addComponents(
        ...s.options.map((_, i) =>
          new ButtonBuilder()
            .setCustomId(`scn:${s._id}:${i}`)
            .setLabel(letters[i])
            .setStyle(ButtonStyle.Primary)
        )
      );

      const msg = await interaction.channel.send({ embeds: [embed], components: [row] });
      await safeEdit(interaction, { content: `Question started for **${s.durationSec}s**. Good luck!`, embeds: [] });

      // Collector for button clicks
      const collector = msg.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: s.durationSec * 1000
      });

      collector.on('collect', async (btn) => {
        // Ignore other channels/guilds
        if (btn.channelId !== channelId) return;
        // Parse customId
        const [_, sid, idx] = String(btn.customId).split(':');
        if (sid !== String(s._id)) {
          return btn.reply({ content: 'This question is no longer active.', ephemeral: true });
        }
        const res = await scenarios.answer({
          guildId, channelId, userId: btn.user.id, index: Number(idx)
        });
        if (!res.ok) {
          return btn.reply({ content: `❌ ${res.error.message}`, ephemeral: true });
        }
        if (res.data.correct) {
          const bonus = res.data.first ? ` (+${res.data.scored} pts, FIRST!)` : ` (+${res.data.scored} pts)`;
          return btn.reply({ content: `✅ Correct${bonus}`, ephemeral: true });
        } else {
          return btn.reply({ content: `❌ Wrong answer`, ephemeral: true });
        }
      });

      collector.on('end', async () => {
        // Auto reveal after timeout
        const rev = await scenarios.reveal({ guildId, channelId });
        if (!rev.ok) {
          return interaction.channel.send({ content: `⚠️ Reveal failed: ${rev.error.message}` });
        }
        const r = rev.data;
        const revealEmbed = new EmbedBuilder()
          .setTitle('Answer Revealed')
          .setColor(0x3FB950)
          .setDescription(`**Q:** ${r.prompt}\n\n**A:** ${letters[r.correctIndex]} — ${r.options[r.correctIndex]}\n\n` +
            `Total answers: **${r.totalAnswers}**, correct: **${r.correctCount}**`)
          .setFooter({ text: 'Great work!' });

        await interaction.channel.send({ embeds: [revealEmbed] });
      });

      incCounter('commands_total', { command: 'scenario.start' });
      return;
    }

    if (sub === 'reveal') {
      const rev = await scenarios.reveal({ guildId, channelId });
      if (!rev.ok) return safeEdit(interaction, formatErrorEmbed(rev.error, 'Reveal failed'));
      const r = rev.data;
      const letters = ['A','B','C','D'];
      const revealEmbed = {
        title: 'Answer Revealed (manual)',
        color: 0x3FB950,
        description: `**Q:** ${r.prompt}\n\n**A:** ${letters[r.correctIndex]} — ${r.options[r.correctIndex]}\n\n` +
          `Total answers: **${r.totalAnswers}**, correct: **${r.correctCount}**`
      };
      await safeEdit(interaction, { embeds: [revealEmbed] });
      return;
    }

    if (sub === 'cancel') {
      const res = await scenarios.cancel({ guildId, channelId });
      if (!res.ok) return safeEdit(interaction, formatErrorEmbed(res.error, 'Cancel failed'));
      await safeEdit(interaction, { content: 'Session cancelled.' });
      return;
    }
  } catch (e) {
    await safeEdit(interaction, formatErrorEmbed({ code: 'UNKNOWN', message: 'Scenario command crashed' }));
  }
}