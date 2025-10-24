/**
 * Generate training data from Fandom Wiki LORE & PLOT content
 * 从 Fandom Wiki 的世界观、情节、设定等内容生成训练数据
 *
 * 与 generate-fandom-training-data.js 的区别：
 * - 那个脚本：角色对话（character conversations）
 * - 这个脚本：电影知识问答（lore, plot, worldbuilding Q&A）
 *
 * 数据类型：
 * 1. 电影情节问答 (Plot Q&A)
 * 2. 世界观设定问答 (Worldbuilding Q&A)
 * 3. 角色关系问答 (Character relationships Q&A)
 * 4. 电影细节问答 (Film details Q&A)
 */

import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Fandom wiki files to process (NOT just characters, but also worldbuilding)
const FANDOM_FILES = [
  // Characters (for relationship/background questions)
  'character_elio_solis.md',
  'character_glordon.md',
  'character_olga_solis.md',
  'character_lord_grigon.md',
  'character_ambassador_questa.md',
  'character_bryce.md',
  'character_celab.md',
  'character_gunther_melmac.md',

  // Additional lore files (if exist)
  // Add more as needed: 'communiverse.md', 'plot_summary.md', etc.
];

// Question categories for lore/knowledge
const QUESTION_CATEGORIES = {
  // 电影情节
  plot: [
    { type: 'plot_main', prompt: 'What is the main storyline of the Elio film?' },
    { type: 'plot_conflict', prompt: 'What is the central conflict in the film?' },
    { type: 'plot_resolution', prompt: 'How is the conflict resolved?' },
    { type: 'plot_turning_point', prompt: 'What is a major turning point in the story?' },
    { type: 'plot_event', prompt: 'Describe a significant event in the film.' }
  ],

  // 世界观设定
  worldbuilding: [
    { type: 'world_communiverse', prompt: 'What is the Communiverse?' },
    { type: 'world_location', prompt: 'Describe an important location in the film.' },
    { type: 'world_technology', prompt: 'What technology or sci-fi elements are featured?' },
    { type: 'world_species', prompt: 'What alien species appear in the film?' },
    { type: 'world_rules', prompt: 'Describe how the Communiverse works.' }
  ],

  // 角色关系
  relationships: [
    { type: 'rel_family', prompt: 'Describe a family relationship in the film.' },
    { type: 'rel_friendship', prompt: 'Describe a friendship in the film.' },
    { type: 'rel_conflict', prompt: 'Describe a conflictual relationship.' },
    { type: 'rel_dynamic', prompt: 'How does a relationship change throughout the film?' }
  ],

  // 电影细节
  details: [
    { type: 'detail_theme', prompt: 'What are the main themes of the film?' },
    { type: 'detail_symbolism', prompt: 'What symbolic elements appear in the film?' },
    { type: 'detail_production', prompt: 'Share interesting production details about the film.' },
    { type: 'detail_trivia', prompt: 'Share interesting trivia about the film.' }
  ]
};

/**
 * Read fandom wiki file
 */
async function readFandomFile(filename) {
  const filePath = path.join(__dirname, '../data/rag-resources', filename);

  try {
    const content = await fs.readFile(filePath, 'utf-8');

    // Verify it's official fandom content
    if (!content.includes('disney.fandom.com') && !content.includes('fandom')) {
      console.warn(`⚠️  ${filename} may not be official fandom content`);
    }

    return content;
  } catch (error) {
    console.error(`❌ Failed to read ${filename}:`, error.message);
    return null;
  }
}

/**
 * Generate a single lore/knowledge Q&A example
 */
