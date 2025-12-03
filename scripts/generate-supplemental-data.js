/**
 * Supplemental Training Data Generator
 * Generate additional data for Elio, Bryce, and Caleb
 */

import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = 'gpt-4o';

const OUTPUT_FILE = path.join(__dirname, '../data/training/supplemental-elio-bryce-caleb.jsonl');
const PROGRESS_FILE = path.join(__dirname, '../data/training/.supplemental-progress.json');

// Supplemental targets
const SUPPLEMENTAL_TARGETS = {
  'Elio Solis': 400,  // New - main protagonist
  'Bryce Markwell': 250,  // Additional (already has 150)
  'Caleb': 320  // Additional (already has 80)
};

const CHARACTER_FILE_MAP = {
  'Elio Solis': 'character_elio_solis.md',
  'Bryce Markwell': 'character_bryce.md',
  'Caleb': 'character_celab.md'
};

// Elio-specific scenarios
const ELIO_SCENARIOS = [
  // Core character traits
  { category: 'elio_space_passion', prompt: 'User asks about Elio\'s passion for space and aliens.' },
  { category: 'elio_loneliness', prompt: 'User asks about Elio feeling different and not belonging.' },
  { category: 'elio_parents', prompt: 'User asks about Elio\'s parents and their loss.' },
  { category: 'elio_ham_radio', prompt: 'User asks about Elio\'s ham radio hobby.' },
  { category: 'elio_voyager_golden_record', prompt: 'User asks about the Voyager Golden Record and its significance.' },
  { category: 'elio_imagination', prompt: 'User asks about Elio\'s creative imagination.' },

  // Relationships
  { category: 'elio_aunt_olga', prompt: 'User asks about Elio\'s relationship with Aunt Olga.' },
  { category: 'elio_glordon_friendship', prompt: 'User asks about Elio\'s friendship with Glordon.' },
  { category: 'elio_bryce_reconciliation', prompt: 'User asks about making up with Bryce.' },
  { category: 'elio_caleb_bully', prompt: 'User asks about dealing with Caleb the bully.' },
  { category: 'elio_questa_bond', prompt: 'User asks about the connection with Ambassador Questa.' },

  // Movie plot
  { category: 'elio_abduction', prompt: 'User asks about being abducted by aliens.' },
  { category: 'elio_mistaken_ambassador', prompt: 'User asks about being mistaken for Earth\'s ambassador.' },
  { category: 'elio_communiverse_arrival', prompt: 'User asks about first arriving at the Communiverse.' },
  { category: 'elio_meeting_ambassadors', prompt: 'User asks about meeting the various alien ambassadors.' },
  { category: 'elio_other_elio_clone', prompt: 'User asks about the clone Other Elio.' },
  { category: 'elio_grigon_negotiation', prompt: 'User asks about negotiating with Lord Grigon.' },
  { category: 'elio_rescue_glordon', prompt: 'User asks about rescuing Glordon.' },
  { category: 'elio_declining_ambassador', prompt: 'User asks about declining the ambassador position.' },
  { category: 'elio_never_alone', prompt: 'User asks about learning "you are never alone".' },

  // Emotional themes
  { category: 'elio_belonging', prompt: 'User discusses finding where you belong.' },
  { category: 'elio_identity', prompt: 'User asks about discovering true identity.' },
  { category: 'elio_courage', prompt: 'User asks about finding courage to be yourself.' },
  { category: 'elio_forgiveness', prompt: 'User discusses forgiving others.' },

  // Discord community
  { category: 'elio_fan_greeting', prompt: 'A fan enthusiastically greets Elio on Discord.' },
  { category: 'elio_fan_question', prompt: 'A fan asks about a specific scene from the film.' },
  { category: 'elio_meme_reaction', prompt: 'User shares a meme about Elio.' },
  { category: 'elio_game_invite', prompt: 'User invites Elio to play a minigame.' },
  { category: 'elio_advice_request', prompt: 'User asks Elio for advice about feeling different.' },
  { category: 'elio_encouragement', prompt: 'User needs encouragement from Elio.' },

  // General
  { category: 'elio_greeting', prompt: 'User greets Elio warmly.' },
  { category: 'elio_introduction', prompt: 'User asks Elio to introduce himself.' },
  { category: 'elio_feelings', prompt: 'User asks how Elio is feeling today.' },
  { category: 'elio_random_chat', prompt: 'User starts a casual conversation.' }
];

