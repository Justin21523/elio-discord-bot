/**
 * commands/scene.ts
 * User command: start/end RP "scene" threads.
 * All code/comments in English only.
 */

import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } from "discord.js";
import { getAssistantGuildSettings } from "../services/assistantGuildSettings.js";
import { createScene, adoptScene, endScene, getScene, listActiveScenes, markSceneRecapFailed, setSceneRecap } from "../services/assistantScenes.js";
import { COOLDOWNS } from "../config/cooldowns.js";
import { personaSay } from "../services/webhooks.js";
import { generateSceneRecap } from "../services/sceneRecapGenerator.js";

const startCooldowns = new Map<string, number>();

function cooldownKey(guildId: string, userId: string): string {
  return `${guildId}:${userId}`;
}

function safeTitle(raw: string | null): string | null {
  const t = String(raw ?? "").trim();
  if (!t) return null;
  return t.length > 80 ? t.slice(0, 80) : t;
}

function threadNameFromTitle(title: string | null): string {
  if (!title) return `scene-${Date.now()}`;
  const cleaned = title
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  const base = cleaned || "scene";
  return `${base}-${Date.now()}`.slice(0, 96);
}

function minutesLabel(minutes: number): string {
  if (minutes === 60) return "1h";
  if (minutes === 1440) return "24h";
  if (minutes === 4320) return "3d";
  if (minutes === 10080) return "7d";
  return `${minutes}m`;
}

function truncateForDiscord(text: string, max = 1800): string {
  const t = String(text ?? "").trim();
  if (!t) return "";
  if (t.length <= max) return t;
  return t.slice(0, Math.max(0, max - 14)) + "\n…(truncated)";
}

function truncateField(text: string, max = 900): string {
  const t = String(text ?? "").trim();
  if (!t) return "";
  if (t.length <= max) return t;
  return t.slice(0, Math.max(0, max - 14)) + "\n…(truncated)";
}

