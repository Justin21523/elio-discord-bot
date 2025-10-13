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
