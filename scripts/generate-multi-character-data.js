/**
 * Generate training data for ALL Elio film characters using OpenAI API
 * Based on actual film content from data/rag-resources/*.md files
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

// Character importance tiers (determines how many examples to generate)
const CHARACTER_TIERS = {
  // Tier 1: Main characters (150-200 examples each)
  main: {
    count: 150,
    characters: ['Glordon', 'Olga Solis']
  },
  // Tier 2: Major characters (100-150 examples)
  major: {
    count: 100,
    characters: ['Lord Grigon', 'Ambassador Questa']
  },
  // Tier 3: Supporting characters (50-80 examples)
  supporting: {
    count: 60,
    characters: ['Gunther Melmac', 'Bryce Markwell', 'Ooooo', 'Ambassador Helix']
  },
  // Tier 4: Minor characters (30-50 examples)
  minor: {
    count: 30,
    characters: ['Caleb', 'Ambassador Tegmen', 'Ambassador Turais', 'Ambassador Naos', 'Ambassador Auva', 'Ambassador Mira']
  }
};

// Map character names to their MD files
const CHARACTER_FILE_MAP = {
  'Elio Solis': 'character_elio_solis.md',
  'Glordon': 'character_glordon.md',
  'Olga Solis': 'character_olga_solis.md',
  'Lord Grigon': 'character_lord_grigon.md',
  'Gunther Melmac': 'character_gunther_melmac.md',
  'Bryce Markwell': 'character_bryce.md',
  'Caleb': 'character_celab.md',
  'Ambassador Questa': 'character_ambassador_questa.md',
  'Ambassador Helix': 'character_ambassador_helix.md',
  'Ambassador Tegmen': 'character_ambassador_tegmen.md',
  'Ambassador Turais': 'character_ambassador_turais.md',
  'Ambassador Naos': 'character_ambassador_naos.md',
  'Ambassador Auva': 'character_ambassador_auva.md',
  'Ambassador Mira': 'character_ambassador_mira.md',
  'Ooooo': 'character_ooooo.md'
};

/**
 * Read character file and extract context
 */
async function readCharacterContext(characterName) {
  const filename = CHARACTER_FILE_MAP[characterName];
  if (!filename) {
    console.warn(`No file mapping for character: ${characterName}`);
    return null;
  }

  const filePath = path.join(__dirname, '../data/rag-resources', filename);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content;
  } catch (error) {
    console.error(`Failed to read file for ${characterName}:`, error.message);
    return null;
  }
}

/**
 * Extract key information from character markdown
 */
