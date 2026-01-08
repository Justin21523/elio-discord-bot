/**
 * util/rpPrefix.ts
 * RP prefix parsing for full-mode auto-replies.
 * All code/comments in English only.
 */

export type RpPrefixResult =
  | { isRp: false }
  | { isRp: true; rpAsPersona: string; messageContent: string };

type PersonaRef = { name: string };

/**
 * Detect if user is RPing as a persona using "personaName:" prefix format (lowercase only).
 * This triggers a response even without @mentioning the bot.
 *
 * Rules:
 * - Prefix must be lowercase as typed (e.g. "caleb: ...")
 * - Prefix must start with a lowercase letter (reduces accidental triggers)
 * - Supports ":" and fullwidth "："
 * - Supports multi-word persona names (exact match)
 */
export function detectRpPrefix(content: string, personaList: PersonaRef[]): RpPrefixResult {
  const sepIndex = String(content ?? "").search(/[:：]/);
  if (sepIndex <= 0) return { isRp: false };

  const potentialNameRaw = String(content ?? "").slice(0, sepIndex).trim();
  const messageContentRaw = String(content ?? "").slice(sepIndex + 1).trim();
  if (!potentialNameRaw || !messageContentRaw) return { isRp: false };

  if (potentialNameRaw !== potentialNameRaw.toLowerCase()) return { isRp: false };
  if (!/^[a-z]/.test(potentialNameRaw)) return { isRp: false };

  const potentialName = potentialNameRaw.toLowerCase();
  for (const p of personaList) {
    if (String(p?.name ?? "").toLowerCase() === potentialName) {
      return { isRp: true, rpAsPersona: String(p.name), messageContent: messageContentRaw };
    }
  }

  return { isRp: false };
}

export default { detectRpPrefix };

