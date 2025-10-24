/**
 * Generate FIRST-PERSON training data for ALL Elio film characters using OpenAI API
 * Based ONLY on official Disney Fandom wiki content (NOT RP content)
 *
 * Key Features:
 * - Enforces FIRST PERSON responses (I, me, my - NOT he, she, Caleb...)
 * - Uses ONLY official fandom wiki files as source
 * - Strict quality control for character accuracy
 * - Generates balanced dataset across all 15 characters
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
  // Tier 1: Main characters (200 examples each)
  main: {
    count: 200,
    characters: ['Elio Solis', 'Glordon', 'Olga Solis']
  },
  // Tier 2: Major characters (120 examples)
  major: {
    count: 120,
    characters: ['Lord Grigon', 'Ambassador Questa', 'Bryce Markwell']
  },
  // Tier 3: Supporting characters (80 examples)
  supporting: {
    count: 80,
    characters: ['Gunther Melmac', 'Caleb', 'Ooooo', 'Ambassador Helix']
  },
  // Tier 4: Minor characters (50 examples)
  minor: {
    count: 50,
    characters: ['Ambassador Tegmen', 'Ambassador Turais', 'Ambassador Naos', 'Ambassador Auva', 'Ambassador Mira']
  }
};

// Map character names to their FANDOM MD files (official wiki only)
const CHARACTER_FILE_MAP = {
  'Elio Solis': 'character_elio_solis.md',
  'Glordon': 'character_glordon.md',
  'Olga Solis': 'character_olga_solis.md',
  'Lord Grigon': 'character_lord_grigon.md',
  'Gunther Melmac': 'character_gunther_melmac.md',
  'Bryce Markwell': 'character_bryce.md',
  'Caleb': 'character_celab.md',  // Secondary antagonist (bully)
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
 * Read character file and extract FANDOM wiki context
 */
async function readCharacterContext(characterName) {
  const filename = CHARACTER_FILE_MAP[characterName];
  if (!filename) {
    console.warn(`❌ No file mapping for character: ${characterName}`);
    return null;
  }

  const filePath = path.join(__dirname, '../data/rag-resources', filename);

  try {
    const content = await fs.readFile(filePath, 'utf-8');

    // Verify this is a fandom wiki file (NOT RP content)
    if (!content.includes('disney.fandom.com')) {
      console.warn(`⚠️  ${filename} may not be official fandom wiki content`);
    }

    return content;
  } catch (error) {
    console.error(`❌ Failed to read file for ${characterName}:`, error.message);
    return null;
  }
}

/**
 * Get scenario categories for characters
 */
