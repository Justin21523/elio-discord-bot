/**
 * services/conversationHistory.js
 * Manage conversation history for context-aware multi-persona interactions
 */

// In-memory conversation history
// CRITICAL: Structure per USER to prevent cross-contamination
// Structure: Map<channelId, Map<userId, Map<personaName, Array<{role, content, timestamp}>>>>
type HistoryMessage = {
  role: string;
  content: string;
  timestamp: number;
};

const conversations = new Map<string, Map<string, Map<string, HistoryMessage[]>>>();

const MAX_HISTORY_PER_PERSONA = 10; // Keep last 10 messages per persona per user
const HISTORY_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Add a message to conversation history (CRITICAL: per-user isolation)
 */
export function addMessage(
  channelId: string,
  userId: string,
  personaName: string,
  role: string,
  content: string
) {
  if (!conversations.has(channelId)) {
    conversations.set(channelId, new Map());
  }

  const channelConvos = conversations.get(channelId)!;

  if (!channelConvos.has(userId)) {
    channelConvos.set(userId, new Map());
  }

  const userConvos = channelConvos.get(userId)!;

  if (!userConvos.has(personaName)) {
    userConvos.set(personaName, []);
  }

  const personaHistory = userConvos.get(personaName)!;

  personaHistory.push({
    role, // 'user' or 'assistant'
    content,
    timestamp: Date.now(),
  });

  // Keep only recent messages
  if (personaHistory.length > MAX_HISTORY_PER_PERSONA) {
    personaHistory.shift();
  }
}

/**
 * Get conversation context for a persona in a channel (CRITICAL: per-user)
 */
export function getContext(
  channelId: string,
  userId: string,
  personaName: string,
  limit = 5
): HistoryMessage[] {
  const channelConvos = conversations.get(channelId);
  if (!channelConvos) return [];

  const userConvos = channelConvos.get(userId);
  if (!userConvos) return [];

  const personaHistory = userConvos.get(personaName);
  if (!personaHistory || personaHistory.length === 0) return [];

  // Clean old messages
  const now = Date.now();
  const filtered = personaHistory.filter((msg) => now - msg.timestamp < HISTORY_TTL_MS);

  // Update the stored history
  if (filtered.length !== personaHistory.length) {
    userConvos.set(personaName, filtered);
  }

  // Return last N messages
  return filtered.slice(-limit);
}

/**
 * Get formatted context string for prompt
 * Uses narrative format to avoid training data leakage
 */
export function getContextString(
  channelId: string,
  userId: string,
  personaName: string,
  limit = 5
): string {
  const history = getContext(channelId, userId, personaName, limit);

  if (history.length === 0) return "";

  // Format as natural conversation narrative to avoid "user:/assistant:" patterns
  const parts = [];
  for (let i = 0; i < history.length; i++) {
    const msg = history[i]!;
    if (msg.role === 'user') {
      parts.push(`They asked: "${msg.content}"`);
    } else {
      parts.push(`You replied: "${msg.content}"`);
    }
  }

  return `Recent conversation:\n${parts.join('\n')}`;
}

/**
 * Clear history for a channel
 */
export function clearChannel(channelId: string) {
  conversations.delete(channelId);
}

/**
 * Clear history for a specific persona in a channel
 */
export function clearPersona(channelId: string, personaName: string) {
  const channelConvos = conversations.get(channelId);
  if (channelConvos) {
    for (const userConvos of channelConvos.values()) {
      userConvos.delete(personaName);
    }
  }
}

/**
 * Get all personas active in a channel (for debugging)
 */
export function getActivePersonas(channelId: string): string[] {
  const channelConvos = conversations.get(channelId);
  if (!channelConvos) return [];

  const set = new Set<string>();
  for (const userConvos of channelConvos.values()) {
    for (const personaName of userConvos.keys()) {
      set.add(personaName);
    }
  }
  return Array.from(set.values());
}

/**
 * Cleanup old conversations periodically
 * Structure: Map<channelId, Map<userId, Map<personaName, Array>>>
 */
function cleanupOldConversations() {
  const now = Date.now();

  for (const [channelId, channelConvos] of conversations.entries()) {
    for (const [userId, userConvos] of channelConvos.entries()) {
      for (const [personaName, history] of userConvos.entries()) {
        // Ensure history is an array before filtering
        if (!Array.isArray(history)) {
          userConvos.delete(personaName);
          continue;
        }

        const filtered = history.filter((msg) => now - msg.timestamp < HISTORY_TTL_MS);

        if (filtered.length === 0) {
          userConvos.delete(personaName);
        } else if (filtered.length !== history.length) {
          userConvos.set(personaName, filtered);
        }
      }

      // Remove empty user entries
      if (userConvos.size === 0) {
        channelConvos.delete(userId);
      }
    }

    // Remove empty channel entries
    if (channelConvos.size === 0) {
      conversations.delete(channelId);
    }
  }
}

// Run cleanup every 10 minutes
setInterval(cleanupOldConversations, 10 * 60 * 1000);

export default {
  addMessage,
  getContext,
  getContextString,
  clearChannel,
  clearPersona,
  getActivePersonas
};
