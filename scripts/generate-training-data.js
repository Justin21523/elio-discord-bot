#!/usr/bin/env node
/**
 * Generate training dataset from RAG markdown files
 * Converts character bios, world lore, and FAQs into Q&A pairs for fine-tuning
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RAG_DIR = path.join(__dirname, '../data/rag-resources');
const OUTPUT_DIR = path.join(__dirname, '../data/training-datasets');
const AI_API_URL = process.env.AI_API_BASE_URL || 'http://localhost:8000';

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * Generate Q&A pairs from markdown content using AI
 */
async function generateQAPairs(content, source, category) {
  try {
    const prompt = `You are a dataset generator for the Communiverse universe.

Given the following document, generate 5-10 diverse question-answer pairs that could be used to train a chatbot.

Requirements:
1. Questions should be natural and varied (who, what, where, why, how)
2. Answers should be detailed but concise (2-4 sentences)
3. Cover different aspects of the content
4. Use conversational tone
5. Include character names, locations, or concepts mentioned

Document content:
"""
${content.substring(0, 2000)}
"""

Output format (JSON array):
[
  {
    "question": "Who is Elio?",
    "answer": "Elio Solis is the Earth Ambassador in the Communiverse. He's a curious and enthusiastic young person who was chosen to represent Earth in intergalactic affairs. Despite being somewhat overwhelmed by his responsibilities, he approaches his role with genuine interest in meeting beings from across the galaxy."
  },
  ...
]

Generate the Q&A pairs now:`;

    const response = await fetch(`${AI_API_URL}/llm/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        max_tokens: 1500,
        temperature: 0.7,
      }),
    });

    const result = await response.json();

    if (!result.ok) {
      console.error(`Failed to generate Q&A for ${source}`);
      return [];
    }

    // Try to parse JSON from response
    const text = result.data.text;
    const jsonMatch = text.match(/\[[\s\S]*\]/);

    if (jsonMatch) {
      const pairs = JSON.parse(jsonMatch[0]);
      return pairs.map(pair => ({
        ...pair,
        source,
        category,
        metadata: {
          generated_from: 'rag_resources',
          file_path: source,
        },
      }));
    }

    return [];
  } catch (error) {
    console.error(`Error generating Q&A for ${source}: ${error.message}`);
    return [];
  }
}

/**
 * Generate persona-specific conversation examples
 */
async function generatePersonaDialogue(personaName, personaBio, count = 10) {
  try {
    const prompt = `You are generating training data for a character AI named ${personaName}.

Character bio:
"""
${personaBio.substring(0, 1500)}
"""

Generate ${count} realistic conversation examples where ${personaName} responds to various questions and statements.
Each response should maintain the character's personality, tone, and knowledge.

Output format (JSON array):
[
  {
    "user": "How do you feel about being Earth's ambassador?",
    "assistant": "Oh man, it's... it's pretty overwhelming! I mean, one minute I'm just a regular kid, and the next I'm representing the entire planet. But honestly? It's also kinda amazing. I get to meet all these incredible beings from across the galaxy."
  },
  ...
]

Generate the conversations now:`;

    const response = await fetch(`${AI_API_URL}/llm/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        max_tokens: 2000,
        temperature: 0.8,
      }),
    });

    const result = await response.json();

    if (!result.ok) {
      console.error(`Failed to generate dialogue for ${personaName}`);
      return [];
    }

    const text = result.data.text;
    const jsonMatch = text.match(/\[[\s\S]*\]/);

    if (jsonMatch) {
      const conversations = JSON.parse(jsonMatch[0]);
      return conversations.map(conv => ({
        ...conv,
        persona: personaName,
        metadata: {
          generated_from: 'persona_bio',
          character: personaName,
        },
      }));
    }

    return [];
  } catch (error) {
    console.error(`Error generating dialogue for ${personaName}: ${error.message}`);
    return [];
  }
}

/**
 * Find all markdown files recursively
 */
async function findMarkdownFiles(dir) {
  const files = [];

  async function walk(currentPath) {
    const entries = await fs.promises.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        await walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  }

  await walk(dir);
  return files;
}

/**
 * Process a markdown file and generate training data
 */