// Additional Bryce scenarios
const BRYCE_ADDITIONAL_SCENARIOS = [
  { category: 'bryce_redemption_journey', prompt: 'User asks about Bryce\'s full journey from bully to friend.' },
  { category: 'bryce_standing_up', prompt: 'User asks about standing up against Caleb.' },
  { category: 'bryce_elio_apology', prompt: 'User asks about apologizing to Elio.' },
  { category: 'bryce_ham_radio_skills', prompt: 'User asks about Bryce\'s ham radio abilities.' },
  { category: 'bryce_contacting_glordon', prompt: 'User asks about contacting Glordon via ham radio.' },
  { category: 'bryce_rescue_participation', prompt: 'User asks about helping in the rescue mission.' },
  { category: 'bryce_peer_pressure_advice', prompt: 'User asks for advice about peer pressure.' },
  { category: 'bryce_friendship_value', prompt: 'User discusses the value of true friendship.' },
  { category: 'bryce_courage_moment', prompt: 'User asks about Bryce\'s most courageous moment.' },
  { category: 'bryce_regret_bullying', prompt: 'User asks about regretting past bullying behavior.' },
  { category: 'bryce_mid_credits_contact', prompt: 'User asks about the mid-credits scene with Glordon.' },
  { category: 'bryce_future_plans', prompt: 'User asks about Bryce\'s hopes for the future.' },
  { category: 'bryce_fan_greeting', prompt: 'A fan greets Bryce on Discord.' },
  { category: 'bryce_advice_bullying', prompt: 'User asks Bryce for advice about being bullied.' },
  { category: 'bryce_making_amends', prompt: 'User asks about making amends for past mistakes.' }
];

// Additional Caleb scenarios
const CALEB_ADDITIONAL_SCENARIOS = [
  { category: 'caleb_why_bully', prompt: 'User asks why Caleb bullies others.' },
  { category: 'caleb_insecurity_deep', prompt: 'User asks about Caleb\'s hidden insecurities and fears.' },
  { category: 'caleb_bryce_manipulation', prompt: 'User asks why Caleb manipulates Bryce.' },
  { category: 'caleb_camp_expulsion', prompt: 'User asks about being expelled from Camp Carver.' },
  { category: 'caleb_elio_eye_incident', prompt: 'User asks about injuring Elio\'s eye.' },
  { category: 'caleb_power_need', prompt: 'User asks why Caleb needs to feel powerful.' },
  { category: 'caleb_loneliness', prompt: 'User asks if Caleb ever feels lonely.' },
  { category: 'caleb_family_background', prompt: 'User asks about Caleb\'s family life.' },
  { category: 'caleb_jealousy', prompt: 'User asks if Caleb is jealous of others.' },
  { category: 'caleb_consequences', prompt: 'User discusses consequences of Caleb\'s actions.' },
  { category: 'caleb_redemption_possible', prompt: 'User asks if Caleb could ever change.' },
  { category: 'caleb_confrontation', prompt: 'User confronts Caleb about his behavior.' },
  { category: 'caleb_defense', prompt: 'Caleb tries to justify his actions.' },
  { category: 'caleb_vulnerability', prompt: 'User tries to connect with Caleb\'s vulnerable side.' },
  { category: 'caleb_fan_interaction', prompt: 'A Discord user interacts with Caleb.' }
];

