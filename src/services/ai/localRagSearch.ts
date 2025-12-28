// src/services/ai/localRagSearch.js
// ============================================================================
// Local RAG Search - Pure Node.js implementation for Elioverse knowledge
// Loads markdown files from data/rag-resources/ and provides keyword-based search
// ============================================================================

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { logger } from "../../util/logger.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAG_RESOURCES_DIR = path.resolve(__dirname, "../../../data/rag-resources");

// Cache for loaded RAG documents
type RagSection = {
  heading: string;
  content: string;
  keywords: string[];
};

type RagDocument = {
  title: string;
  source: string;
  content: string;
  keywords: string[];
  character: string | null;
  sections: RagSection[];
};

type RagSearchResult = {
  title: string;
  source: string;
  content: string;
  score: number;
  character: string | null;
};

let ragDocuments: RagDocument[] | null = null;

/**
 * Stop words for keyword extraction
 */
const STOP_WORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could",
  "should", "may", "might", "must", "can", "to", "of", "in", "for",
  "on", "with", "at", "by", "from", "up", "about", "into", "over",
  "after", "and", "but", "or", "as", "if", "when", "than", "because",
  "while", "although", "where", "there", "so", "what", "which", "who",
  "whom", "this", "that", "these", "those", "i", "you", "he", "she",
  "it", "we", "they", "me", "him", "her", "us", "them", "my", "your",
  "his", "its", "our", "their", "mine", "yours", "hers", "ours", "theirs",
  "how", "why", "not", "no", "yes", "just", "also", "very", "really",
  "more", "most", "some", "any", "all", "each", "every", "both", "few",
]);

/**
 * Extract keywords from text
 * @param {string} text
 * @returns {string[]}
 */
function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(word => word.length > 2 && !STOP_WORDS.has(word));
}

/**
 * Parse markdown frontmatter and content
 * @param {string} content - Raw markdown content
 * @returns {{ metadata: object, body: string }}
 */
function parseMarkdown(content: string): { metadata: Record<string, string>; body: string } {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  if (frontmatterMatch) {
    const frontmatterLines = (frontmatterMatch[1] ?? "").split("\n");
    const metadata: Record<string, string> = {};

    for (const line of frontmatterLines) {
      const colonIndex = line.indexOf(":");
      if (colonIndex > 0) {
        const key = line.slice(0, colonIndex).trim();
        const value = line.slice(colonIndex + 1).trim().replace(/^["']|["']$/g, "");
        metadata[key] = value;
      }
    }

    return { metadata, body: frontmatterMatch[2] ?? "" };
  }

  return { metadata: {}, body: content };
}

/**
 * Extract sections from markdown body
 * @param {string} body - Markdown body
 * @returns {Array<{heading: string, content: string}>}
 */
function extractSections(body: string) {
  const sections: Array<{ heading: string; content: string }> = [];
  const lines = body.split("\n");
  let currentHeading = "";
  let currentContent: string[] = [];

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/);

    if (headingMatch) {
      if (currentContent.length > 0) {
        sections.push({
          heading: currentHeading,
          content: currentContent.join("\n").trim(),
        });
      }
      currentHeading = headingMatch[2] ?? "";
      currentContent = [];
    } else {
      currentContent.push(line);
    }
  }

  // Add last section
  if (currentContent.length > 0) {
    sections.push({
      heading: currentHeading,
      content: currentContent.join("\n").trim(),
    });
  }

  return sections;
}

/**
 * Load all RAG documents from markdown files
 * @returns {Array<{title: string, source: string, content: string, keywords: string[], character?: string}>}
 */
function loadRagDocuments(): RagDocument[] {
  if (ragDocuments) return ragDocuments;

  ragDocuments = [];

  if (!fs.existsSync(RAG_RESOURCES_DIR)) {
    logger.warn("[LocalRAG] RAG resources directory not found", { path: RAG_RESOURCES_DIR });
    return ragDocuments;
  }

  const files = fs.readdirSync(RAG_RESOURCES_DIR).filter(f => f.endsWith(".md"));

  for (const file of files) {
    try {
      const filePath = path.join(RAG_RESOURCES_DIR, file);
      const raw = fs.readFileSync(filePath, "utf-8");
      const { metadata, body } = parseMarkdown(raw);
      const sections = extractSections(body);

      // Determine character name from filename or metadata
      let character: string | null = null;
      if (file.startsWith("character_")) {
        character = file
          .replace("character_", "")
          .replace(".md", "")
          .replace(/_/g, " ")
          .replace(/\b\w/g, c => c.toUpperCase());
      }

      // Create a document for the full file
      const fullContent = sections.map(s => s.content).join("\n");
      ragDocuments.push({
        title: metadata.title || file,
        source: file,
        content: fullContent,
        keywords: extractKeywords(fullContent),
        character,
        sections: sections.map(s => ({
          heading: s.heading,
          content: s.content,
          keywords: extractKeywords(s.content),
        })),
      });
    } catch (err: any) {
      logger.warn(`[LocalRAG] Failed to load ${file}`, { error: err?.message });
    }
  }

  logger.info(`[LocalRAG] Loaded ${ragDocuments.length} documents from ${RAG_RESOURCES_DIR}`);
  return ragDocuments;
}