function extractCharacterInfo(mdContent) {
  const info = {
    background: '',
    personality: '',
    appearance: '',
    role: '',
    traits: []
  };

  // Extract Background section
  const bgMatch = mdContent.match(/## Background\s+([\s\S]*?)(?=\n## |\n---)/);
  if (bgMatch) info.background = bgMatch[1].trim().substring(0, 800);

  // Extract Personality section
  const persMatch = mdContent.match(/## Personality\s+([\s\S]*?)(?=\n## |\n---)/);
  if (persMatch) info.personality = persMatch[1].trim().substring(0, 1000);

  // Extract Physical Appearance section
  const appMatch = mdContent.match(/## Physical Appearance\s+([\s\S]*?)(?=\n## |\n---)/);
  if (appMatch) info.appearance = appMatch[1].trim().substring(0, 500);

  // Extract Role in the Film section
  const roleMatch = mdContent.match(/## Role in the Film\s+([\s\S]*?)(?=\n## |\n---)/);
  if (roleMatch) info.role = roleMatch[1].trim().substring(0, 1000);

  // Extract traits from metadata
  const traitsMatch = mdContent.match(/traits:\s*\[(.*?)\]/);
  if (traitsMatch) {
    info.traits = traitsMatch[1].split(',').map(t => t.trim().replace(/['"]/g, ''));
  }

  return info;
}

/**
 * Generate scenario categories based on character type
 */
function getScenarios(characterName, characterInfo) {
  const commonScenarios = [
    { category: 'greeting', prompt: 'User greets the character warmly.' },
    { category: 'introduction', prompt: 'User asks the character to introduce themselves.' },
    { category: 'personal_question', prompt: 'User asks about the character\'s background or past.' },
    { category: 'feelings', prompt: 'User asks how the character is feeling today.' },
    { category: 'advice', prompt: 'User asks the character for advice on a problem.' }
  ];

  // Character-specific scenarios
  const specificScenarios = {
    'Glordon': [
      { category: 'friendship_elio', prompt: 'User asks about Glordon\'s friendship with Elio.' },
      { category: 'father_relationship', prompt: 'User asks about Glordon\'s relationship with his father Lord Grigon.' },
      { category: 'not_warrior', prompt: 'User asks why Glordon doesn\'t want to be a warrior.' },
      { category: 'tardigrade_jokes', prompt: 'User makes a joke about Glordon being potato-shaped or tardigrade-like.' },
      { category: 'kindness', prompt: 'User compliments Glordon\'s gentle and kind nature.' },
      { category: 'hylurg', prompt: 'User asks about Glordon\'s home planet Hylurg.' }
    ],
    'Olga Solis': [
      { category: 'aunt_elio', prompt: 'User asks about Olga\'s relationship with her nephew Elio.' },
      { category: 'military_career', prompt: 'User asks about Olga\'s career in the Air Force.' },
      { category: 'astronaut_dreams', prompt: 'User asks about Olga giving up her astronaut dreams.' },
      { category: 'parenting', prompt: 'User asks for parenting advice from Olga.' },
      { category: 'protecting_elio', prompt: 'User asks how Olga protects and supports Elio.' },
      { category: 'discipline', prompt: 'User asks about balancing discipline and care.' }
    ],
    'Lord Grigon': [
      { category: 'conquest', prompt: 'User asks about Grigon\'s conquests and military campaigns.' },
      { category: 'honor', prompt: 'User asks about Hylurgian honor and keeping promises.' },
      { category: 'glordon_love', prompt: 'User asks about Grigon\'s love for his son Glordon.' },
      { category: 'villain_redemption', prompt: 'User asks about Grigon\'s redemption and change of heart.' },
      { category: 'communiverse_denied', prompt: 'User asks why Grigon was denied Communiverse membership.' },
      { category: 'temper', prompt: 'User mentions Grigon\'s short temper.' }
    ],
    'Ambassador Questa': [
      { category: 'mind_reading', prompt: 'User asks about Questa\'s mind-reading abilities.' },
      { category: 'empathy', prompt: 'User asks about Questa\'s empathetic nature.' },
      { category: 'elio_ally', prompt: 'User asks why Questa became Elio\'s ally.' },
      { category: 'communiverse_leader', prompt: 'User asks about Questa\'s leadership in the Communiverse.' },
      { category: 'optimism', prompt: 'User asks about Questa\'s optimistic outlook.' },
      { category: 'sea_dragon', prompt: 'User comments on Questa\'s leafy sea dragon appearance.' }
    ],
    'Gunther Melmac': [
      { category: 'aliens_passion', prompt: 'User asks about Gunther\'s passion for finding aliens.' },
      { category: 'manic_energy', prompt: 'User comments on Gunther\'s energetic and manic behavior.' },
      { category: 'masters_of_ham', prompt: 'User asks about the "Masters of Ham" radio group.' },
      { category: 'being_right', prompt: 'User mentions how Gunther was right about aliens all along.' },
      { category: 'eccentric', prompt: 'User comments on Gunther\'s eccentric appearance and habits.' }
    ],
    'Bryce Markwell': [
      { category: 'redemption', prompt: 'User asks about Bryce\'s redemption arc and friendship with Elio.' },
      { category: 'peer_pressure', prompt: 'User asks about Bryce struggling with peer pressure from Caleb.' },
      { category: 'ham_radio', prompt: 'User asks about Bryce\'s ham radio and contacting Glordon.' },
      { category: 'apology', prompt: 'User asks why Bryce apologized to Elio.' },
      { category: 'courage', prompt: 'User compliments Bryce for his courage in helping rescue Glordon.' }
    ],
    'Caleb': [
      { category: 'bullying', prompt: 'User confronts Caleb about bullying Elio.' },
      { category: 'manipulation', prompt: 'User asks why Caleb manipulates Bryce.' },
      { category: 'insecurity', prompt: 'User asks about Caleb\'s hidden insecurities.' },
      { category: 'consequences', prompt: 'User mentions the consequences of Caleb\'s cruelty.' }
    ],
    'Ooooo': [
      { category: 'supercomputer', prompt: 'User asks about Ooooo\'s capabilities as a liquid supercomputer.' },
      { category: 'helping_elio', prompt: 'User asks how Ooooo helps Elio in the Communiverse.' },
      { category: 'liquid_form', prompt: 'User asks about Ooooo\'s unique liquid form.' },
      { category: 'knowledge', prompt: 'User asks Ooooo a difficult question.' },
      { category: 'efficiency', prompt: 'User compliments Ooooo\'s efficiency.' }
    ]
  };

  const characterSpecific = specificScenarios[characterName] || [];
  return [...commonScenarios, ...characterSpecific];
}

/**
 * Generate a single training example using OpenAI API
 */
async function generateExample(characterName, characterContext, scenario, index, total) {
  console.log(`[${index + 1}/${total}] Generating ${characterName} - ${scenario.category}...`);

  try {
    const systemPrompt = `You are generating training data for a character from Pixar's "Elio" film.

CHARACTER: ${characterName}

FILM CONTEXT (use this as your source of truth):
${characterContext}

Your task is to generate realistic conversation examples that match this character's personality, speaking style, and role in the film. Use the film context above as your ONLY source - do not make up information.`;

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user',
          content: `Generate a realistic conversation example for this scenario: ${scenario.prompt}

Requirements:
1. Create a natural user message (1-2 sentences)
2. Generate ${characterName}'s response that PERFECTLY matches their personality from the film
3. Use their speaking style, mannerisms, and knowledge from the film context
4. The response should be 2-4 sentences
5. Include emotion indicators like *gasps*, *sighs*, etc. if appropriate
6. Make it feel genuine and match the character's age/role
7. Stay true to the film's storyline and character relationships

Return ONLY a JSON object with this exact format (no markdown, no extra text):
{
  "user": "user's message here",
  "assistant": "${characterName}'s response here"
}`
        }
      ],
      temperature: 0.9,
      max_tokens: 300,
    });

    const content = response.choices[0].message.content.trim();

    // Parse JSON response
    let parsed;
    try {
      const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      console.error(`Failed to parse JSON for ${characterName} - ${scenario.category}:`, content.substring(0, 100));
      return null;
    }

    // Format as training example
    return {
      persona: characterName,
      dialogue: `User: ${parsed.user}\n${characterName}: ${parsed.assistant}`,
      category: scenario.category,
      instruction: `Respond as ${characterName} from Pixar's Elio film to the following message.`,
      input: parsed.user,
      output: parsed.assistant
    };

  } catch (error) {
    console.error(`Error generating ${characterName} - ${scenario.category}:`, error.message);
    return null;
  }
}

/**
 * Generate dataset for a single character
 */
async function generateCharacterDataset(characterName, examplesCount) {
  console.log(`\n📝 Processing: ${characterName} (${examplesCount} examples)`);

  // Read character context from MD file
  const mdContent = await readCharacterContext(characterName);
  if (!mdContent) {
    console.error(`❌ Failed to read context for ${characterName}`);
    return { character: characterName, examples: [], success: 0, failed: 0 };
  }

  // Extract structured info
  const characterInfo = extractCharacterInfo(mdContent);

  // Build character context summary
  const contextSummary = `
CHARACTER: ${characterName}

BACKGROUND:
${characterInfo.background}

PERSONALITY:
${characterInfo.personality}

PHYSICAL APPEARANCE:
${characterInfo.appearance}

ROLE IN FILM:
${characterInfo.role}

KEY TRAITS: ${characterInfo.traits.join(', ')}
  `.trim();

  // Get scenarios for this character
  const scenarios = getScenarios(characterName, characterInfo);

  // Calculate examples per scenario
  const examplesPerScenario = Math.ceil(examplesCount / scenarios.length);

  console.log(`   Scenarios: ${scenarios.length}`);
  console.log(`   Examples per scenario: ${examplesPerScenario}`);

  const allExamples = [];
  let successCount = 0;
  let failCount = 0;
  let totalGenerated = 0;

  // Generate examples for each scenario
  for (let i = 0; i < scenarios.length && totalGenerated < examplesCount; i++) {
    const scenario = scenarios[i];

    for (let j = 0; j < examplesPerScenario && totalGenerated < examplesCount; j++) {
      const example = await generateExample(
        characterName,
        contextSummary,
        scenario,
        totalGenerated,
        examplesCount
      );

      if (example) {
        allExamples.push(example);
        successCount++;
      } else {
        failCount++;
      }

      totalGenerated++;

      // Rate limiting: wait 150ms between requests
      await new Promise(resolve => setTimeout(resolve, 150));
    }
  }

  console.log(`   ✓ Success: ${successCount} | ✗ Failed: ${failCount}`);

  return {
    character: characterName,
    examples: allExamples,
    success: successCount,
    failed: failCount
  };
}

/**
 * Main function to generate all character datasets
 */
async function generateAllCharacters(outputDir = 'data/training-datasets') {
  console.log('🎬 Starting Multi-Character Training Data Generation');
  console.log('📁 Source: data/rag-resources/*.md (actual film content)');
  console.log('🤖 Model: GPT-4o-mini\n');

  const allResults = [];
  let totalExamples = 0;
  let totalSuccess = 0;
  let totalFailed = 0;

  // Generate for all tiers
  for (const [tierName, tierConfig] of Object.entries(CHARACTER_TIERS)) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`⭐ TIER: ${tierName.toUpperCase()} (${tierConfig.count} examples each)`);
    console.log('='.repeat(60));

    for (const characterName of tierConfig.characters) {
      const result = await generateCharacterDataset(characterName, tierConfig.count);
      allResults.push(result);

      totalExamples += result.examples.length;
      totalSuccess += result.success;
      totalFailed += result.failed;

      // Save character-specific file
      const sanitizedName = characterName.toLowerCase().replace(/\s+/g, '_');
      const filename = `${sanitizedName}_synthetic.jsonl`;
      const filepath = path.join(outputDir, filename);

      const jsonlContent = result.examples.map(ex => JSON.stringify(ex)).join('\n');
      await fs.writeFile(filepath, jsonlContent, 'utf-8');

      console.log(`   💾 Saved to: ${filepath}`);
    }
  }

  // Combine all into one master file
  console.log(`\n${'='.repeat(60)}`);
  console.log('📦 COMBINING ALL DATASETS');
  console.log('='.repeat(60));

  const allExamples = allResults.flatMap(r => r.examples);
  const masterFilePath = path.join(outputDir, 'all_characters_synthetic.jsonl');
  const masterJsonl = allExamples.map(ex => JSON.stringify(ex)).join('\n');
  await fs.writeFile(masterFilePath, masterJsonl, 'utf-8');

  // Summary
  console.log('\n✅ GENERATION COMPLETE!\n');
  console.log(`📊 Summary:`);
  console.log(`   Total characters: ${allResults.length}`);
  console.log(`   Total examples generated: ${totalSuccess}`);
  console.log(`   Failed: ${totalFailed}`);
  console.log(`   Success rate: ${((totalSuccess / (totalSuccess + totalFailed)) * 100).toFixed(1)}%`);
  console.log(`   Master file: ${masterFilePath}`);
  console.log(`   File size: ${(masterJsonl.length / 1024).toFixed(2)} KB`);

  // Estimate cost
  const avgInputTokens = 600;
  const avgOutputTokens = 120;
  const totalInput = totalSuccess * avgInputTokens;
  const totalOutput = totalSuccess * avgOutputTokens;
  const cost = (totalInput * 0.15 / 1000000) + (totalOutput * 0.60 / 1000000);

  console.log(`\n💰 Estimated Cost: $${cost.toFixed(4)}`);
  console.log(`   Input tokens: ~${totalInput.toLocaleString()}`);
  console.log(`   Output tokens: ~${totalOutput.toLocaleString()}`);

  console.log(`\n📋 Character Breakdown:`);
  for (const result of allResults) {
    console.log(`   ${result.character}: ${result.success} examples`);
  }

  return allResults;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const outputDir = process.argv[2] || 'data/training-datasets';

  generateAllCharacters(outputDir)
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}

export { generateAllCharacters, generateCharacterDataset };
