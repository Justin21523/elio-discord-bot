// Inspect recent AI agent runs (for debugging/observability).
import { SlashCommandBuilder } from 'discord.js';
import { listRuns, getRun } from '../services/ai/logs.js';
import { incCounter, startTimer, METRIC_NAMES } from '../util/metrics.js';

export const data = new SlashCommandBuilder()
  .setName('ai-logs')
  .setDescription('Inspect recent AI agent runs')
  .addSubcommand(sc => sc
    .setName('list')
    .setDescription('List recent runs')
    .addStringOption(o => o.setName('kind').setDescription('agent kind').addChoices(
      { name: 'persona_reply', value: 'persona_reply' },
      { name: 'rag_qa', value: 'rag_qa' },
      { name: 'news_summarize', value: 'news_summarize' },
      { name: 'image_react', value: 'image_react' }
    ))
    .addIntegerOption(o => o.setName('limit').setDescription('how many (max 20)').setMinValue(1).setMaxValue(20))
  )
  .addSubcommand(sc => sc
    .setName('get')
    .setDescription('Get one run by id')
    .addStringOption(o => o.setName('id').setDescription('log id').setRequired(true)));

export async function execute(interaction) {
  const command = 'ai-logs';
  const sub = interaction.options.getSubcommand();
  incCounter('commands_total', { command, sub });
  const stop = startTimer(METRIC_NAMES.command_latency_seconds, { command, sub });

  await interaction.deferReply({ ephemeral: true });

  if (sub === 'list') {
    const kind = interaction.options.getString('kind') || null;
    const limit = interaction.options.getInteger('limit') ?? 10;
    const res = await listRuns({ guildId: interaction.guildId, kind, limit });
    stop();
    if (!res.ok) return interaction.editReply(`❌ ${res.error.message}`);

    const lines = res.data.rows.map(r =>
      `• \`${r._id}\` | ${r.kind} | ${r.ok ? 'OK' : 'ERR'} | ${Math.round(r.durationMs)}ms | ${new Date(r.createdAt).toLocaleString()}`
    );
    return interaction.editReply(lines.join('\n') || '(no runs)');
  }

  if (sub === 'get') {
    const id = interaction.options.getString('id', true);
    const res = await getRun({ id });
    stop();
    if (!res.ok) return interaction.editReply(`❌ ${res.error.message}`);
    const r = res.data.row;
    const stepLines = (r.steps || []).map(s => `- ${s.label}: ${s.ok ? 'OK' : 'ERR'} (${s.dur?.toFixed?.(2)}s)${s.error ? ` — ${s.error}` : ''}`).join('\n');
    const msg = [
      `**Kind:** ${r.kind}`,
      `**Guild:** ${r.guildId || '(null)'}  **User:** ${r.userId || '(null)'}`,
      `**Duration:** ${Math.round(r.durationMs)}ms`,
      `**OK:** ${r.ok}`,
      `**Created:** ${new Date(r.createdAt).toLocaleString()}`,
      `**Steps:**\n${stepLines || '(none)'}`,
      r.error ? `**Error:** \`${r.error.code}\` ${r.error.message}` : '',
    ].filter(Boolean).join('\n');
    return interaction.editReply(msg.slice(0, 1900));
  }
}
