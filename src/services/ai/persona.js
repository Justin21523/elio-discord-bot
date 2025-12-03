// Persona compose Facade. English-only.
import { httpPostJson } from './_client.js';

export async function compose(text, persona, options = {}) {
  const {
    maxTokens = 80, // Default to concise responses (~320 chars)
    context = '',
    conversationHistory = [],
    useFinetuned = true
  } = options;

  // Build clean persona object with only needed fields
  let systemPrompt = persona.system_prompt || '';

  // ONLY append RAG context if available (background knowledge)
  // DO NOT append conversation history to system_prompt (causes prompt leakage)
  if (context) {
    systemPrompt += `\n\n[Context from knowledge base: ${context.substring(0, 300)}...]`;
  }

  // CRITICAL: Add explicit instruction to prevent training data leakage and third-person
  systemPrompt += `\n\nCRITICAL RULES (YOU MUST FOLLOW):
1. YOU ARE ${persona.name} - speak ONLY in first person (I, me, my)
2. NEVER refer to yourself as "${persona.name}", "he", "she", or "that character"
3. NEVER narrate your own actions like "${persona.name} says" or "${persona.name} thinks"
4. NEVER talk to yourself or about yourself from outside perspective
5. NEVER use conversation formats like "User:", "Me:", "Assistant:", or any meta labels
6. Respond DIRECTLY as yourself in real conversation - no stage directions or narration
7. Keep responses VERY concise (1-3 sentences maximum) - ALWAYS end with complete sentence
8. IMPORTANT: Always finish your thoughts completely before stopping - never leave sentences unfinished
9. Show clear self-awareness - you ARE this character living their life, not describing someone else
10. CRITICAL: If you don't know something or the question isn't related to you, say so HONESTLY - NEVER make things up or pretend to know
11. Stay in character but be truthful - it's okay to say "I don't know" or "That's not really my thing"`;

  // Create clean persona object with only needed fields (no MongoDB _id, etc.)
  const enhancedPersona = {
    name: persona.name,
    system_prompt: systemPrompt
  };

  // Cap max_length to reasonable limit (50-500)
  // Note: AI service treats this as TOKEN count, not character count
  // 80 tokens ≈ 320 chars (very short), 100 tokens ≈ 400 chars
  const defaultMaxLength = 80; // ~320 chars, very concise
  const cappedMaxLength = Math.min(Math.max(maxTokens || defaultMaxLength, 50), 100); // Max 100 tokens (~400 chars, ultra-short)

  const requestBody = {
    text,
    persona: enhancedPersona,
    max_length: cappedMaxLength,
    use_finetuned: useFinetuned
  };

  console.log('[DEBUG] Sending persona.compose request:', JSON.stringify({
    text: text.substring(0, 50) + '...',
    persona: { name: enhancedPersona.name, has_system_prompt: !!enhancedPersona.system_prompt },
    max_length: cappedMaxLength
  }));

  const res = await httpPostJson('/persona/compose', requestBody);

  if (res.status >= 400 || !res.json?.ok) {
    console.error('[ERR] Persona compose API error:', res.status, res.json);
    return { ok: false, error: { code: 'AI_MODEL_ERROR', message: 'Persona compose failed', cause: res.json } };
  }
  return { ok: true, data: res.json };
}