async function processMarkdownFile(filePath) {
  const relativePath = path.relative(RAG_DIR, filePath);
  const category = path.dirname(relativePath).split(path.sep)[0];
  const content = await fs.promises.readFile(filePath, 'utf-8');

  console.log(`Processing: ${relativePath}`);

  // Check if it's a character file
  const isCharacter = relativePath.includes('character_') || category === 'characters';
  const personaMatch = relativePath.match(/character_(\w+)/);

  let trainingData = [];

  if (isCharacter && personaMatch) {
    // Generate persona-specific dialogue
    const personaName = personaMatch[1].charAt(0).toUpperCase() + personaMatch[1].slice(1);
    console.log(`  Generating persona dialogue for ${personaName}...`);

    const dialogue = await generatePersonaDialogue(personaName, content, 15);
    trainingData = trainingData.concat(dialogue);

    // Small delay to avoid overwhelming the API
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Generate Q&A pairs for all files
  console.log(`  Generating Q&A pairs...`);
  const qaPairs = await generateQAPairs(content, relativePath, category);
  trainingData = trainingData.concat(qaPairs);

  // Small delay
  await new Promise(resolve => setTimeout(resolve, 1000));

  return trainingData;
}

/**
 * Save training data in multiple formats
 */
function saveTrainingData(data, format = 'all') {
  const timestamp = new Date().toISOString().split('T')[0];

  // 1. JSON format (for general use)
  if (format === 'all' || format === 'json') {
    const jsonPath = path.join(OUTPUT_DIR, `communiverse_training_${timestamp}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
    console.log(`\n✓ Saved JSON: ${jsonPath}`);
  }

  // 2. JSONL format (for many training frameworks)
  if (format === 'all' || format === 'jsonl') {
    const jsonlPath = path.join(OUTPUT_DIR, `communiverse_training_${timestamp}.jsonl`);
    const jsonlContent = data.map(item => JSON.stringify(item)).join('\n');
    fs.writeFileSync(jsonlPath, jsonlContent);
    console.log(`✓ Saved JSONL: ${jsonlPath}`);
  }

  // 3. Alpaca format (for instruction tuning)
  if (format === 'all' || format === 'alpaca') {
    const alpacaData = data
      .filter(item => item.question && item.answer)
      .map(item => ({
        instruction: item.question,
        input: '',
        output: item.answer,
        metadata: item.metadata,
      }));

    const alpacaPath = path.join(OUTPUT_DIR, `communiverse_alpaca_${timestamp}.json`);
    fs.writeFileSync(alpacaPath, JSON.stringify(alpacaData, null, 2));
    console.log(`✓ Saved Alpaca format: ${alpacaPath}`);
  }

  // 4. Chat format (for dialogue models)
  if (format === 'all' || format === 'chat') {
    const chatData = data
      .filter(item => item.user && item.assistant)
      .map(item => ({
        messages: [
          { role: 'user', content: item.user },
          { role: 'assistant', content: item.assistant },
        ],
        persona: item.persona,
        metadata: item.metadata,
      }));

    const chatPath = path.join(OUTPUT_DIR, `communiverse_chat_${timestamp}.json`);
    fs.writeFileSync(chatPath, JSON.stringify(chatData, null, 2));
    console.log(`✓ Saved Chat format: ${chatPath}`);
  }

  // 5. Statistics file
  const stats = {
    generated_at: new Date().toISOString(),
    total_items: data.length,
    qa_pairs: data.filter(item => item.question && item.answer).length,
    conversations: data.filter(item => item.user && item.assistant).length,
    personas: [...new Set(data.filter(item => item.persona).map(item => item.persona))],
    categories: [...new Set(data.filter(item => item.category).map(item => item.category))],
  };

  const statsPath = path.join(OUTPUT_DIR, `training_stats_${timestamp}.json`);
  fs.writeFileSync(statsPath, JSON.stringify(stats, null, 2));
  console.log(`✓ Saved statistics: ${statsPath}`);

  return stats;
}

/**
 * Main function
 */
async function main() {
  console.log('=== Communiverse Training Data Generator ===\n');

  // Check if AI service is available
  try {
    const healthCheck = await fetch(`${AI_API_URL}/health`);
    if (!healthCheck.ok) {
      console.error('AI service is not available. Please ensure ai-service is running.');
      process.exit(1);
    }
  } catch (error) {
    console.error('Cannot connect to AI service. Please ensure ai-service is running.');
    process.exit(1);
  }

  console.log(`AI Service: ${AI_API_URL}`);
  console.log(`Input: ${RAG_DIR}`);
  console.log(`Output: ${OUTPUT_DIR}\n`);

  // Find all markdown files
  const files = await findMarkdownFiles(RAG_DIR);
  console.log(`Found ${files.length} markdown files\n`);

  // Process each file
  let allTrainingData = [];
  let processedCount = 0;

  for (const file of files) {
    try {
      const data = await processMarkdownFile(file);
      allTrainingData = allTrainingData.concat(data);
      processedCount++;
      console.log(`  Generated ${data.length} training items\n`);
    } catch (error) {
      console.error(`  ✗ Failed: ${error.message}\n`);
    }
  }

  // Save all data
  console.log(`\n=== Saving Training Data ===`);
  const stats = saveTrainingData(allTrainingData);

  console.log(`\n=== Generation Complete ===`);
  console.log(`Processed files: ${processedCount}/${files.length}`);
  console.log(`Total training items: ${stats.total_items}`);
  console.log(`  - Q&A pairs: ${stats.qa_pairs}`);
  console.log(`  - Conversations: ${stats.conversations}`);
  console.log(`  - Personas: ${stats.personas.join(', ')}`);
  console.log(`  - Categories: ${stats.categories.join(', ')}`);
  console.log(`\nOutput directory: ${OUTPUT_DIR}`);
}

main().catch(console.error);
