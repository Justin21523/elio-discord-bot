/**
 * Pronoun Filter - Fix third-person mistakes in persona responses
 *
 * This catches cases where the persona accidentally refers to themselves
 * in third person (e.g., "Caleb is..." instead of "I am...")
 */

/**
 * Remove training data format leakage (User:, Assistant:, Me:, etc.)
 * @param {string} text - Response text
 * @param {string} personaName - Optional persona name to filter out
 * @returns {string} - Cleaned text
 */
export function removeFormatLeakage(text, personaName = null) {
  if (!text) return text;

  let cleaned = text;

  // Pattern 1: Remove "User: ...\nMe: ..." or "User: ...\nAssistant: ..." formats
  cleaned = cleaned.replace(/^User:\s*.+?\n(?:Me|Assistant|AI):\s*/gm, '');

  // Pattern 2: Remove leading "Me: " or "Assistant: " or "AI: "
  cleaned = cleaned.replace(/^(?:Me|Assistant|AI|Character):\s*/gim, '');

  // Pattern 3: Remove "User: " at start
  cleaned = cleaned.replace(/^User:\s*/gim, '');

  // Pattern 4: Remove multi-line conversation formats
  cleaned = cleaned.replace(/(?:User|Me|Assistant|AI):\s*.+?\n/g, '');

  // Pattern 5: CRITICAL - Remove persona's own name with colon (e.g., "caleb: I don't...")
  if (personaName) {
    // Remove both lowercase and capitalized versions with colon
    const nameLower = personaName.toLowerCase();
    const nameCapitalized = personaName.charAt(0).toUpperCase() + personaName.slice(1).toLowerCase();

    // Pattern: "caleb: " or "Caleb: " anywhere in text (start of line, mid-sentence, etc.)
    const namePattern1 = new RegExp(`\\b${nameLower}:\\s*`, 'gi');
    const namePattern2 = new RegExp(`\\b${nameCapitalized}:\\s*`, 'g');
    cleaned = cleaned.replace(namePattern1, '');
    cleaned = cleaned.replace(namePattern2, '');
  }

  // Pattern 6: Clean up any remaining colons at line starts that look like labels
  cleaned = cleaned.replace(/^[A-Z][a-z]+:\s+/gm, '');

  if (cleaned !== text) {
    console.log('[INT] Format leakage detected and removed');
    console.log(`[INT] Before: ${text.substring(0, 100)}...`);
    console.log(`[INT] After:  ${cleaned.substring(0, 100)}...`);
  }

  return cleaned.trim();
}

/**
 * Fix third-person pronoun mistakes in response
 * @param {string} text - Response text
 * @param {string} personaName - Name of the persona speaking
 * @returns {string} - Corrected text
 */
export function fixThirdPersonPronouns(text, personaName) {
  if (!text || !personaName) return text;

  let corrected = text;
  const name = personaName;
  const nameLower = name.toLowerCase();

  // Pattern 1: "Caleb is..." -> "I am..."
  const isPattern = new RegExp(`\\b${name}\\s+is\\b`, 'gi');
  corrected = corrected.replace(isPattern, 'I am');

  // Pattern 2: "Caleb has..." -> "I have..."
  const hasPattern = new RegExp(`\\b${name}\\s+has\\b`, 'gi');
  corrected = corrected.replace(hasPattern, 'I have');

  // Pattern 3: "Caleb was..." -> "I was..."
  const wasPattern = new RegExp(`\\b${name}\\s+was\\b`, 'gi');
  corrected = corrected.replace(wasPattern, 'I was');

  // Pattern 4: "Caleb can..." -> "I can..."
  const canPattern = new RegExp(`\\b${name}\\s+can\\b`, 'gi');
  corrected = corrected.replace(canPattern, 'I can');

  // Pattern 5: "Caleb's..." -> "My..." or "I'm..."
  const possessivePattern = new RegExp(`\\b${name}'s\\b`, 'gi');
  corrected = corrected.replace(possessivePattern, (match, offset, string) => {
    // Check if it's followed by a noun (possessive) or verb (contraction)
    const nextWord = string.slice(offset + match.length).trim().split(/\s+/)[0];
    const verbWords = ['been', 'going', 'doing', 'trying', 'learning', 'feeling'];

    if (verbWords.includes(nextWord?.toLowerCase())) {
      return "I'm";
    }
    return 'my';
  });

  // Pattern 6: "He is..." / "She is..." when clearly about self
  // Only replace at start of sentence or after punctuation to avoid breaking references to others
  const heIsPattern = /(?:^|[.!?]\s+)He\s+is\b/g;
  corrected = corrected.replace(heIsPattern, (match) => {
    return match.replace('He is', 'I am');
  });

  const sheIsPattern = /(?:^|[.!?]\s+)She\s+is\b/g;
  corrected = corrected.replace(sheIsPattern, (match) => {
    return match.replace('She is', 'I am');
  });

  // Pattern 7: "He has..." / "She has..."
  const heHasPattern = /(?:^|[.!?]\s+)He\s+has\b/g;
  corrected = corrected.replace(heHasPattern, (match) => {
    return match.replace('He has', 'I have');
  });

  const sheHasPattern = /(?:^|[.!?]\s+)She\s+has\b/g;
  corrected = corrected.replace(sheHasPattern, (match) => {
    return match.replace('She has', 'I have');
  });

  // Pattern 8: "His..." / "Her..." at sentence start -> "My..."
  const hisPattern = /(?:^|[.!?]\s+)His\s+/g;
  corrected = corrected.replace(hisPattern, (match) => {
    return match.replace('His', 'My');
  });

  const herPattern = /(?:^|[.!?]\s+)Her\s+/g;
  corrected = corrected.replace(herPattern, (match) => {
    return match.replace('Her', 'My');
  });

  // Pattern 9: "him" / "her" when talking about self
  // This is trickier - only at sentence boundaries
  const himPattern = /(?:^|[.!?]\s+)\w+\s+(?:told|asked|gave|showed)\s+him\b/gi;
  corrected = corrected.replace(himPattern, (match) => {
    return match.replace(/\bhim\b/i, 'me');
  });

  const herObjPattern = /(?:^|[.!?]\s+)\w+\s+(?:told|asked|gave|showed)\s+her\b/gi;
  corrected = corrected.replace(herObjPattern, (match) => {
    return match.replace(/\bher\b/i, 'me');
  });

  // Pattern 10: "[Name] says" / "[Name] thinks" / "[Name] feels" -> direct first person
  const saysPattern = new RegExp(`\\b${name}\\s+(?:says|thinks|feels|believes|knows)\\b`, 'gi');
  corrected = corrected.replace(saysPattern, (match) => {
    if (/says/i.test(match)) return ''; // Remove "says" entirely - just speak directly
    if (/thinks/i.test(match)) return 'I think';
    if (/feels/i.test(match)) return 'I feel';
    if (/believes/i.test(match)) return 'I believe';
    if (/knows/i.test(match)) return 'I know';
    return match;
  });

  // Pattern 11: "[Name] would" -> "I would"
  const wouldPattern = new RegExp(`\\b${name}\\s+would\\b`, 'gi');
  corrected = corrected.replace(wouldPattern, 'I would');

  // Pattern 12: "as [Name]" -> remove (meta-narration about role)
  const asNamePattern = new RegExp(`\\bas\\s+${name}\\b`, 'gi');
  corrected = corrected.replace(asNamePattern, '');

  // Pattern 13: "that character" or "this character" -> remove
  corrected = corrected.replace(/\b(?:that|this)\s+character\b/gi, '');

  // Log if corrections were made
  if (corrected !== text) {
    console.log(`[INT] Pronoun filter corrected third-person for ${name}`);
    console.log(`[INT] Before: ${text.substring(0, 100)}...`);
    console.log(`[INT] After:  ${corrected.substring(0, 100)}...`);
  }

  return corrected;
}

