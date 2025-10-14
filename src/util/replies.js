import { MessageFlags } from "discord.js";

export function ok(data) {
  return { ok: true, data };
}

export function fail(code, message, cause, details) {
  return { ok: false, error: { code, message, cause, details } };
}

export async function defer(i, { ephemeral = false } = {}) {
  try {
    if (i.deferred || i.replied) return;
    const opts = ephemeral ? { flags: MessageFlags.Ephemeral } : {};
    await i.deferReply(opts);
  } catch (e) {
    console.log("[ERR] defer failed:", e);
  }
}

export async function reply(i, content, { ephemeral = false } = {}) {
  const payload = typeof content === "string" ? { content } : content;
  if (ephemeral) payload.flags = MessageFlags.Ephemeral;
  if (i.deferred || i.replied) return i.editReply(payload);
  return i.reply(payload);
}

/**
 * Send ephemeral error reply
 * @param {import('discord.js').Interaction} interaction
 * @param {string} message
 */
export async function replyError(interaction, message) {
  const content = `❌ ${message}`;

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ content, ephemeral: true });
  } else {
    await interaction.reply({ content, ephemeral: true });
  }
}

/**
 * Send success reply
 * @param {import('discord.js').Interaction} interaction
 * @param {string} message
 * @param {boolean} ephemeral
 */
export async function replySuccess(interaction, message, ephemeral = false) {
  const content = `✅ ${message}`;

  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ content, ephemeral });
  } else {
    await interaction.reply({ content, ephemeral });
  }
}

/**
 * Defer reply with optional ephemeral
 * @param {import('discord.js').Interaction} interaction
 * @param {boolean} ephemeral
 */
export async function deferReply(interaction, ephemeral = false) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral });
  }
}

export async function safeDefer(interaction, ephemeral = true) {
  if (interaction.deferred || interaction.replied) return;
  try {
    await interaction.deferReply({ ephemeral });
  } catch (e) {
    // Ignore "Unknown interaction" race
  }
}

export async function edit(interaction, content) {
  try {
    return await interaction.editReply(content);
  } catch (e) {
    console.error('[ERR] editReply failed:', e);
  }
}

/**
 * Formats an ephemeral error reply payload for Discord.
 * Keeps ErrorCode visible for debugging while being friendly.
 */
export function formatErrorEmbed(error, title = "Something went wrong") {
  const code = error?.code || "UNKNOWN";
  const msg = error?.message || "Unexpected error";
  return {
    embeds: [
      {
        title,
        description: `**ErrorCode:** \`${code}\`\n${msg}`,
        color: 0xff5555,
      },
    ],
    ephemeral: true,
  };
}

/**
 * Quick helper to wrap discord.js interaction error flow.
 */
export async function safeEdit(interaction, payload) {
  try {
    if (interaction.replied || interaction.deferred) {
      return await interaction.editReply(payload);
    }
    return await interaction.reply(payload);
  } catch {
    // swallow discord edit race
  }
}