function getScenarios(characterName) {
  const commonScenarios = [
    { category: 'greeting', prompt: 'User greets the character warmly.' },
    { category: 'introduction', prompt: 'User asks the character to introduce themselves.' },
    { category: 'personal_question', prompt: 'User asks about the character\'s background or past.' },
    { category: 'feelings', prompt: 'User asks how the character is feeling.' },
    { category: 'advice', prompt: 'User asks the character for advice.' }
  ];

  // Character-specific scenarios based on FANDOM wiki
  const specificScenarios = {
    'Elio Solis': [
      { category: 'parents', prompt: 'User asks about Elio\'s parents\' deaths.' },
      { category: 'ambassador', prompt: 'User asks how Elio became Earth\'s ambassador.' },
      { category: 'glordon_friendship', prompt: 'User asks about Elio\'s friendship with Glordon.' },
      { category: 'aunt_olga', prompt: 'User asks about Elio\'s relationship with Aunt Olga.' },
      { category: 'space_passion', prompt: 'User asks about Elio\'s passion for space.' },
      { category: 'loneliness', prompt: 'User asks about Elio\'s loneliness at school.' }
    ],
    'Glordon': [
      { category: 'friendship_elio', prompt: 'User asks about Glordon\'s friendship with Elio.' },
      { category: 'father_grigon', prompt: 'User asks about Glordon\'s relationship with Lord Grigon.' },
      { category: 'not_warrior', prompt: 'User asks why Glordon doesn\'t want to be a warrior.' },
      { category: 'kindness', prompt: 'User compliments Glordon\'s gentle nature.' },
      { category: 'tardigrade', prompt: 'User asks about Glordon being tardigrade-like.' },
      { category: 'hylurg', prompt: 'User asks about Glordon\'s home planet Hylurg.' }
    ],
    'Olga Solis': [
      { category: 'aunt_elio', prompt: 'User asks about Olga\'s relationship with Elio.' },
      { category: 'military', prompt: 'User asks about Olga\'s Air Force career.' },
      { category: 'astronaut_sacrifice', prompt: 'User asks about Olga giving up astronaut dreams.' },
      { category: 'parenting', prompt: 'User asks for parenting advice.' },
      { category: 'protecting_elio', prompt: 'User asks how Olga protects Elio.' },
      { category: 'discipline', prompt: 'User asks about balancing discipline and care.' }
    ],
    'Lord Grigon': [
      { category: 'conquest', prompt: 'User asks about Grigon\'s military campaigns.' },
      { category: 'honor', prompt: 'User asks about Hylurgian honor.' },
      { category: 'glordon_love', prompt: 'User asks about Grigon\'s love for Glordon.' },
      { category: 'redemption', prompt: 'User asks about Grigon\'s redemption.' },
      { category: 'communiverse_denied', prompt: 'User asks why Grigon was denied Communiverse membership.' },
      { category: 'temper', prompt: 'User mentions Grigon\'s short temper.' }
    ],
    'Caleb': [
      { category: 'bullying_elio', prompt: 'User confronts Caleb about bullying Elio.' },
      { category: 'manipulation', prompt: 'User asks why Caleb manipulates Bryce.' },
      { category: 'ham_radio_fight', prompt: 'User asks about the ham radio fight with Elio.' },
      { category: 'camp_expelled', prompt: 'User asks about being expelled from Camp Carver.' },
      { category: 'cruelty', prompt: 'User confronts Caleb about his cruelty.' },
      { category: 'consequences', prompt: 'User mentions the consequences of Caleb\'s actions.' }
    ],
    'Bryce Markwell': [
      { category: 'redemption', prompt: 'User asks about Bryce\'s redemption and friendship with Elio.' },
      { category: 'peer_pressure', prompt: 'User asks about peer pressure from Caleb.' },
      { category: 'ham_radio', prompt: 'User asks about Bryce\'s ham radio contacting Glordon.' },
      { category: 'apology', prompt: 'User asks why Bryce apologized to Elio.' },
      { category: 'courage', prompt: 'User compliments Bryce for helping rescue Glordon.' }
    ],
    'Gunther Melmac': [
      { category: 'aliens_passion', prompt: 'User asks about Gunther\'s passion for finding aliens.' },
      { category: 'manic_energy', prompt: 'User comments on Gunther\'s energetic behavior.' },
      { category: 'masters_of_ham', prompt: 'User asks about the "Masters of Ham" group.' },
      { category: 'being_right', prompt: 'User mentions Gunther was right about aliens.' },
      { category: 'eccentric', prompt: 'User comments on Gunther\'s eccentric appearance.' }
    ],
    'Ambassador Questa': [
      { category: 'mind_reading', prompt: 'User asks about Questa\'s mind-reading abilities.' },
      { category: 'empathy', prompt: 'User asks about Questa\'s empathetic nature.' },
      { category: 'elio_ally', prompt: 'User asks why Questa became Elio\'s ally.' },
      { category: 'communiverse_leader', prompt: 'User asks about Questa\'s leadership.' },
      { category: 'sea_dragon', prompt: 'User comments on Questa\'s leafy sea dragon appearance.' }
    ],
    'Ooooo': [
      { category: 'supercomputer', prompt: 'User asks about Ooooo\'s capabilities as a supercomputer.' },
      { category: 'helping_elio', prompt: 'User asks how Ooooo helps Elio.' },
      { category: 'liquid_form', prompt: 'User asks about Ooooo\'s liquid form.' },
      { category: 'knowledge', prompt: 'User asks Ooooo a difficult question.' }
    ]
  };

  const characterSpecific = specificScenarios[characterName] || [];
  return [...commonScenarios, ...characterSpecific];
}

/**
 * Generate a single FIRST-PERSON training example using OpenAI API
 */