async function generateLoreExample(fandomContent, category, questionConfig, index, total) {
  console.log(`[${index + 1}/${total}] Generating ${category} - ${questionConfig.type}...`);

  try {
    const systemPrompt = `You are generating Q&A training data about Pixar's "Elio" film based on official Disney Fandom wiki content.

OFFICIAL FANDOM WIKI CONTEXT:
${fandomContent}

Your task is to create knowledge-based Q&A pairs that help a model understand the Elio film's plot, worldbuilding, and details.

CRITICAL REQUIREMENTS:
1. Use ONLY information from the fandom wiki context above
2. Create factually accurate questions and answers
3. Answers should be informative and concise (2-5 sentences)
4. Do NOT make up information not in the source
5. Focus on helping users understand the film's story and world

CATEGORY: ${category}
TYPE: ${questionConfig.type}`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: `Generate a Q&A example for: ${questionConfig.prompt}

Requirements:
1. Create a natural user question (1-2 sentences)
2. Generate an informative, accurate answer based on the fandom wiki
3. The answer should be 2-5 sentences
4. Include specific details from the film
5. Stay strictly factual - no speculation

Return ONLY a JSON object with this exact format (no markdown, no extra text):
{
  "user": "user's question here",
  "assistant": "factual answer here (2-5 sentences)"
}`
        }
      ],
      temperature: 0.8,
      max_tokens: 400,
    });

    const content = response.choices[0].message.content.trim();

    // Parse JSON
    let parsed;
    try {
      const jsonContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      parsed = JSON.parse(jsonContent);
    } catch (parseError) {
      console.warn(`⚠️  Failed to parse JSON:`, content.substring(0, 100));
      return null;
    }

    return {
      messages: [
        { role: 'system', content: `You are a knowledgeable assistant about Pixar's Elio film. Provide accurate information based on official sources.` },
        { role: 'user', content: parsed.user },
        { role: 'assistant', content: parsed.assistant }
      ],
      metadata: {
        category,
        type: questionConfig.type,
        source: 'fandom_lore'
      }
    };
  } catch (error) {
    console.error(`❌ Error generating example:`, error.message);
    return null;
  }
}

/**
 * Generate all lore/knowledge training data
 */
async function generateAll() {
  console.log('🎬 FANDOM LORE & KNOWLEDGE TRAINING DATA GENERATOR');
  console.log('Generating Q&A data from official wiki content\n');

  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY environment variable not set');
    process.exit(1);
  }

  const allExamples = [];

  // Read all fandom content and combine
  console.log('📂 Reading fandom wiki files...');
  let combinedContent = '';
  for (const filename of FANDOM_FILES) {
    const content = await readFandomFile(filename);
    if (content) {
      combinedContent += `\n\n=== ${filename} ===\n${content}`;
    }
  }

  if (!combinedContent) {
    console.error('❌ No fandom content loaded');
    process.exit(1);
  }

  console.log(`✅ Loaded ${combinedContent.length} characters of fandom content\n`);

  // Generate examples for each category
  let totalGenerated = 0;

  for (const [category, questions] of Object.entries(QUESTION_CATEGORIES)) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Generating category: ${category.toUpperCase()}`);
    console.log(`${'='.repeat(60)}\n`);

    // Generate 15-20 examples per category (total ~60-80 lore examples)
    const examplesPerQuestion = 3;

    for (const questionConfig of questions) {
      for (let i = 0; i < examplesPerQuestion; i++) {
        const example = await generateLoreExample(
          combinedContent,
          category,
          questionConfig,
          totalGenerated,
          questions.length * examplesPerQuestion * Object.keys(QUESTION_CATEGORIES).length
        );

        if (example) {
          allExamples.push(example);
          totalGenerated++;
        }

        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  // Save output
  const outputPath = path.join(__dirname, '../data/training/fandom-lore-training-data.jsonl');
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  const jsonlContent = allExamples.map(ex => JSON.stringify(ex)).join('\n');
  await fs.writeFile(outputPath, jsonlContent, 'utf-8');

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ SUCCESS! Generated ${totalGenerated} lore/knowledge examples`);
  console.log(`📁 Output: ${outputPath}`);
  console.log(`${'='.repeat(60)}\n`);

  // Statistics by category
  const categoryCounts = {};
  allExamples.forEach(ex => {
    const cat = ex.metadata.category;
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
  });

  console.log('📊 Distribution by category:');
  Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => {
      console.log(`  ${cat}: ${count} examples`);
    });

  console.log('\n💡 Next steps:');
  console.log('1. Review generated data for accuracy');
  console.log('2. Merge with character conversation data:');
  console.log('   cat data/training/fandom-first-person-training-data.jsonl \\');
  console.log('       data/training/fandom-lore-training-data.jsonl \\');
  console.log('       data/training/general-conversation-subset.jsonl \\');
  console.log('       > data/training/final-complete-training-data.jsonl\n');
}

// Execute
generateAll().catch(console.error);
