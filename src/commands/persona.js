// src/commands/persona.js
// Slash command for persona friendship system.
// Now posts visible messages via webhook (personaSay) with per-persona avatar & color.

import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { collections } from "../db/mongo.js";
import { safeDefer, edit } from "../util/replies.js";
import { applyAction } from "../services/persona.js";
import { personaSay } from "../services/webhooks.js";

function metaFromDoc(p) {
  return {
    color: Number.isFinite(p?.color) ? p.color : 0x95a5a6,
    avatar: p?.avatar || null,
  };
}

export const data = new SlashCommandBuilder()
  .setName("persona")
  .setDescription("Interact with personas (friendship/trust/dependence)")
  .addSubcommand((sc) =>
    sc
      .setName("meet")
      .setDescription("Meet a persona (random or by name)")
      .addStringOption((o) => o.setName("name").setDescription("Persona name"))
  )
  .addSubcommand((sc) =>
    sc
      .setName("act")
      .setDescription("Perform an action with a persona")
      .addStringOption((o) =>
        o
          .setName("action")
          .setDescription("joke|gift|help|tease|comfort|challenge")
          .setRequired(true)
      )
      .addStringOption((o) =>
        o.setName("name").setDescription("Persona name (default: random)")
      )
  )
  .addSubcommand((sc) =>
    sc
      .setName("stats")
      .setDescription("Show your affinity with a persona")
      .addStringOption((o) =>
        o.setName("name").setDescription("Persona name (optional)")
      )
  );

export async function execute(interaction) {
  try {
    await safeDefer(interaction, true);
    const sub = interaction.options.getSubcommand();
    const { personas, persona_config, persona_affinity } = collections();

    if (sub === "meet") {
      const name = (interaction.options.getString("name") || "").trim();
      let p = name
        ? await personas.findOne({ name, enabled: { $ne: false } })
        : (
            await personas
              .aggregate([
                { $match: { enabled: { $ne: false } } },
                { $sample: { size: 1 } },
              ])
              .toArray()
          )[0];
      if (!p)
        return edit(
          interaction,
          name ? `Persona "${name}" not found.` : "No persona available."
        );

      const cfg = await persona_config.findOne({ _id: "global" });
      const actions = Object.keys(cfg?.actions || []);
      const opener = (p.openers || [])[0] || `You meet **${p.name}**.`;
      const meta = metaFromDoc(p);

      const embed = new EmbedBuilder()
        .setTitle(p.name) // 大字標題
        .setDescription(
          `${opener}\n\n**Available actions:** ${
            actions.map((a) => `**${a}**`).join(" · ") || "_N/A_"
          }`
        )
        .setColor(meta.color);

      const channel = await interaction.client.channels.fetch(
        interaction.channelId
      );
      await personaSay(channel, {
        name: p.name,
        avatar: meta.avatar,
        embeds: [embed],
      });
      return edit(interaction, `Introduced **${p.name}** here.`);
    }

    if (sub === "act") {
      const action = (interaction.options.getString("action") || "").trim();
      const name = (interaction.options.getString("name") || "").trim();

      const cfg = await persona_config.findOne({ _id: "global" });
      if (!cfg?.actions?.[action])
        return edit(interaction, `Unknown action "${action}".`);

      let p = name
        ? await personas.findOne({ name, enabled: { $ne: false } })
        : (
            await personas
              .aggregate([
                { $match: { enabled: { $ne: false } } },
                { $sample: { size: 1 } },
              ])
              .toArray()
          )[0];
      if (!p)
        return edit(
          interaction,
          name ? `Persona "${name}" not found.` : "No persona available."
        );

      const res = await applyAction({
        guildId: interaction.guildId,
        userId: interaction.user.id,
        personaName: p.name,
        action,
      });
      const meta = metaFromDoc(p);

      const embed = new EmbedBuilder()
        .setTitle(p.name)
        .setDescription(res.message) // 內文我們已用 ** 粗體關鍵詞
        .setColor(res.ok ? meta.color : 0xe74c3c);

      const channel = await interaction.client.channels.fetch(
        interaction.channelId
      );
      await personaSay(channel, {
        name: p.name,
        avatar: meta.avatar,
        embeds: [embed],
      });
      return edit(
        interaction,
        res.ok ? "Action applied." : "Action failed (see message in channel)."
      );
    }

    if (sub === "stats") {
      const name = (interaction.options.getString("name") || "").trim();
      let persona;
      if (name) {
        persona = await personas.findOne({ name, enabled: { $ne: false } });
        if (!persona) return edit(interaction, `Persona "${name}" not found.`);
      }

      if (persona) {
        const aff = await persona_affinity.findOne({
          guildId: interaction.guildId,
          userId: interaction.user.id,
          personaId: persona._id,
        });
        const f = aff?.friendship ?? 0;
        const t = aff?.trust ?? 0;
        const d = aff?.dependence ?? 0;

        // Show stats visibly via personaSay as well
        const meta = personaMeta(persona.name);
        const embed = new EmbedBuilder()
          .setAuthor({ name: persona.name, iconURL: meta.avatar || undefined })
          .setDescription(
            `**Your affinity**\nFriendship: **${f}**\nTrust: **${t}**\nDependence: **${d}**`
          )
          .setColor(meta.color);

        const channel = await interaction.client.channels.fetch(
          interaction.channelId
        );
        await personaSay(channel, {
          name: persona.name,
          avatar: meta.avatar,
          content: null,
          embeds: [embed],
        });

        return edit(interaction, `Posted stats for **${persona.name}**.`);
      } else {
        // fallback: ephemeral summary across personas (unchanged)
        const list = await persona_affinity
          .aggregate([
            {
              $match: {
                guildId: interaction.guildId,
                userId: interaction.user.id,
              },
            },
            {
              $lookup: {
                from: "personas",
                localField: "personaId",
                foreignField: "_id",
                as: "p",
              },
            },
            { $unwind: "$p" },
            {
              $project: {
                _id: 0,
                name: "$p.name",
                friendship: 1,
                trust: 1,
                dependence: 1,
              },
            },
          ])
          .toArray();

        if (!list.length) return edit(interaction, "No affinity records yet.");
        const lines = list.map(
          (r) =>
            `• ${r.name}: F ${r.friendship} / T ${r.trust} / D ${r.dependence}`
        );
        return edit(
          interaction,
          "Your persona affinities:\n" + lines.join("\n")
        );
      }
    }

    return edit(interaction, "Unknown subcommand.");
  } catch (err) {
    console.error("[ERR] /persona failed:", err);
    return edit(
      interaction,
      err?.message || "Something went wrong while handling /persona."
    );
  }
}
