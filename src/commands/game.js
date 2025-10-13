import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { collections } from '../db/mongo.js';
import { awardWin, getLeaderboard } from '../services/points.js';
import { safeDefer, edit } from '../util/replies.js';

export const data = new SlashCommandBuilder()
  .setName('game')
  .setDescription('Quick-react mini-game')
  .addSubcommand(sc => sc.setName('start').setDescription('Start a quick-react game'))
  .addSubcommand(sc => sc.setName('leaderboard').setDescription('Show top users'));

export async function execute(interaction, client) {
  try {
    await safeDefer(interaction, true);
    const sub = interaction.options.getSubcommand();

    if (sub === 'start') {
      const { games } = collections();
      const doc = {
        guildId: interaction.guildId,
        channelId: interaction.channelId,
        type: 'first-click',
        status: 'open',
        startedAt: new Date()
      };
      const res = await games.insertOne(doc);
      const gameId = res.insertedId.toString();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`first_${gameId}`).setLabel("I'm first!").setStyle(ButtonStyle.Success)
      );

      const msg = await interaction.followUp({ content: 'First to click WINS!', components: [row], ephemeral: false });
      await games.updateOne({ _id: res.insertedId }, { $set: { messageId: msg.id } });
      return edit(interaction, 'Game posted!');
    }

    if (sub === 'leaderboard') {
      const top = await getLeaderboard(interaction.guildId, 10);
      if (!top.length) return edit(interaction, 'No scores yet.');
      const lines = top.map((p, i) => `${i + 1}. <@${p.userId}> â€” ${p.points} pts (Lv.${p.level || 1})`);
      return edit(interaction, 'Top players:\n' + lines.join('\n'));
    }

    return edit(interaction, 'Unknown subcommand.');
  } catch (e) {
    console.error('[ERR] /game failed:', e);
    return edit(interaction, 'Something went wrong while handling /game.');
  }
}

// Interaction button router (wired in index.js)
export async function handleButton(interaction) {
  if (!interaction.customId?.startsWith('first_')) return false;
  const gameId = interaction.customId.split('_')[1];
  const { games } = collections();
  const game = await games.findOne({ _id: new (await import('mongodb')).ObjectId(gameId) });
  if (!game || game.status !== 'open') {
    return interaction.reply({ content: 'Too late!', ephemeral: true });
  }
  await games.updateOne({ _id: game._id }, { $set: { status: 'closed', winnerUserId: interaction.user.id } });

  const profile = await awardWin({ guildId: interaction.guildId, userId: interaction.user.id });
  await interaction.reply({ content: `í¿† <@${interaction.user.id}> wins! (+${profile ? 'points' : ''})`, ephemeral: false });
  return true;
}