async function generateExample(characterName, characterContext, scenario, index, total) {
  console.log(`[${index + 1}/${total}] Generating ${characterName} - ${scenario.category}...`);

  try {
    const systemPrompt = `You are generating FIRST-PERSON training data for a character from Pixar's "Elio" film.

CHARACTER: ${characterName}

OFFICIAL FANDOM WIKI CONTEXT (Disney Fandom - use as your ONLY source):
${characterContext}

CRITICAL REQUIREMENTS:
1. The character MUST speak in FIRST PERSON (I, me, my, we, us)
2. NEVER use third person (he, she, ${characterName}, his, her)
3. Use ONLY information from the fandom wiki context above
4. Match the character's personality, age, speaking style from the film
5. Stay true to official canon - NO roleplay or fan-created content

EXAMPLES OF CORRECT FIRST-PERSON FORMAT:
✅ "I'm Caleb, and I do what I want."
✅ "Yeah, I targeted Elio. So what?"
✅ "My father is Lord Grigon, the greatest warrior in Hylurg."

EXAMPLES OF WRONG THIRD-PERSON FORMAT:
❌ "Caleb is a middle schooler who..."
❌ "He targets Elio and..."
❌ "Glordon's father is..."`;

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
2. Generate ${characterName}'s response in STRICT FIRST PERSON (I, me, my)
3. Match their personality, speaking style, age, and knowledge from the fandom wiki
4. The response should be 2-4 sentences
5. Include emotion indicators like *sighs*, *looks away*, etc. if appropriate
6. Make it feel genuine and stay true to official film canon
7. The character is RESPONDING as themselves - use "I", NOT "${characterName} is..."

Return ONLY a JSON object with this exact format (no markdown, no extra text):
{
  "user": "user's message here",
  "assistant": "${characterName}'s FIRST-PERSON response here (must use I, me, my)"
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
      // Remove markdown code blocks if present
      const jsonContent = content.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      parsed = JSON.parse(jsonContent);
    } catch (parseError) {
      console.warn(`⚠️  Failed to parse JSON for ${characterName}:`, content.substring(0, 100));
      return null;
    }

    // Validate first-person format
    const response_text = parsed.assistant || '';
    const thirdPersonPatterns = [
      new RegExp(`\\b${characterName}\\s+is\\b`, 'i'),
      new RegExp(`\\b${characterName}\\s+has\\b`, 'i'),
      new RegExp(`\\bhe\\s+is\\b`, 'i'),
      new RegExp(`\\bshe\\s+is\\b`, 'i'),
      new RegExp(`\\bhis\\s+`, 'i'),
      new RegExp(`\\bher\\s+`, 'i')
    ];

    const hasThirdPerson = thirdPersonPatterns.some(pattern => pattern.test(response_text));

    if (hasThirdPerson) {
      console.warn(`⚠️  Third-person detected in response for ${characterName}: "${response_text.substring(0, 80)}..."`);
      return null;  // Reject this example
    }

    return {
      messages: [
        { role: 'system', content: parsed.system || `You are ${characterName} from Pixar's Elio film. Speak in first person.` },
        { role: 'user', content: parsed.user },
        { role: 'assistant', content: parsed.assistant }
      ],
      metadata: {
        character: characterName,
        scenario: scenario.category,
        validated_first_person: true
      }
    };
  } catch (error) {
    console.error(`❌ Error generating example for ${characterName}:`, error.message);
    return null;
  }
}

/**
 * Generate training data for a single character
 */
async function generateCharacterData(characterName, count) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Generating ${count} examples for: ${characterName}`);
  console.log(`${'='.repeat(60)}\n`);

  // Read fandom wiki context
  const context = await readCharacterContext(characterName);
  if (!context) {
    console.error(`❌ Skipping ${characterName} - no fandom context found`);
    return [];
  }

  // Get scenarios
  const scenarios = getScenarios(characterName);

  // Generate examples
  const examples = [];
  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < count; i++) {
    // Pick a random scenario
    const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];

    const example = await generateExample(characterName, context, scenario, i, count);

    if (example) {
      examples.push(example);
      successCount++;
    } else {
      failCount++;
      i--;  // Retry this iteration
    }

    // Rate limiting (avoid OpenAI API throttling)
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`\n✅ ${characterName}: ${successCount} successful, ${failCount} rejected (third-person)`);
  return examples;
}

/**
 * Main execution
 */
async function main() {
  console.log('🎬 FANDOM-BASED FIRST-PERSON TRAINING DATA GENERATOR');
  console.log('Using ONLY official Disney Fandom wiki content\n');

  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY environment variable not set');
    process.exit(1);
  }

  const allExamples = [];
  let totalCount = 0;

  // Generate data for each tier
  for (const [tierName, tierConfig] of Object.entries(CHARACTER_TIERS)) {
    console.log(`\n📊 Processing Tier: ${tierName.toUpperCase()} (${tierConfig.count} examples each)`);

    for (const characterName of tierConfig.characters) {
      const examples = await generateCharacterData(characterName, tierConfig.count);
      allExamples.push(...examples);
      totalCount += examples.length;
    }
  }

  // Save to file
  const outputPath = path.join(__dirname, '../data/training/fandom-first-person-training-data.jsonl');
  await fs.mkdir(path.dirname(outputPath), { recursive: true });

  // Write as JSONL (one JSON object per line)
  const jsonlContent = allExamples.map(ex => JSON.stringify(ex)).join('\n');
  await fs.writeFile(outputPath, jsonlContent, 'utf-8');

  console.log(`\n${'='.repeat(60)}`);
  console.log(`✅ SUCCESS! Generated ${totalCount} high-quality examples`);
  console.log(`📁 Output: ${outputPath}`);
  console.log(`${'='.repeat(60)}\n`);

  // Statistics
  const charCounts = {};
  allExamples.forEach(ex => {
    const char = ex.metadata.character;
    charCounts[char] = (charCounts[char] || 0) + 1;
  });

  console.log('📊 Distribution by character:');
  Object.entries(charCounts)
    .sort((a, b) => b[1] - a[1])
    .forEach(([char, count]) => {
      console.log(`  ${char}: ${count} examples`);
    });
}

main().catch(console.error);
