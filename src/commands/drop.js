import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import { collections } from "../db/mongo.js";
import { pickRandom } from "../services/mediaRepo.js";
import { armOne } from "../services/scheduler.js";
import { safeDefer, edit } from "../util/replies.js";

const HHMM_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export const data = new SlashCommandBuilder()
  .setName("drop")
  .setDescription("Random media drop")
  .addSubcommand((sc) =>
    sc.setName("now").setDescription("Post one random media immediately")
  )
  .addSubcommand((sc) =>
    sc
      .setName("set")
      .setDescription("Schedule a daily drop at HH:MM (24h)")
      .addStringOption((o) =>
        o.setName("time").setDescription("HH:MM").setRequired(true)
      )
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages);

export async function execute(interaction, client) {
  try {
    await safeDefer(interaction, true);
    const sub = interaction.options.getSubcommand();

    if (sub === "now") {
      const channel = await interaction.client.channels.fetch(
        interaction.channelId
      );
      const allowNsfw = !!channel?.nsfw;
      const item = await pickRandom({ allowNsfw });
      if (!item)
        return edit(
          interaction,
          "No media found for this channel (check enabled/NSFW flags)."
        );
      await edit(interaction, "Dropping one item…");
      await interaction.followUp({ content: item.url, ephemeral: false });
      return;
    }

    if (sub === "set") {
      const hhmm = interaction.options.getString("time");
      if (!HHMM_RE.test(hhmm)) {
        return edit(
          interaction,
          "Invalid time. Please use **HH:MM** in 24h format, e.g., `09:30` or `21:05`."
        );
      }

      const channelId = interaction.channelId;
      const guildId = interaction.guildId;

      const { schedules } = collections();
      await schedules.updateOne(
        { guildId },
        { $set: { guildId, channelId, hhmm } },
        { upsert: true }
      );
      await armOne(client, guildId, channelId, hhmm);
      return edit(
        interaction,
        `Scheduled daily drop at **${hhmm}** in this channel.`
      );
    }

    return edit(interaction, "Unknown subcommand.");
  } catch (e) {
    console.error("[ERR] /drop failed:", e);
    return edit(interaction, "Something went wrong while handling /drop.");
  }
}
