/**
 * services/sceneRecapGenerator.ts
 * Shared helper to generate a scene recap from a Discord thread.
 * All code/comments in English only.
 */

import { ok, err } from "../util/result.js";
import type { Result } from "../util/result.js";
import { generate as llmGenerate } from "./ai/llm.js";

const MAX_MESSAGES_TO_SUMMARIZE = 120;
const MAX_TRANSCRIPT_CHARS = 12_000;

function safeTrim(text: string, maxChars: number): string {
  const t = String(text ?? "");
  if (t.length <= maxChars) return t;
  return t.slice(0, Math.max(0, maxChars - 12)) + "\n…(truncated)";
}

function buildTranscript(messagesAsc: any[]): { transcript: string; messageCount: number } {
  const lines: string[] = [];
  let included = 0;

  for (const m of messagesAsc) {
    if (!m) continue;
    if (m?.author?.bot && !m?.webhookId) continue;

    const author =
      (m?.author?.username ? String(m.author.username) : null) ||
      (m?.author?.tag ? String(m.author.tag) : null) ||
      "User";

    let content = String(m?.cleanContent ?? m?.content ?? "").trim();
    if (!content) {
      const hasAttachment = (m?.attachments?.size ?? 0) > 0;
      const hasEmbeds = Array.isArray(m?.embeds) && m.embeds.length > 0;
      if (hasAttachment || hasEmbeds) content = "[non-text message]";
    }
    if (!content) continue;

    // Skip obvious command invocations to keep summaries clean
    if (/^\s*\/(scene|assistant|help|ai|persona|minigame|greet)\b/i.test(content)) continue;

    lines.push(`${author}: ${content}`);
    included += 1;
  }

  const transcript = safeTrim(lines.join("\n"), MAX_TRANSCRIPT_CHARS);
  return { transcript, messageCount: included };
}

function buildPrompt(params: { title?: string | null; transcript: string }): { system: string; prompt: string } {
  const titleLine = params.title ? `Scene title: ${params.title}\n` : "";
  return {
    system:
      "You create concise, accurate recaps of Discord roleplay scenes. " +
      "Do not invent events. Avoid sensitive personal info. Keep it fun and readable.",
    prompt:
      `${titleLine}` +
      "Summarize the scene as:\n" +
      "1) A 1-line premise\n" +
      "2) 3-6 bullet points of key events\n" +
      "3) Characters involved (comma-separated)\n" +
      "4) 1-3 hooks for what could happen next\n\n" +
      "Transcript:\n" +
      params.transcript,
  };
}

export async function generateSceneRecap(params: {
  thread: any;
  title?: string | null;
}): Promise<Result<{ recap: string; messageCount: number; model: string | null }>> {
  try {
    const { thread, title } = params;
    if (!thread || typeof thread?.messages?.fetch !== "function") {
      return err("BAD_REQUEST", "thread must be a text-based channel with messages.fetch()");
    }

    const messageCollection = await thread.messages.fetch({ limit: MAX_MESSAGES_TO_SUMMARIZE }).catch(() => null);
    const messages = messageCollection ? Array.from(messageCollection.values()) : [];
    if (messages.length < 8) {
      return err("VALIDATION_FAILED", `Not enough messages to summarize (${messages.length})`);
    }

    const messagesAsc = messages.slice().reverse();
    const { transcript, messageCount } = buildTranscript(messagesAsc);
    if (!transcript || messageCount < 8) {
      return err("VALIDATION_FAILED", "Not enough text content to summarize");
    }

    const { system, prompt } = buildPrompt({ title: title ?? null, transcript });
    const summaryResult = await llmGenerate({
      prompt,
      system,
      maxTokens: 450,
      temperature: 0.4,
    });

    if (!summaryResult.ok) {
      return err(summaryResult.error?.code || "AI_MODEL_ERROR", summaryResult.error?.message || "AI summary failed", summaryResult.error);
    }

    const recap = String(summaryResult.data?.text ?? "").trim();
    if (!recap) return err("AI_MODEL_ERROR", "Empty recap output");

    const model = summaryResult.data?.model ? String(summaryResult.data.model) : null;
    return ok({ recap, messageCount, model });
  } catch (cause) {
    return err("UNKNOWN", "Failed to generate scene recap", cause);
  }
}

export default { generateSceneRecap };