export const data = new SlashCommandBuilder()
  .setName("scene")
  .setDescription("Start and manage RP scene threads")
  .addSubcommand((sub) =>
    sub
      .setName("start")
      .setDescription("Start a new scene thread in this channel")
      .addStringOption((opt) =>
        opt.setName("title").setDescription("Optional scene title").setRequired(false)
      )
      .addIntegerOption((opt) =>
        opt
          .setName("auto_archive")
          .setDescription("Thread auto-archive duration (minutes)")
          .setRequired(false)
          .addChoices(
            { name: "60 (1 hour)", value: 60 },
            { name: "1440 (24 hours)", value: 1440 },
            { name: "4320 (3 days)", value: 4320 },
            { name: "10080 (7 days)", value: 10080 }
          )
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("adopt")
      .setDescription("Mark an existing thread as a scene (enables full mode there)")
      .addChannelOption((opt) =>
        opt
          .setName("thread")
          .setDescription("Thread to adopt (omit if you run this inside the thread)")
          .setRequired(false)
          .addChannelTypes(ChannelType.PublicThread, ChannelType.PrivateThread, ChannelType.AnnouncementThread)
      )
      .addStringOption((opt) =>
        opt.setName("title").setDescription("Optional scene title override").setRequired(false)
      )
  )
  .addSubcommand((sub) =>
    sub
      .setName("prompt")
      .setDescription("Post a scene starter prompt (persona + situation)")
      .addStringOption((opt) =>
        opt.setName("persona").setDescription("Persona name (optional)").setRequired(false)
      )
      .addStringOption((opt) =>
        opt
          .setName("situation")
          .setDescription("Optional situation/context to set the scene")
          .setRequired(false)
          .setMaxLength(500)
      )
  )
  .addSubcommand((sub) => sub.setName("end").setDescription("End this scene (run inside the scene thread)"))
  .addSubcommand((sub) => sub.setName("status").setDescription("Show scene status for this thread"))
  .addSubcommand((sub) => sub.setName("list").setDescription("List active scenes in this server"))
  .setDMPermission(false);

export async function execute(interaction: any, services: any) {
  await interaction.deferReply({ ephemeral: true });

  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.editReply("This command can only be used in a server.");
    return;
  }

  const sub = interaction.options.getSubcommand();

  if (sub === "start") {
    const now = Date.now();
    const cdKey = cooldownKey(guildId, interaction.user.id);
    const last = startCooldowns.get(cdKey) ?? 0;
    const remainingMs = COOLDOWNS.sceneStartMs - (now - last);
    if (remainingMs > 0) {
      const waitSec = Math.ceil(remainingMs / 1000);
      await interaction.editReply(`⏳ Please wait ${waitSec}s before starting another scene.`);
      return;
    }

    const settingsRes = await getAssistantGuildSettings(guildId);
    const settings = settingsRes.ok ? settingsRes.data : null;

    if (settings && settings.scenesEnabled === false) {
      await interaction.editReply("❌ Scenes are disabled in this server.");
      return;
    }

    const title = safeTitle(interaction.options.getString("title"));
    const minutes =
      interaction.options.getInteger("auto_archive") ??
      settings?.sceneAutoArchiveDurationMinutes ??
      1440;

    const channel = interaction.channel;
    if (!channel || !channel.threads || typeof channel.threads.create !== "function") {
      await interaction.editReply("❌ This channel does not support creating threads.");
      return;
    }
    if (typeof channel.isThread === "function" && channel.isThread()) {
      await interaction.editReply("❌ Start a scene from a normal text channel (not inside an existing thread).");
      return;
    }

    const me = interaction.guild?.members?.me;
    const botPerms = me ? channel.permissionsFor(me) : null;
    if (!botPerms) {
      await interaction.editReply("❌ I couldn't verify my permissions in this channel.");
      return;
    }
    if (!botPerms.has(PermissionFlagsBits.CreatePublicThreads)) {
      await interaction.editReply("❌ I need **Create Public Threads** permission in this channel to start a scene.");
      return;
    }
    if (!botPerms.has(PermissionFlagsBits.SendMessages)) {
      await interaction.editReply("❌ I need **Send Messages** permission in this channel to start a scene.");
      return;
    }

    const threadName = threadNameFromTitle(title);
    let thread;
    try {
      thread = await channel.threads.create({
        name: threadName,
        autoArchiveDuration: minutes,
      });
    } catch (error: unknown) {
      await interaction.editReply("❌ Failed to create a thread (missing permissions or thread creation disabled?).");
      return;
    }

    const sceneRes = await createScene({
      guildId,
      threadId: thread.id,
      parentChannelId: channel.id,
      title,
      createdByUserId: interaction.user.id,
    });

    if (!sceneRes.ok) {
      try {
        await thread.setArchived(true, "Scene creation failed; cleaning up thread");
      } catch {
        // Ignore cleanup failures.
      }
      await interaction.editReply(`❌ ${sceneRes.error.message}`);
      return;
    }

    startCooldowns.set(cdKey, now);

    try {
      const intro =
        `🎭 **Scene started**${title ? `: **${title}**` : ""}\n` +
        `- Full mode (RP prefix like \`caleb:\`) is allowed in this thread.\n` +
        `- Use \`/assistant on\` if you want RP prefix triggers.\n` +
        `- Use \`/scene end\` to close the scene.`;
      await thread.send(intro);
    } catch {
      // Ignore if we can't send to the thread.
    }

    await interaction.editReply(`✅ Scene created: <#${thread.id}> (auto-archive: ${minutesLabel(minutes)})`);
    return;
  }

  if (sub === "adopt") {
    const settingsRes = await getAssistantGuildSettings(guildId);
    const settings = settingsRes.ok ? settingsRes.data : null;
    if (settings && settings.scenesEnabled === false) {
      await interaction.editReply("❌ Scenes are disabled in this server.");
      return;
    }

    const inThread = !!interaction.channel && typeof interaction.channel.isThread === "function" && interaction.channel.isThread();
    const threadOption = interaction.options.getChannel("thread", false);
    const target = inThread ? interaction.channel : threadOption;
    if (!target) {
      await interaction.editReply("❌ Use this inside a thread, or provide a thread via `thread:`.");
      return;
    }

    const isThread = typeof target.isThread === "function" && target.isThread();
    if (!isThread) {
      await interaction.editReply("❌ The selected channel is not a thread.");
      return;
    }

    let thread = target;
    if (typeof thread.fetch === "function") {
      try {
        thread = await thread.fetch();
      } catch {
        // Ignore fetch failures; proceed with partial thread object.
      }
    }

    if (thread.archived === true) {
      await interaction.editReply("❌ This thread is archived. Unarchive it first, then run `/scene adopt` again.");
      return;
    }

    const memberPerms = interaction.memberPermissions;
    const canAdopt =
      (memberPerms?.has?.(PermissionFlagsBits.ManageThreads) ?? false) ||
      (memberPerms?.has?.(PermissionFlagsBits.Administrator) ?? false) ||
      (thread.ownerId && thread.ownerId === interaction.user.id);

    if (!canAdopt) {
      await interaction.editReply("❌ You need **Manage Threads** permission (or be the thread owner) to adopt a scene.");
      return;
    }

    const title = safeTitle(interaction.options.getString("title")) ?? safeTitle(thread.name) ?? null;
    const parentChannelId = thread.parentId ? String(thread.parentId) : null;

    const adoptRes = await adoptScene({
      guildId,
      threadId: thread.id,
      parentChannelId,
      title,
      adoptedByUserId: interaction.user.id,
    });

    if (!adoptRes.ok) {
      await interaction.editReply(`❌ ${adoptRes.error.message}`);
      return;
    }

    try {
      await thread.send(
        "🎭 **Scene adopted**\n" +
          "- Full mode (RP prefix like `caleb:`) is allowed in this thread.\n" +
          "- Use `/assistant on` if you want RP prefix triggers.\n" +
          "- Use `/scene end` to close the scene."
      );
    } catch {
      // Ignore send failures.
    }

    await interaction.editReply(`✅ Scene adopted: <#${thread.id}>`);
    return;
  }

  if (sub === "prompt") {
    const channel = interaction.channel;
    const isThread = !!channel && typeof channel.isThread === "function" && channel.isThread();
    if (!isThread) {
      await interaction.editReply("Use this inside a scene thread.");
      return;
    }

    const threadId = channel.id;
    const sceneDocRes = await getScene(guildId, threadId);
    if (!sceneDocRes.ok) {
      await interaction.editReply(`❌ ${sceneDocRes.error.message}`);
      return;
    }
    const scene = sceneDocRes.data;
    if (!scene || !scene.active) {
      await interaction.editReply("This thread is not an active scene. Use `/scene adopt` (or `/scene start`) first.");
      return;
    }

    const personaInputRaw = interaction.options.getString("persona");
    const personaInput = String(personaInputRaw ?? "").trim();
    const situationRaw = interaction.options.getString("situation");
    const situation = String(situationRaw ?? "").trim();

    const listRes = await services?.personas?.listPersonas?.();
    const personas = listRes?.ok ? listRes.data : [];
    if (!Array.isArray(personas) || personas.length === 0) {
      await interaction.editReply("❌ No personas are available right now.");
      return;
    }

    const pickOpener = (p: any): string => {
      const openers = Array.isArray(p?.openers) ? p.openers.filter(Boolean) : [];
      if (openers.length) return String(openers[Math.floor(Math.random() * openers.length)]);
      return "Alright—let’s set the scene. What happens next?";
    };

    let personaDoc: any | null = null;
    if (personaInput) {
      const lower = personaInput.toLowerCase();
      personaDoc = personas.find((p: any) => String(p?.name ?? "").toLowerCase() === lower) ?? null;
      if (!personaDoc) {
        const suggestions = personas
          .slice(0, 8)
          .map((p: any) => String(p?.name ?? ""))
          .filter(Boolean)
          .join(", ");
        await interaction.editReply(`❌ Unknown persona: \`${personaInput}\`\nTry one of: ${suggestions}`);
        return;
      }
    } else {
      personaDoc = personas[Math.floor(Math.random() * personas.length)] ?? null;
    }

    if (!personaDoc?.name) {
      await interaction.editReply("❌ Failed to pick a persona.");
      return;
    }

    const opener = pickOpener(personaDoc);
    const content = situation ? `*${situation}*\n\n${opener}` : opener;

    const sayRes = await personaSay(
      threadId,
      {
        name: String(personaDoc.name),
        avatar: personaDoc.avatarUrl || personaDoc.avatar || null,
        color: personaDoc.color ?? null,
      },
      { content }
    );

    if (!sayRes.ok) {
      await interaction.editReply(`❌ Failed to post prompt: ${sayRes.error.message}`);
      return;
    }

    await interaction.editReply(`✅ Prompt posted as **${String(personaDoc.name)}**.`);
    return;
  }

  if (sub === "list") {
    const listRes = await listActiveScenes(guildId, 10);
    if (!listRes.ok) {
      await interaction.editReply(`❌ ${listRes.error.message}`);
      return;
    }
    const scenes = listRes.data.scenes;
    if (!scenes.length) {
      await interaction.editReply("No active scenes right now.");
      return;
    }

    const lines = scenes
      .slice(0, 10)
      .map((s) => `• <#${s.threadId}>${s.title ? ` — **${s.title}**` : ""}`);
    const embed = new EmbedBuilder()
      .setTitle("Active Scenes")
      .setColor(0x57f287)
      .setDescription(lines.join("\n"));

    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // status / end must be used inside the thread
  const channel = interaction.channel;
  const isThread = !!channel && typeof channel.isThread === "function" && channel.isThread();
  if (!isThread) {
    await interaction.editReply("Use this inside a scene thread.");
    return;
  }

  const threadId = channel.id;
  const sceneDocRes = await getScene(guildId, threadId);
  if (!sceneDocRes.ok) {
    await interaction.editReply(`❌ ${sceneDocRes.error.message}`);
    return;
  }
  const scene = sceneDocRes.data;
  if (!scene) {
    await interaction.editReply("This thread is not a scene.");
    return;
  }

  if (sub === "status") {
    const recapStatus = String(scene.recapStatus ?? "");
    const recapLabel =
      recapStatus === "done"
        ? "✅ Ready"
        : recapStatus === "pending"
          ? "⏳ Pending"
          : recapStatus === "failed"
            ? `⚠️ Failed${scene.recapError ? `: ${truncateField(scene.recapError, 200)}` : ""}`
            : "—";

    const embed = new EmbedBuilder()
      .setTitle("Scene Status")
      .setColor(scene.active ? 0x57f287 : 0x99aab5)
      .setDescription(scene.title ? `**${scene.title}**` : "Untitled scene")
      .addFields(
        { name: "Active", value: scene.active ? "Yes" : "No", inline: true },
        { name: "Created by", value: `<@${scene.createdByUserId}>`, inline: true },
        { name: "Recap", value: recapLabel, inline: false },
        ...(scene.recap ? [{ name: "Recap text", value: truncateField(scene.recap, 900), inline: false }] : [])
      );
    await interaction.editReply({ embeds: [embed] });
    return;
  }

  // end
  if (!scene.active) {
    await interaction.editReply("This scene is already ended.");
    return;
  }

  const memberPerms = interaction.memberPermissions;
  const canEnd =
    scene.createdByUserId === interaction.user.id ||
    (memberPerms?.has?.(PermissionFlagsBits.ManageThreads) ?? false) ||
    (memberPerms?.has?.(PermissionFlagsBits.Administrator) ?? false);

  if (!canEnd) {
    await interaction.editReply("❌ Only the scene creator or an admin can end this scene.");
    return;
  }

  const endRes = await endScene({ guildId, threadId, endedByUserId: interaction.user.id });
  if (!endRes.ok) {
    await interaction.editReply(`❌ ${endRes.error.message}`);
    return;
  }

  let recapSaved = false;
  let recapPosted = false;
  let recapState: "done" | "failed" | "pending" = "pending";
  try {
    const recapRes = await generateSceneRecap({ thread: channel, title: scene.title ?? null });
    if (recapRes.ok) {
      const saveRes = await setSceneRecap({
        guildId,
        threadId,
        recap: recapRes.data.recap,
        messageCount: recapRes.data.messageCount,
        model: recapRes.data.model,
      });
      recapSaved = saveRes.ok;
      recapState = recapSaved ? "done" : "pending";

      try {
        const body = truncateForDiscord(recapRes.data.recap, 1800);
        if (body) {
          await channel.send(`📝 **Scene Recap**\n\n${body}`);
          recapPosted = true;
        }
      } catch {
        // Ignore recap post failures (missing perms, locked thread, etc.)
      }
    } else {
      await markSceneRecapFailed({ guildId, threadId, errorMessage: recapRes.error.message });
      recapState = "failed";
    }
  } catch (error: unknown) {
    await markSceneRecapFailed({
      guildId,
      threadId,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    recapState = "failed";
  }

  let archived = true;
  try {
    await channel.setArchived(true, "Scene ended");
  } catch {
    archived = false;
  }

  const recapNote =
    recapState === "done"
      ? (recapPosted ? "Recap posted + saved." : "Recap saved (couldn't post in thread).")
      : recapState === "failed"
        ? "Recap failed (will retry in background)."
        : "Recap pending (will retry in background).";
  const archiveNote = archived
    ? "Thread archived."
    : "Thread NOT archived (missing **Manage Threads** permission?).";
  await interaction.editReply(`✅ Scene ended. ${recapNote} ${archiveNote}`);
}

export default { data, execute };
