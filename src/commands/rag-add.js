import { SlashCommandBuilder } from "discord.js";
import ai from "../services/ai/index.js";

export const data = new SlashCommandBuilder()
  .setName("rag-add")
  .setDescription("Add a RAG document (guild-scoped).")
  // REQUIRED options must come first
  .addStringOption(o =>
    o.setName("id")
     .setDescription("Doc id (unique per guild)")
     .setRequired(true)
  )
  .addStringOption(o =>
    o.setName("text")
     .setDescription("Document content")
     .setRequired(true)
  )
  // optional options go after all required
  .addStringOption(o =>
    o.setName("title")
     .setDescription("Title")
     .setRequired(false)
  )
  .addStringOption(o =>
    o.setName("tags")
     .setDescription("Comma-separated tags")
     .setRequired(false)
  );

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const docId = interaction.options.getString("id");
  const text = interaction.options.getString("text");
  const title = interaction.options.getString("title") || null;
  const tags = (interaction.options.getString("tags") || "")
    .split(",").map(s => s.trim()).filter(Boolean);

  const docs = [{
    docId,
    title,
    text,
    guildId: interaction.guildId,
    tags,
    source: "slash:rag-add",
  }];

  const res = await ai.ragUpsert(docs);
  if (!res.ok) return interaction.editReply(`❌ ${res.error.code}: ${res.error.message}`);
  return interaction.editReply(`✅ Upserted: ${res.data.upserted}, dim: ${res.data.dim}`);
}

export default { data, execute };
