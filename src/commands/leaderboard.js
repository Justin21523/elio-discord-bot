// English-only code & comments.
// Slash command: /leaderboard (top N, default 10) for current guild.
// Pretty embed with medal emojis.

import { SlashCommandBuilder, EmbedBuilder, userMention } from 'discord.js';
import * as Points from '../services/points.js';
import { ensureDeferred, safeEdit, formatErrorEmbed } from '../util/replies.js';
import { incCounter, startTimer, METRIC_NAMES } from '../util/metrics.js';
import { logger as baseLogger } from '../util/logger.js';

const log = baseLogger.child({ cmd: 'leaderboard' });

export const data = new SlashCommandBuilder()
  .setName('leaderboard')
  .setDescription('Show the top players in this guild.')
  .addIntegerOption(o =>
    o.setName('limit').setDescription('How many entries (1-50, default 10)').setRequired(false)
  )
  .setDMPermission(false);

const MEDALS = ['🥇', '🥈', '🥉'];

export async function execute(interaction) {
  const stop = startTimer(METRIC_NAMES.command_latency_seconds, { command: 'leaderboard' });
  try {
    await ensureDeferred(interaction, false);
    const guildId = interaction.guildId;
    const limit = interaction.options.getInteger('limit') ?? 10;

    const res = await Points.leaderboard(guildId, limit);
    if (!res.ok) return safeEdit(interaction, formatErrorEmbed(res.error, 'Leaderboard unavailable'));

    const rows = res.data;
    if (!rows.length) {
      await safeEdit(interaction, { content: 'No profiles yet. Use `/game start` or `/points add` to begin!' });
      stop({ command: 'leaderboard' });
      return;
    }

    const lines = rows.map((r, i) => {
      const medal = MEDALS[i] || `#${i + 1}`;
      return `${medal} ${userMention(r.userId)} — **${r.points}** pts (Lv.${r.level})`;
    });

    const embed = new EmbedBuilder()
      .setTitle('Guild Leaderboard')
      .setColor(0xff79c6)
      .setDescription(lines.join('\n'))
      .setFooter({ text: `Top ${rows.length}` });

    await safeEdit(interaction, { embeds: [embed] });
    incCounter(METRIC_NAMES.commands_total, { command: 'leaderboard' }, 1);
    stop({ command: 'leaderboard' });
  } catch (e) {
    log.error('[ERR] /leaderboard failed', { e: String(e), guildId: interaction.guildId, userId: interaction.user?.id });
    await safeEdit(interaction, {
      content: '❌ Unexpected error while showing leaderboard.',
      ephemeral: true,
    });
    stop({ command: 'leaderboard' });
  }
}

export default { data, execute };
