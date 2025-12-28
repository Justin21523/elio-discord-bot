/**
 * TrainingDataLoader.js
 * Loads and processes training data for use in minigames
 * Provides rich, varied content from 16,000+ training samples
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { logger } from "../../util/logger.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRAINING_DATA_DIR = join(__dirname, "../../../data/training");

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

// In-memory cache for loaded training data
let trainingData: any[] | null = null;
let triviaQuestions: any[] | null = null;
let irDocuments: any[] | null = null;
let storySeeds: any[] | null = null;
let pmiCorpus: { tokens: string[]; tokenCounts: Map<string, number>; totalTokens: number } | null = null;

// Character mapping for consistent naming
const CHARACTER_ALIASES = {
  "Elio Solis": ["Elio", "elio", "Elio Solis"],
  "Glordon": ["Glordon", "glordon"],
  "Caleb": ["Caleb", "caleb"],
  "Bryce Markwell": ["Bryce", "bryce", "Bryce Markwell"],
};

/**
 * Load all training data files
 * Call this once at startup
 */
export async function loadAll() {
  if (trainingData) {
    logger.info("[TrainingDataLoader] Already loaded, skipping");
    return { ok: true, data: { count: trainingData.length } };
  }

  logger.info("[TrainingDataLoader] Loading training data...");

  const files = [
    "main-characters-9k.jsonl",
    "final-complete-training-data.jsonl",
    "fandom-first-person-training-data.jsonl",
    "multi-character-v2.jsonl",
    "supplemental-elio-bryce-caleb.jsonl",
  ];

  trainingData = [];

  for (const file of files) {
    const filePath = join(TRAINING_DATA_DIR, file);
    if (!existsSync(filePath)) {
      logger.warn(`[TrainingDataLoader] File not found: ${file}`);
      continue;
    }

    try {
      const content = readFileSync(filePath, "utf-8");
      const lines = content.trim().split("\n");

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const sample = JSON.parse(line);
          if (sample.messages && Array.isArray(sample.messages)) {
            trainingData.push(sample);
          }
        } catch (parseError) {
          // Skip malformed lines
        }
      }

      logger.info(`[TrainingDataLoader] Loaded ${lines.length} samples from ${file}`);
    } catch (error) {
      logger.error(`[TrainingDataLoader] Error loading ${file}:`, { error: getErrorMessage(error) });
    }
  }

  logger.info(`[TrainingDataLoader] Total samples loaded: ${trainingData.length}`);

  // Pre-process data for different game types
  await preprocessForGames();

  return { ok: true, data: { count: trainingData.length } };
}

/**
 * Pre-process training data for different game types
 */
async function preprocessForGames() {
  logger.info("[TrainingDataLoader] Pre-processing for games...");

  // Generate trivia questions from Q&A pairs
  triviaQuestions = [];
  irDocuments = [];
  storySeeds = [];
  const allText: string[] = [];

  if (!trainingData) {
    pmiCorpus = { tokens: [], tokenCounts: new Map(), totalTokens: 0 };
    return;
  }

  for (const sample of trainingData) {
    const messages = sample.messages as any[];
    const metadata = sample.metadata || {};
    const character = metadata.character || "Unknown";

    // Find user question and assistant answer
    const userMsg = messages.find((m: any) => m.role === "user");
    const assistantMsg = messages.find((m: any) => m.role === "assistant");

    if (userMsg && assistantMsg) {
      const question = userMsg.content;
      const answer = assistantMsg.content;

      // Add to trivia if it looks like a Q&A
      if (question.includes("?") && answer.length > 20 && answer.length < 500) {
        triviaQuestions.push({
          character,
          scenario: metadata.scenario || "general",
          question: cleanText(question),
          answer: cleanText(answer),
          // Generate wrong options based on other characters' answers
          wrongOptions: [],
        });
      }

      // Add to IR documents
      if (answer.length > 50) {
        irDocuments.push({
          id: `train_${irDocuments.length}`,
          character,
          scenario: metadata.scenario || "general",
          text: answer,
          passage: answer,
          answer: character, // The "answer" for IR games is identifying the character/topic
        });
      }

      // Extract story seeds (first sentences)
      const firstSentence = extractFirstSentence(answer);
      if (firstSentence && firstSentence.length > 20 && firstSentence.length < 150) {
        storySeeds.push({
          character,
          seed: firstSentence,
        });
      }

      // Collect all text for PMI corpus
      allText.push(answer);
    }
  }

  // Generate wrong options for trivia
  generateWrongOptions();

  // Build PMI corpus
  pmiCorpus = buildCorpus(allText);

  logger.info(`[TrainingDataLoader] Processed:
    - Trivia questions: ${triviaQuestions.length}
    - IR documents: ${irDocuments.length}
    - Story seeds: ${storySeeds.length}
    - PMI corpus tokens: ${pmiCorpus.tokens.length}`);
}

/**
 * Generate wrong options for trivia by sampling other answers
 */
function generateWrongOptions() {
  if (!triviaQuestions) return;
  for (const q of triviaQuestions) {
    // Find 3 other answers from different scenarios/characters
    const others = triviaQuestions
      .filter(other =>
        other !== q &&
        (other.character !== q.character || other.scenario !== q.scenario)
      )
      .map(other => other.answer);

    // Shuffle and take 3
    shuffleArray(others);
    q.wrongOptions = others.slice(0, 3);
  }
}

