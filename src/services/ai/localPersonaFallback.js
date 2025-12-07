/**
 * Local Persona Fallback - Pure Node.js implementation
 * Uses training JSONL files for persona responses when AI services are unavailable.
 * This is a lightweight retrieval-based system using keyword matching.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Cache for loaded training data
let trainingCorpus = null;
let personaSamples = null;

/**
 * Load training data from JSONL files
 * @returns {Map<string, Array<{user: string, reply: string}>>}
 */
function loadTrainingData() {
  if (personaSamples) return personaSamples;

  const dataDir = path.resolve(__dirname, '../../../data/training');
  const files = [
    'final-complete-training-data.jsonl',
    'general-conversation-subset.jsonl',
    'multi-character-v2.jsonl',
    'supplemental-elio-bryce-caleb.jsonl',
    'main-characters-9k.jsonl',
  ];

  personaSamples = new Map();

  for (const file of files) {
    const filePath = path.join(dataDir, file);
    if (!fs.existsSync(filePath)) continue;

    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim());

      for (const line of lines) {
        try {
          const obj = JSON.parse(line);
          const messages = obj.messages || [];
          const meta = obj.metadata || {};

          const userMsg = messages.find(m => m.role === 'user')?.content || '';
          const assistantMsg = messages.find(m => m.role === 'assistant')?.content || '';
          const persona = (meta.character || meta.persona || 'default').toLowerCase();

          if (userMsg && assistantMsg) {
            if (!personaSamples.has(persona)) {
              personaSamples.set(persona, []);
            }
            personaSamples.get(persona).push({
              user: userMsg.toLowerCase(),
              reply: assistantMsg,
              keywords: extractKeywords(userMsg),
            });
          }
        } catch (parseErr) {
          // Skip malformed lines
        }
      }
    } catch (err) {
      console.warn(`[LocalFallback] Failed to load ${file}:`, err.message);
    }
  }

  console.log(`[LocalFallback] Loaded training data for ${personaSamples.size} personas`);
  for (const [persona, samples] of personaSamples) {
    console.log(`  - ${persona}: ${samples.length} samples`);
  }

  return personaSamples;
}

/**
 * Extract keywords from text for matching
 * @param {string} text
 * @returns {string[]}
 */
function extractKeywords(text) {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'must', 'can', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'up', 'about', 'into', 'over',
    'after', 'and', 'but', 'or', 'as', 'if', 'when', 'than', 'because',
    'while', 'although', 'where', 'there', 'so', 'what', 'which', 'who',
    'whom', 'this', 'that', 'these', 'those', 'i', 'you', 'he', 'she',
    'it', 'we', 'they', 'me', 'him', 'her', 'us', 'them', 'my', 'your',
    'his', 'its', 'our', 'their', 'mine', 'yours', 'hers', 'ours', 'theirs',
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 2 && !stopWords.has(word));
}

/**
 * Calculate keyword overlap score
 * @param {string[]} queryKeywords
 * @param {string[]} sampleKeywords
 * @returns {number}
 */
function calculateScore(queryKeywords, sampleKeywords) {
  if (queryKeywords.length === 0 || sampleKeywords.length === 0) return 0;

  const sampleSet = new Set(sampleKeywords);
  let matches = 0;

  for (const keyword of queryKeywords) {
    if (sampleSet.has(keyword)) {
      matches++;
    }
  }

  // Jaccard-like similarity
  return matches / (queryKeywords.length + sampleKeywords.length - matches);
}

/**
 * Find best matching responses for a query
 * @param {string} persona - Persona name
 * @param {string} query - User message
 * @param {number} topK - Number of candidates
 * @returns {Array<{reply: string, score: number}>}
 */
function findBestMatches(persona, query, topK = 5) {
  const samples = loadTrainingData();
  const personaKey = persona.toLowerCase();

  // Try exact persona match first, then 'default' pool
  let personaSampleList = samples.get(personaKey) || samples.get('default') || [];

  if (personaSampleList.length === 0) {
    // Fallback: combine all samples
    personaSampleList = [];
    for (const [, sampleList] of samples) {
      personaSampleList.push(...sampleList);
    }
  }

  const queryKeywords = extractKeywords(query);

  // Score all samples
  const scored = personaSampleList.map(sample => ({
    reply: sample.reply,
    score: calculateScore(queryKeywords, sample.keywords),
  }));

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Return top K
  return scored.slice(0, topK);
}

/**
 * Generate a response using local training data
 * @param {string} persona - Persona name
 * @param {string} message - User message
 * @param {object} options - Options
 * @returns {Promise<{ok: boolean, data?: object, error?: object}>}
 */
export async function localPersonaReply(persona, message, options = {}) {
  const { topK = 5 } = options;

  try {
    const matches = findBestMatches(persona, message, topK);

    if (matches.length === 0 || matches[0].score < 0.01) {
      // No good match found - return a generic persona-appropriate fallback
      return {
        ok: true,
        data: {
          text: getGenericResponse(persona),
          persona,
          strategy: 'local_generic',
          mood: 'neutral',
        },
      };
    }

    // Pick from top matches with some randomness (weighted by score)
    const totalScore = matches.reduce((sum, m) => sum + m.score, 0);
    let random = Math.random() * totalScore;
    let selected = matches[0];

    for (const match of matches) {
      random -= match.score;
      if (random <= 0) {
        selected = match;
        break;
      }
    }

    return {
      ok: true,
      data: {
        text: selected.reply,
        persona,
        strategy: 'local_retrieval',
        mood: 'neutral',
        source: {
          score: selected.score.toFixed(4),
        },
      },
    };
  } catch (error) {
    console.error('[LocalFallback] Error:', error.message);
    return {
      ok: false,
      error: {
        code: 'LOCAL_FALLBACK_ERROR',
        message: error.message,
      },
    };
  }
}

/**
 * Get a generic response when no match is found
 * @param {string} persona
 * @returns {string}
 */
function getGenericResponse(persona) {
  const genericResponses = {
    elio: [
      "*tilts head curiously* Hmm, that's interesting! Tell me more?",
      "*eyes light up* Oh wow, I haven't thought about that before!",
      "That's pretty cosmic! What do you think about it?",
    ],
    bryce: [
      "*nods thoughtfully* Interesting point you've got there.",
      "Hm, that's something to think about.",
      "*crosses arms* Fair enough, I see what you mean.",
    ],
    caleb: [
      "*smirks* Well, that's one way to look at it.",
      "Ha, didn't expect that. Go on.",
      "*leans back* Alright, you've got my attention.",
    ],
    glordon: [
      "*rumbles warmly* Ah, that is indeed curious.",
      "On my planet, we would find that quite fascinating!",
      "*tilts large head* Please, tell me more about this Earth concept.",
    ],
    olga: [
      "*sighs* Kids these days...",
      "*stern look* That's... actually not a bad point.",
      "Hmph. I suppose you're not entirely wrong.",
    ],
    default: [
      "*considers* That's an interesting thought.",
      "Hmm, I see what you mean.",
      "Tell me more about that!",
    ],
  };

  const personaKey = persona.toLowerCase();
  const responses = genericResponses[personaKey] || genericResponses.default;
  return responses[Math.floor(Math.random() * responses.length)];
}

export default { localPersonaReply };