/**
 * Check if response contains third-person mistakes
 * @param {string} text - Response text
 * @param {string} personaName - Name of the persona
 * @returns {boolean} - True if third-person detected
 */
export function detectThirdPerson(text, personaName) {
  if (!text || !personaName) return false;

  const patterns = [
    new RegExp(`\\b${personaName}\\s+(?:is|was|has|can|will)\\b`, 'i'),
    new RegExp(`\\b${personaName}'s\\b`, 'i'),
    new RegExp(`\\b${personaName}\\s+(?:says|thinks|feels|believes|knows|would)\\b`, 'i'),
    new RegExp(`\\bas\\s+${personaName}\\b`, 'i'),
    /\b(?:he|she)\s+(?:is|was|has|can|will)\b/i,
    /\b(?:his|her)\s+\w+/i,
    /\b(?:that|this)\s+character\b/i,
  ];

  for (const pattern of patterns) {
    if (pattern.test(text)) {
      return true;
    }
  }

  return false;
}

/**
 * Ensure text ends with a complete sentence
 * If text doesn't end with sentence terminator, trim back to last complete sentence
 * @param {string} text - Response text
 * @returns {string} - Text ending with complete sentence
 */
export function ensureCompleteSentence(text) {
  if (!text) return text;

  const trimmed = text.trim();

  // Check if already ends with sentence terminator
  const sentenceEnders = ['.', '!', '?', '…', '。', '！', '？'];
  const lastChar = trimmed[trimmed.length - 1];

  if (sentenceEnders.includes(lastChar)) {
    return trimmed;
  }

  // Find last sentence terminator
  let lastSentenceEnd = -1;
  for (let i = trimmed.length - 1; i >= 0; i--) {
    if (sentenceEnders.includes(trimmed[i])) {
      lastSentenceEnd = i;
      break;
    }
  }

  // If found a sentence terminator, cut there
  if (lastSentenceEnd >= 0) {
    const truncated = trimmed.substring(0, lastSentenceEnd + 1);
    console.log('[INT] Truncated incomplete sentence - ensuring complete ending');
    console.log(`[INT] Before: ${trimmed.substring(Math.max(0, trimmed.length - 50))}...`);
    console.log(`[INT] After:  ${truncated.substring(Math.max(0, truncated.length - 50))}`);
    return truncated;
  }

  // If no sentence terminator found at all, add one
  // This shouldn't happen often if LLM is working properly
  console.log('[WARN] No sentence terminator found in response, adding period');
  return trimmed + '.';
}

/**
 * Get pronoun filter statistics
 * @param {string} original - Original text
 * @param {string} filtered - Filtered text
 * @returns {object} - Statistics
 */
export function getFilterStats(original, filtered) {
  return {
    changed: original !== filtered,
    originalLength: original.length,
    filteredLength: filtered.length,
    corrections: original === filtered ? 0 : 1
  };
}