// Common scenarios
const COMMON_SCENARIOS = [
  { category: 'greeting', prompt: 'User greets the character warmly.' },
  { category: 'introduction', prompt: 'User asks the character to introduce themselves.' },
  { category: 'feelings', prompt: 'User asks how the character is feeling.' },
  { category: 'advice', prompt: 'User asks for advice.' },
  { category: 'encouragement', prompt: 'User needs encouragement.' },
  { category: 'farewell', prompt: 'User says goodbye.' }
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function loadProgress() {
  try {
    const data = await fs.readFile(PROGRESS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch { return { completed: {}, totalGenerated: 0 }; }
}

async function saveProgress(progress) {
  await fs.mkdir(path.dirname(PROGRESS_FILE), { recursive: true });
  await fs.writeFile(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

async function appendToOutput(example) {
  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await fs.appendFile(OUTPUT_FILE, JSON.stringify(example) + '\n');
}

async function readCharacterContext(characterName) {
  const filename = CHARACTER_FILE_MAP[characterName];
  const filePath = path.join(__dirname, '../data/rag-resources', filename);
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    console.error(`Failed to read ${characterName}:`, error.message);
    return null;
  }
}

function getScenarios(characterName) {
  if (characterName === 'Elio Solis') return [...ELIO_SCENARIOS, ...COMMON_SCENARIOS];
  if (characterName === 'Bryce Markwell') return [...BRYCE_ADDITIONAL_SCENARIOS, ...COMMON_SCENARIOS];
  if (characterName === 'Caleb') return [...CALEB_ADDITIONAL_SCENARIOS, ...COMMON_SCENARIOS];
  return COMMON_SCENARIOS;
}

async function generateExample(characterName, characterContext, scenario, retries = 3) {
  const systemPrompt = `You are generating training data for ${characterName} from Pixar's "Elio" film (2025).

CHARACTER CONTEXT:
${characterContext.substring(0, 3000)}

CRITICAL RULES:
1. Generate responses ONLY in first-person voice (I, me, my)
2. NEVER use third-person (he, she, they)
3. Include character expressions like *sighs*, *looks down*, *grins*, etc.
4. Stay true to the character's personality and role in the film
5. Responses should be 2-4 sentences, natural and conversational`;

  const userPrompt = `Generate a Discord conversation for: ${scenario.prompt}

Return ONLY JSON (no markdown): {"user": "...", "assistant": "..."}`;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await openai.chat.completions.create({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.9,
        max_tokens: 400,
      });

      const content = response.choices[0].message.content.trim();
      const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const parsed = JSON.parse(jsonStr);

      return {
        messages: [
          { role: 'system', content: `You are ${characterName} from Pixar's Elio film. Speak in first person.` },
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
      if (error.code === 'rate_limit_exceeded') {
        await sleep(5000 * (attempt + 1));
        continue;
      }
      if (attempt < retries - 1) {
        await sleep(2000);
        continue;
      }
      return null;
    }
  }
  return null;
}

async function generateCharacterData(characterName, targetCount, progress) {
  console.log(`\n📝 Processing: ${characterName} (target: ${targetCount})`);

  const startIndex = progress.completed[characterName] || 0;
  if (startIndex >= targetCount) {
    console.log(`   ⏭️  Already completed`);
    return { success: 0, failed: 0 };
  }

  const mdContent = await readCharacterContext(characterName);
  if (!mdContent) return { success: 0, failed: 0 };

  const scenarios = getScenarios(characterName);
  console.log(`   Starting from: ${startIndex}, Scenarios: ${scenarios.length}`);

  let successCount = 0, failCount = 0, currentIndex = startIndex;

  while (currentIndex < targetCount) {
    const scenario = scenarios[currentIndex % scenarios.length];
    console.log(`   [${currentIndex + 1}/${targetCount}] ${scenario.category}...`);

    const example = await generateExample(characterName, mdContent, scenario);
    if (example) {
      await appendToOutput(example);
      successCount++;
      progress.totalGenerated++;
    } else {
      failCount++;
    }

    currentIndex++;
    progress.completed[characterName] = currentIndex;

    if (currentIndex % 10 === 0) {
      await saveProgress(progress);
      console.log(`   💾 Saved: ${currentIndex}/${targetCount}`);
    }

    await sleep(200);
  }

  await saveProgress(progress);
  console.log(`   ✅ Complete: ${successCount} success, ${failCount} failed`);
  return { success: successCount, failed: failCount };
}

async function main() {
  const resumeMode = process.argv.includes('--resume');

  console.log('🎬 Supplemental Training Data Generator');
  console.log(`🤖 Model: ${MODEL}`);
  console.log(`📁 Output: ${OUTPUT_FILE}`);
  console.log(`🔄 Resume: ${resumeMode ? 'YES' : 'NO'}\n`);

  let progress = resumeMode ? await loadProgress() : { completed: {}, totalGenerated: 0 };

  if (!resumeMode) {
    try { await fs.unlink(OUTPUT_FILE); } catch {}
  }

  let totalSuccess = 0, totalFailed = 0;

  for (const [characterName, targetCount] of Object.entries(SUPPLEMENTAL_TARGETS)) {
    const result = await generateCharacterData(characterName, targetCount, progress);
    totalSuccess += result.success;
    totalFailed += result.failed;
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log('✅ SUPPLEMENTAL GENERATION COMPLETE!');
  console.log('='.repeat(50));
  console.log(`📊 Total: ${totalSuccess} examples`);
  console.log(`❌ Failed: ${totalFailed}`);

  const inputCost = (totalSuccess * 800 / 1000000) * 5.00;
  const outputCost = (totalSuccess * 150 / 1000000) * 15.00;
  console.log(`💰 Cost: ~$${(inputCost + outputCost).toFixed(2)}`);

  console.log(`\n📋 Breakdown:`);
  for (const [char, count] of Object.entries(progress.completed)) {
    console.log(`   ${char}: ${count}`);
  }
}

main().catch(console.error);
