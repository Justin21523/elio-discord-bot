// /src/commands/game.js
// English-only code & comments.
//
// Slash: /game start | buzz | stop
// Thin handler; all business logic is in services/game.js.

import { SlashCommandBuilder } from 'discord.js';
import * as Game from '../services/game.js';
import { logger } from '../util/logger.js';

export const data = new SlashCommandBuilder()
  .setName('game')
  .setDescription('Mini game: AI-powered quick quiz (first correct answer wins).')
  .addSubcommand(s =>
    s.setName('start')
      .setDescription('Start a quick quiz in this channel.')
      .addIntegerOption(o => o.setName('ttl_sec').setDescription('Answer window in seconds (default 45).').setMinValue(10).setMaxValue(180))
      .addIntegerOption(o => o.setName('award').setDescription('Points for winner (default 10).').setMinValue(1).setMaxValue(100))
  )
  .addSubcommand(s =>
    s.setName('buzz')
      .setDescription('Answer the current question.')
      .addStringOption(o => o.setName('answer').setDescription('Your answer').setRequired(true))
  )
  .addSubcommand(s =>
    s.setName('stop').setDescription('Stop the current game (admin/host only).')
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  const meta = { guildId: interaction.guildId, channelId: interaction.channelId, userId: interaction.user.id };
  await interaction.deferReply({ ephemeral: true });

  try {
    if (sub === 'start') {
      const ttlSec = interaction.options.getInteger('ttl_sec') ?? undefined;
      const award = interaction.options.getInteger('award') ?? undefined;
      const res = await Game.start({ guildId: interaction.guildId, channelId: interaction.channelId, hostId: interaction.user.id, ttlSec, award });
      if (!res.ok) return interaction.editReply(`❌ ${res.error.code}: ${res.error.message}`);
      return interaction.editReply(`🎯 Quiz posted! Expires in ${Math.round((res.data.expiresAt - Date.now())/1000)}s.`);
    }

    if (sub === 'buzz') {
      const answer = interaction.options.getString('answer', true);
      const res = await Game.buzz({ guildId: interaction.guildId, channelId: interaction.channelId, userId: interaction.user.id, username: interaction.user.username, answer });
      if (!res.ok) return interaction.editReply(`⚠️ ${res.error.code}: ${res.error.message}`);
      if (res.data.correct) return interaction.editReply(`✅ Correct! You won this round.`);
      return interaction.editReply(`❌ Not correct. Keep trying!`);
    }

    if (sub === 'stop') {
      const res = await Game.stop({ guildId: interaction.guildId, channelId: interaction.channelId });
      if (!res.ok) return interaction.editReply(`⚠️ ${res.error.code}: ${res.error.message}`);
      return interaction.editReply(`⛔ Stopped.`);
    }

    return interaction.editReply('Unknown subcommand.');
  } catch (err) {
    logger.error({ ...meta, err }, '[CMD] /game crashed');
    return interaction.editReply('❌ Internal error.');
  }
}
