import { MessageFlags } from "discord.js";

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
