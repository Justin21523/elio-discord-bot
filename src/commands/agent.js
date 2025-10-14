// Slash command: /agent <kind> <input>
// All code/comments in English only.

import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import { run as runAgent } from '../services/ai/agent.js';
import { logError } from '../util/logger.js';
import { counterInc, histogramObserve } from '../util/metrics.js';

export const data = new SlashCommandBuilder()
  .setName('agent')
  .setDescription('Run AI agent flows (RAG/news/persona).')
  .addStringOption(opt =>
    opt.setName('kind')
      .setDescription('Flow kind')
      .setRequired(true)
      .addChoices(
        { name: 'free_chat', value: 'free_chat' },
        { name: 'rag_qa', value: 'rag_qa' },
        { name: 'summarize_with_rag', value: 'summarize_with_rag' },
        { name: 'news_digest', value: 'news_digest' },
        { name: 'persona_reply', value: 'persona_reply' },
      ),
  )
  .addStringOption(opt =>
    opt.setName('input')
      .setDescription('User text / question / topic')
      .setRequired(true),
  )
  .addIntegerOption(opt =>
    opt.setName('top_k')
      .setDescription('RAG top_k (default depends on flow)')
      .setRequired(false),
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages);

export async function execute(interaction) {
  const t0 = Date.now();
  try {
    await interaction.deferReply({ ephemeral: false }); // SLO: within 3s

    const kind = interaction.options.getString('kind', true);
    const input = interaction.options.getString('input', true);
    const topK = interaction.options.getInteger('top_k', false) ?? undefined;

    const ctx = {
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: interaction.user.id,
    };

    let payload = {};
    switch (kind) {
      case 'free_chat':
        payload = { query: input, max_length: 480 };
        break;
      case 'rag_qa':
        payload = { query: input, top_k: topK ?? 6 };
        break;
      case 'summarize_with_rag':
        payload = { query: input, top_k: topK ?? 8 };
        break;
      case 'news_digest':
        payload = { query: input, max_results: 6 };
        break;
      case 'persona_reply':
        payload = {
          text: input,
          persona: { name: 'Elio', style: 'playful, supportive' },
          max_length: 180,
        };
        break;
      default:
        payload = { query: input };
    }

    const result = await runAgent({ kind, payload }, ctx);

    if (!result.ok) {
      counterInc('commands_total', { command: 'agent', outcome: 'error' });
      const code = result.error.code ?? 'UNKNOWN';
      const message = result.error.message ?? 'Unknown error';
      logError('[CMD]', { ...ctx, command: 'agent', code, message });
      await interaction.editReply(`❌ Agent error (${code}): ${message}`);
      return;
    }

    counterInc('commands_total', { command: 'agent', outcome: 'ok' });

    // Basic pretty output
    const { steps, result: out } = result.data;

    const lines = [];
    if (kind === 'free_chat') {
      lines.push(out?.answer ?? '(no output)');
    } else if (kind === 'rag_qa') {
      lines.push(`**Answer**\n${out?.answer ?? '(no answer)'}`);
      if (out?.context?.length) {
        const ctx = out.context.slice(0, 5).map((h, i) => `[\`${(h.score ?? 0).toFixed(3)}\`] ${h.content?.slice(0, 120)}…`).join('\n');
        lines.push(`\n**Context (top)**\n${ctx}`);
      }
    } else if (kind === 'summarize_with_rag') {
      lines.push(out?.summary ?? '(no summary)');
    } else if (kind === 'news_digest') {
      lines.push(out?.digest ?? '(no digest)');
    } else if (kind === 'persona_reply') {
      lines.push(out?.reply ?? '(no reply)');
    } else {
      lines.push('Done.');
    }

    // Append short step trace
    if (Array.isArray(steps) && steps.length) {
      const stepLine = steps.map(s => `\`${s.tool}\` ${s.ok ? '✅' : '❌'} (${s.duration_sec}s)`).join(' • ');
      lines.push(`\n> steps: ${stepLine}`);
    }

    await interaction.editReply(lines.join('\n'));
  } catch (e) {
    counterInc('commands_total', { command: 'agent', outcome: 'exception' });
    logError('[CMD]', {
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      userId: interaction.user?.id,
      command: 'agent',
      error: String(e),
    });
    await interaction.editReply('❌ Unexpected error while running agent.');
  } finally {
    const dt = (Date.now() - t0) / 1000;
    histogramObserve('command_latency_seconds', dt, { command: 'agent' });
  }
}