/**
 * Calculate relevance score between query keywords and document keywords
 * @param {string[]} queryKeywords
 * @param {string[]} docKeywords
 * @returns {number}
 */
function calculateRelevance(queryKeywords: string[], docKeywords: string[]): number {
  if (queryKeywords.length === 0 || docKeywords.length === 0) return 0;

  const docSet = new Set(docKeywords);
  let matches = 0;
  let partialMatches = 0;

  for (const keyword of queryKeywords) {
    if (docSet.has(keyword)) {
      matches++;
    } else {
      // Check for partial matches (prefix matching)
      for (const docWord of docKeywords) {
        if (docWord.startsWith(keyword) || keyword.startsWith(docWord)) {
          partialMatches += 0.5;
          break;
        }
      }
    }
  }

  // Weighted Jaccard-like similarity
  const totalScore = matches + partialMatches;
  const unionSize = queryKeywords.length + docKeywords.length - matches;

  return totalScore / Math.max(unionSize, 1);
}

/**
 * Search RAG documents for relevant information
 * @param {string} query - Search query
 * @param {object} [options] - Search options
 * @param {number} [options.topK=3] - Number of results to return
 * @param {number} [options.minScore=0.05] - Minimum relevance score
 * @param {string} [options.character] - Filter by character name
 * @returns {Array<{title: string, content: string, score: number, character?: string}>}
 */
export function searchRag(
  query: string,
  options: { topK?: number; minScore?: number; character?: string | null } = {}
): RagSearchResult[] {
  const { topK = 3, minScore = 0.05, character } = options;
  const documents = loadRagDocuments();
  const queryKeywords = extractKeywords(query);

  if (queryKeywords.length === 0) {
    return [];
  }

  const results: RagSearchResult[] = [];

  for (const doc of documents) {
    // Filter by character if specified
    if (character && doc.character && !doc.character.toLowerCase().includes(character.toLowerCase())) {
      continue;
    }

    // Score the full document
    const docScore = calculateRelevance(queryKeywords, doc.keywords);

    // Also score individual sections for better precision
    let bestSection: RagSection | null = null;
    let bestSectionScore = 0;

    for (const section of doc.sections || []) {
      const sectionScore = calculateRelevance(queryKeywords, section.keywords);
      if (sectionScore > bestSectionScore) {
        bestSectionScore = sectionScore;
        bestSection = section;
      }
    }

    // Use the better score (full doc or best section)
    const finalScore = Math.max(docScore, bestSectionScore);

    if (finalScore >= minScore) {
      results.push({
        title: doc.title,
        source: doc.source,
        content: bestSection && bestSectionScore > docScore
          ? `## ${bestSection.heading}\n${bestSection.content}`.substring(0, 800)
          : doc.content.substring(0, 800),
        score: finalScore,
        character: doc.character,
      });
    }
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score);

  return results.slice(0, topK);
}

/**
 * Search RAG and format context for LLM prompt
 * @param {string} query - User's message
 * @param {string} [personaName] - Current persona name for filtering
 * @returns {{ context: string, sources: string[] }}
 */
export function getRagContext(query: string, personaName: string | null = null): { context: string; sources: string[] } {
  const results = searchRag(query, {
    topK: 3,
    minScore: 0.05,
    character: null, // Don't filter by character - get all relevant info
  });

  if (results.length === 0) {
    return { context: "", sources: [] };
  }

  const sources = results.map(r => r.title);

  // Format context for LLM
  const contextParts = results.map((r, i) => {
    const snippet = r.content
      .replace(/\n+/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 400);
    return `[${i + 1}] ${r.title}: ${snippet}`;
  });

  const context = `
---
ELIOVERSE KNOWLEDGE (use this to inform your response):
${contextParts.join("\n\n")}
---`;

  logger.debug("[LocalRAG] Context generated", {
    query: query.substring(0, 50),
    resultsCount: results.length,
    topScore: results[0]?.score.toFixed(3),
    sources,
  });

  return { context, sources };
}

/**
 * Check if a query is likely asking about Elioverse lore
 * @param {string} query
 * @returns {boolean}
 */
export function isLoreQuery(query: string): boolean {
  const loreKeywords = [
    "communiverse", "elio", "glordon", "bryce", "caleb", "olga", "grigon",
    "hylurg", "ambassador", "alien", "space", "camp carver", "pixar",
    "planet", "character", "who is", "what is", "tell me about",
    "what happened", "story", "movie", "film", "questa", "naos", "auva",
    "helix", "mira", "ooooo", "gunther", "melmac", "tegmen", "turais",
  ];

  const queryLower = query.toLowerCase();
  return loreKeywords.some(keyword => queryLower.includes(keyword));
}

/**
 * Force reload RAG documents (e.g., after file changes)
 */
export function reloadRagDocuments() {
  ragDocuments = null;
  loadRagDocuments();
  logger.info("[LocalRAG] Documents reloaded");
}

export default { searchRag, getRagContext, isLoreQuery, reloadRagDocuments };