/**
 * Build corpus for PMI games
 */
function buildCorpus(texts: string[]) {
  const tokenCounts = new Map<string, number>();
  const allTokens: string[] = [];

  for (const text of texts) {
    const tokens = text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(t => t.length > 3);

    for (const token of tokens) {
      tokenCounts.set(token, (tokenCounts.get(token) || 0) + 1);
      allTokens.push(token);
    }
  }

  // Get unique tokens that appear more than once
  const tokens = [...tokenCounts.entries()]
    .filter(([_, count]) => count > 1)
    .map(([token]) => token);

  return {
    tokens,
    tokenCounts,
    totalTokens: allTokens.length,
  };
}

/**
 * Get random trivia questions
 * @param {number} count - Number of questions to return
 * @param {string} character - Optional character filter
 * @returns {Array} Array of trivia questions
 */
export function getRandomTrivia(count = 5, character: string | null = null) {
  if (!triviaQuestions || triviaQuestions.length === 0) {
    return [];
  }

  let pool = triviaQuestions;
  if (character) {
    pool = triviaQuestions.filter(q =>
      q.character.toLowerCase().includes(character.toLowerCase())
    );
  }

  if (pool.length === 0) return [];

  // Shuffle and return
  const shuffled = [...pool];
  shuffleArray(shuffled);

  return shuffled.slice(0, Math.min(count, shuffled.length)).map(q => ({
    question: q.question,
    correctAnswer: truncateAnswer(q.answer),
    wrongOptions: q.wrongOptions.slice(0, 3).map(truncateAnswer),
    character: q.character,
    scenario: q.scenario,
  }));
}

/**
 * Get random passages/documents for IR games
 * @param {number} count - Number of documents to return
 * @returns {Array} Array of documents
 */
export function getRandomPassages(count = 10) {
  if (!irDocuments || irDocuments.length === 0) {
    return [];
  }

  const shuffled = [...irDocuments];
  shuffleArray(shuffled);

  return shuffled.slice(0, Math.min(count, shuffled.length));
}

/**
 * Get documents for a specific character
 * @param {string} character - Character name
 * @returns {Array} Array of documents
 */
export function getCharacterDocuments(character: string) {
  if (!irDocuments || irDocuments.length === 0) {
    return [];
  }

  return irDocuments.filter(doc =>
    doc.character.toLowerCase().includes(character.toLowerCase())
  );
}

/**
 * Get random story seeds
 * @param {number} count - Number of seeds to return
 * @returns {Array} Array of story seeds
 */
export function getRandomStorySeeds(count = 10) {
  if (!storySeeds || storySeeds.length === 0) {
    return [];
  }

  const shuffled = [...storySeeds];
  shuffleArray(shuffled);

  return shuffled.slice(0, Math.min(count, shuffled.length));
}

/**
 * Get PMI corpus data
 * @returns {Object} Corpus with tokens and counts
 */
export function getPMICorpus() {
  return pmiCorpus || { tokens: [], tokenCounts: new Map(), totalTokens: 0 };
}

/**
 * Get random tokens from corpus for PMI games
 * @param {number} count - Number of tokens to return
 * @returns {Array} Array of tokens
 */
export function getRandomTokens(count = 50) {
  if (!pmiCorpus || pmiCorpus.tokens.length === 0) {
    return [];
  }

  const shuffled = [...pmiCorpus.tokens];
  shuffleArray(shuffled);

  return shuffled.slice(0, Math.min(count, shuffled.length));
}

/**
 * Get all dialogue for a specific character
 * @param {string} character - Character name
 * @returns {Array} Array of dialogue samples
 */
export function getCharacterDialogue(character: string) {
  if (!trainingData || trainingData.length === 0) {
    return [];
  }

  return trainingData.filter(sample => {
    const meta = sample.metadata || {};
    return meta.character &&
      meta.character.toLowerCase().includes(character.toLowerCase());
  });
}

/**
 * Check if data is loaded
 */
export function isLoaded() {
  return trainingData !== null && trainingData.length > 0;
}

/**
 * Get statistics about loaded data
 */
export function getStats() {
  return {
    totalSamples: trainingData?.length || 0,
    triviaQuestions: triviaQuestions?.length || 0,
    irDocuments: irDocuments?.length || 0,
    storySeeds: storySeeds?.length || 0,
    pmiTokens: pmiCorpus?.tokens?.length || 0,
  };
}

// ============================================================================
// Utility functions
// ============================================================================

function cleanText(text: string) {
  return text
    .replace(/\*[^*]+\*/g, "") // Remove action markers like *smiles*
    .replace(/\s+/g, " ")
    .trim();
}

function extractFirstSentence(text: string) {
  const cleaned = cleanText(text);
  const match = cleaned.match(/^[^.!?]+[.!?]/);
  return match ? match[0].trim() : null;
}

function truncateAnswer(text: string, maxLength = 100) {
  const cleaned = cleanText(text);
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.substring(0, maxLength - 3) + "...";
}

function shuffleArray<T>(array: T[]) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = array[i]!;
    array[i] = array[j]!;
    array[j] = a;
  }
  return array;
}

// Default export with all methods
export default {
  loadAll,
  isLoaded,
  getStats,
  getRandomTrivia,
  getRandomPassages,
  getCharacterDocuments,
  getRandomStorySeeds,
  getPMICorpus,
  getRandomTokens,
  getCharacterDialogue,
};
