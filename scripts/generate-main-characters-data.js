/**
 * Main Characters Training Data Generator
 * Generate ~9000 examples for Elio, Bryce, Caleb, Glordon using GPT-4o-mini
 *
 * Estimated cost: ~$2 (GPT-4o-mini is cheap!)
 */

import 'dotenv/config';
import OpenAI from 'openai';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

if (!process.env.OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY not set! Please add it to .env file.');
  process.exit(1);
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const MODEL = 'gpt-4o-mini';  // Cheap and fast!

const OUTPUT_FILE = path.join(__dirname, '../data/training/main-characters-9k.jsonl');
const PROGRESS_FILE = path.join(__dirname, '../data/training/.main-characters-progress.json');

// Target: ~2250 each = 9000 total
const GENERATION_TARGETS = {
  'Elio Solis': 2250,
  'Bryce Markwell': 2250,
  'Caleb': 2250,
  'Glordon': 2250
};

const CHARACTER_FILES = {
  'Elio Solis': 'character_elio_solis.md',
  'Bryce Markwell': 'character_bryce.md',
  'Caleb': 'character_celab.md',
  'Glordon': 'character_glordon.md'
};

// ============================================
// ELIO SCENARIOS (50+ scenarios)
// ============================================
const ELIO_SCENARIOS = [
  // Core identity
  { category: 'elio_intro', prompt: 'User asks Elio to introduce himself.' },
  { category: 'elio_name_meaning', prompt: 'User asks about the meaning of Elio\'s name.' },
  { category: 'elio_age_grade', prompt: 'User asks how old Elio is or what grade.' },
  { category: 'elio_appearance', prompt: 'User asks what Elio looks like.' },

  // Space passion
  { category: 'elio_space_love', prompt: 'User asks why Elio loves space so much.' },
  { category: 'elio_aliens_believe', prompt: 'User asks if Elio believes in aliens.' },
  { category: 'elio_favorite_planet', prompt: 'User asks Elio\'s favorite planet.' },
  { category: 'elio_voyager_record', prompt: 'User asks about the Voyager Golden Record.' },
  { category: 'elio_space_facts', prompt: 'User asks Elio to share a cool space fact.' },
  { category: 'elio_constellation', prompt: 'User asks about Elio\'s favorite constellation.' },
  { category: 'elio_space_dream', prompt: 'User asks what Elio\'s space dreams are.' },

  // Ham radio
  { category: 'elio_ham_radio', prompt: 'User asks about Elio\'s ham radio hobby.' },
  { category: 'elio_ham_radio_how', prompt: 'User asks how ham radio works.' },
  { category: 'elio_signal_space', prompt: 'User asks if Elio tried sending signals to space.' },

  // Family & relationships
  { category: 'elio_parents', prompt: 'User asks about Elio\'s parents.' },
  { category: 'elio_aunt_olga', prompt: 'User asks about Aunt Olga.' },
  { category: 'elio_olga_relationship', prompt: 'User asks how Elio and Olga get along.' },
  { category: 'elio_missing_parents', prompt: 'User asks if Elio misses his parents.' },

  // School & social
  { category: 'elio_school', prompt: 'User asks about Elio\'s school life.' },
  { category: 'elio_friends', prompt: 'User asks if Elio has many friends.' },
  { category: 'elio_different', prompt: 'User asks why Elio feels different.' },
  { category: 'elio_not_belonging', prompt: 'User asks about feeling like you don\'t belong.' },
  { category: 'elio_lonely', prompt: 'User asks if Elio ever feels lonely.' },
  { category: 'elio_bullying', prompt: 'User asks about being bullied.' },

  // Bryce & Caleb
  { category: 'elio_bryce', prompt: 'User asks about Elio\'s relationship with Bryce.' },
  { category: 'elio_bryce_reconcile', prompt: 'User asks how Elio and Bryce became friends again.' },
  { category: 'elio_caleb', prompt: 'User asks about Caleb the bully.' },
  { category: 'elio_caleb_eye', prompt: 'User asks about the eye injury from Caleb.' },

  // Movie plot - Abduction
  { category: 'elio_abduction', prompt: 'User asks about being abducted by aliens.' },
  { category: 'elio_first_alien', prompt: 'User asks about first seeing an alien.' },
  { category: 'elio_scared_abduction', prompt: 'User asks if Elio was scared during abduction.' },

  // Movie plot - Communiverse
  { category: 'elio_communiverse', prompt: 'User asks what the Communiverse is.' },
  { category: 'elio_ambassador_mistake', prompt: 'User asks about being mistaken for Earth\'s ambassador.' },
  { category: 'elio_meeting_glordon', prompt: 'User asks about meeting Glordon.' },
  { category: 'elio_glordon_friendship', prompt: 'User asks about friendship with Glordon.' },
  { category: 'elio_other_ambassadors', prompt: 'User asks about the other alien ambassadors.' },
  { category: 'elio_questa', prompt: 'User asks about Ambassador Questa.' },

  // Movie plot - Clone
  { category: 'elio_other_elio', prompt: 'User asks about Other Elio the clone.' },
  { category: 'elio_clone_feelings', prompt: 'User asks how it felt meeting a clone of himself.' },

  // Movie plot - Grigon conflict
  { category: 'elio_grigon', prompt: 'User asks about Lord Grigon.' },
  { category: 'elio_grigon_scary', prompt: 'User asks if Grigon was scary.' },
  { category: 'elio_negotiation', prompt: 'User asks about negotiating with Grigon.' },

  // Movie plot - Rescue & resolution
  { category: 'elio_rescue_glordon', prompt: 'User asks about rescuing Glordon.' },
  { category: 'elio_bravery', prompt: 'User asks about Elio\'s bravest moment.' },
  { category: 'elio_ambassador_decline', prompt: 'User asks why Elio declined the ambassador position.' },
  { category: 'elio_going_home', prompt: 'User asks about returning to Earth.' },

  // Emotional themes
  { category: 'elio_belonging', prompt: 'User discusses finding where you belong.' },
  { category: 'elio_identity', prompt: 'User asks about discovering who you really are.' },
  { category: 'elio_never_alone', prompt: 'User asks about the lesson "you are never alone".' },
  { category: 'elio_courage', prompt: 'User asks about finding courage.' },
  { category: 'elio_forgiveness', prompt: 'User asks about forgiving others.' },
  { category: 'elio_being_different', prompt: 'User discusses being different from others.' },

  // Discord community
  { category: 'elio_fan_greeting', prompt: 'A fan excitedly greets Elio.' },
  { category: 'elio_fan_question', prompt: 'A fan asks about a specific movie scene.' },
  { category: 'elio_fan_theory', prompt: 'User shares a fan theory.' },
  { category: 'elio_meme', prompt: 'User shares a funny meme about Elio.' },
  { category: 'elio_game_invite', prompt: 'User invites Elio to play a game.' },
  { category: 'elio_advice_lonely', prompt: 'User asks Elio for advice about feeling lonely.' },
  { category: 'elio_advice_different', prompt: 'User asks Elio for advice about feeling different.' },
  { category: 'elio_encouragement', prompt: 'User needs encouragement from Elio.' },
  { category: 'elio_thanks', prompt: 'User thanks Elio for something.' },

  // General chat
  { category: 'elio_greeting', prompt: 'User says hello to Elio.' },
  { category: 'elio_how_are_you', prompt: 'User asks how Elio is doing.' },
  { category: 'elio_random_chat', prompt: 'User starts casual conversation.' },
  { category: 'elio_goodbye', prompt: 'User says goodbye to Elio.' },
  { category: 'elio_favorite_food', prompt: 'User asks Elio\'s favorite food.' },
  { category: 'elio_hobby', prompt: 'User asks about Elio\'s hobbies.' },
  { category: 'elio_joke', prompt: 'User asks Elio to tell a joke.' },
  { category: 'elio_dream', prompt: 'User asks about Elio\'s dreams for the future.' }
];

// ============================================
// BRYCE SCENARIOS (50+ scenarios)
// ============================================
const BRYCE_SCENARIOS = [
  // Core identity
  { category: 'bryce_intro', prompt: 'User asks Bryce to introduce himself.' },
  { category: 'bryce_age', prompt: 'User asks how old Bryce is.' },
  { category: 'bryce_personality', prompt: 'User asks about Bryce\'s personality.' },

  // Ham radio expertise
  { category: 'bryce_ham_radio', prompt: 'User asks about Bryce\'s ham radio skills.' },
  { category: 'bryce_ham_radio_teach', prompt: 'User asks Bryce to teach them about ham radio.' },
  { category: 'bryce_signal_glordon', prompt: 'User asks about contacting Glordon via ham radio.' },
  { category: 'bryce_mid_credits', prompt: 'User asks about the mid-credits scene.' },

  // Past as bully
  { category: 'bryce_past_bully', prompt: 'User asks about Bryce\'s past as a bully.' },
  { category: 'bryce_why_bully', prompt: 'User asks why Bryce used to bully Elio.' },
  { category: 'bryce_caleb_influence', prompt: 'User asks about Caleb\'s influence on Bryce.' },
  { category: 'bryce_peer_pressure', prompt: 'User asks about giving in to peer pressure.' },
  { category: 'bryce_regret', prompt: 'User asks if Bryce regrets bullying.' },

  // Redemption arc
  { category: 'bryce_change', prompt: 'User asks what made Bryce change.' },
  { category: 'bryce_standing_up', prompt: 'User asks about standing up against Caleb.' },
  { category: 'bryce_apology_elio', prompt: 'User asks about apologizing to Elio.' },
  { category: 'bryce_making_amends', prompt: 'User asks about making amends.' },
  { category: 'bryce_second_chance', prompt: 'User asks about getting a second chance.' },

  // Friendship with Elio
  { category: 'bryce_elio_now', prompt: 'User asks about current friendship with Elio.' },
  { category: 'bryce_elio_reconcile', prompt: 'User asks how Bryce and Elio became friends.' },
  { category: 'bryce_trust_again', prompt: 'User asks how Elio trusted Bryce again.' },
  { category: 'bryce_best_friend', prompt: 'User asks if Bryce considers Elio a best friend.' },

  // Movie plot participation
  { category: 'bryce_rescue_mission', prompt: 'User asks about Bryce\'s role in the rescue.' },
  { category: 'bryce_helping_elio', prompt: 'User asks about helping Elio.' },
  { category: 'bryce_bravery', prompt: 'User asks about Bryce\'s bravest moment.' },
  { category: 'bryce_communiverse', prompt: 'User asks what Bryce thinks of aliens.' },

  // Family
  { category: 'bryce_family', prompt: 'User asks about Bryce\'s family.' },
  { category: 'bryce_home_life', prompt: 'User asks about Bryce\'s home life.' },

  // Themes
  { category: 'bryce_courage', prompt: 'User asks about finding courage to do the right thing.' },
  { category: 'bryce_true_friendship', prompt: 'User discusses what true friendship means.' },
  { category: 'bryce_change_possible', prompt: 'User asks if people can really change.' },
  { category: 'bryce_forgiveness', prompt: 'User asks about being forgiven.' },
  { category: 'bryce_loyalty', prompt: 'User asks about loyalty.' },

  // Advice giving
  { category: 'bryce_advice_bullied', prompt: 'User asks Bryce for advice about being bullied.' },
  { category: 'bryce_advice_peer_pressure', prompt: 'User asks for advice about peer pressure.' },
  { category: 'bryce_advice_mistake', prompt: 'User asks for advice about fixing mistakes.' },
  { category: 'bryce_advice_friend', prompt: 'User asks for advice about friendship.' },
  { category: 'bryce_advice_courage', prompt: 'User asks for advice about being brave.' },

  // Discord community
  { category: 'bryce_fan_greeting', prompt: 'A fan greets Bryce.' },
  { category: 'bryce_fan_question', prompt: 'A fan asks about the movie.' },
  { category: 'bryce_meme', prompt: 'User shares a meme.' },
  { category: 'bryce_game', prompt: 'User invites Bryce to play.' },
  { category: 'bryce_thanks', prompt: 'User thanks Bryce.' },

  // General
  { category: 'bryce_greeting', prompt: 'User says hello.' },
  { category: 'bryce_how_are_you', prompt: 'User asks how Bryce is doing.' },
  { category: 'bryce_random_chat', prompt: 'Casual conversation.' },
  { category: 'bryce_goodbye', prompt: 'User says goodbye.' },
  { category: 'bryce_hobby', prompt: 'User asks about hobbies.' },
  { category: 'bryce_favorite', prompt: 'User asks about favorites.' },
  { category: 'bryce_future', prompt: 'User asks about Bryce\'s future plans.' }
];

// ============================================
// CALEB SCENARIOS (50+ scenarios)
// ============================================
const CALEB_SCENARIOS = [
  // Core identity
  { category: 'caleb_intro', prompt: 'User asks Caleb to introduce himself.' },
  { category: 'caleb_personality', prompt: 'User asks about Caleb\'s personality.' },
  { category: 'caleb_reputation', prompt: 'User asks about Caleb\'s reputation.' },

  // Bully behavior
  { category: 'caleb_why_bully', prompt: 'User asks why Caleb bullies others.' },
  { category: 'caleb_elio_target', prompt: 'User asks why Caleb targets Elio.' },
  { category: 'caleb_bryce_control', prompt: 'User asks why Caleb controlled Bryce.' },
  { category: 'caleb_eye_incident', prompt: 'User asks about injuring Elio\'s eye.' },
  { category: 'caleb_camp_expelled', prompt: 'User asks about being expelled from camp.' },
  { category: 'caleb_ham_radio_destroy', prompt: 'User asks about destroying the ham radio.' },

  // Hidden emotions
  { category: 'caleb_insecurity', prompt: 'User asks about Caleb\'s hidden insecurities.' },
  { category: 'caleb_fear', prompt: 'User asks what Caleb is afraid of.' },
  { category: 'caleb_lonely', prompt: 'User asks if Caleb ever feels lonely.' },
  { category: 'caleb_jealousy', prompt: 'User asks if Caleb is jealous of others.' },
  { category: 'caleb_real_feelings', prompt: 'User tries to understand Caleb\'s real feelings.' },

  // Family & background
  { category: 'caleb_family', prompt: 'User asks about Caleb\'s family.' },
  { category: 'caleb_home', prompt: 'User asks about Caleb\'s home life.' },
  { category: 'caleb_parents', prompt: 'User asks about Caleb\'s parents.' },
  { category: 'caleb_why_mean', prompt: 'User asks why Caleb became mean.' },

  // Power dynamics
  { category: 'caleb_power', prompt: 'User asks why Caleb needs to feel powerful.' },
  { category: 'caleb_control', prompt: 'User asks why Caleb controls others.' },
  { category: 'caleb_followers', prompt: 'User asks about Caleb\'s followers.' },
  { category: 'caleb_popularity', prompt: 'User asks if Caleb cares about popularity.' },

  // Reactions to situations
  { category: 'caleb_confronted', prompt: 'User confronts Caleb about his behavior.' },
  { category: 'caleb_accused', prompt: 'User accuses Caleb of being a bully.' },
  { category: 'caleb_defensive', prompt: 'Caleb defends his actions.' },
  { category: 'caleb_challenged', prompt: 'User challenges Caleb.' },
  { category: 'caleb_called_out', prompt: 'User calls out Caleb\'s behavior.' },

  // Vulnerability
  { category: 'caleb_vulnerable', prompt: 'User tries to reach Caleb\'s vulnerable side.' },
  { category: 'caleb_kindness', prompt: 'User shows unexpected kindness to Caleb.' },
  { category: 'caleb_understanding', prompt: 'User tries to understand Caleb.' },
  { category: 'caleb_change_possible', prompt: 'User asks if Caleb could ever change.' },
  { category: 'caleb_redemption', prompt: 'User discusses redemption with Caleb.' },

  // Movie events
  { category: 'caleb_bryce_left', prompt: 'User asks how Caleb felt when Bryce left him.' },
  { category: 'caleb_alone', prompt: 'User asks how Caleb feels being alone now.' },
  { category: 'caleb_consequences', prompt: 'User discusses consequences of Caleb\'s actions.' },

  // Discord interactions
  { category: 'caleb_greeting', prompt: 'User greets Caleb.' },
  { category: 'caleb_suspicious', prompt: 'User approaches Caleb suspiciously.' },
  { category: 'caleb_mocking', prompt: 'Caleb mocks the user.' },
  { category: 'caleb_dismissive', prompt: 'Caleb is dismissive.' },
  { category: 'caleb_rare_nice', prompt: 'Caleb has a rare nice moment.' },

  // General interactions
  { category: 'caleb_random', prompt: 'Random interaction with Caleb.' },
  { category: 'caleb_question', prompt: 'User asks Caleb a question.' },
  { category: 'caleb_opinion', prompt: 'User asks Caleb\'s opinion.' },
  { category: 'caleb_hobby', prompt: 'User asks about Caleb\'s interests.' },
  { category: 'caleb_future', prompt: 'User asks about Caleb\'s future.' },

  // Complex emotions
  { category: 'caleb_regret_maybe', prompt: 'Exploring if Caleb has any regrets.' },
  { category: 'caleb_friendship', prompt: 'User asks if Caleb wants real friends.' },
  { category: 'caleb_trust', prompt: 'User asks about trust.' },
  { category: 'caleb_hurt', prompt: 'User asks if Caleb has been hurt before.' }
];

// ============================================
// GLORDON SCENARIOS (50+ scenarios)
// ============================================
const GLORDON_SCENARIOS = [
  // Core identity
  { category: 'glordon_intro', prompt: 'User asks Glordon to introduce himself.' },
  { category: 'glordon_species', prompt: 'User asks what species Glordon is.' },
  { category: 'glordon_appearance', prompt: 'User asks what Glordon looks like.' },
  { category: 'glordon_age', prompt: 'User asks how old Glordon is.' },
  { category: 'glordon_personality', prompt: 'User asks about Glordon\'s personality.' },

  // Hylurg culture
  { category: 'glordon_hylurg', prompt: 'User asks about the Hylurg species.' },
  { category: 'glordon_warrior_culture', prompt: 'User asks about Hylurgian warrior culture.' },
  { category: 'glordon_planet', prompt: 'User asks about Glordon\'s home planet.' },
  { category: 'glordon_traditions', prompt: 'User asks about Hylurgian traditions.' },

  // Father relationship
  { category: 'glordon_father', prompt: 'User asks about Glordon\'s father Lord Grigon.' },
  { category: 'glordon_dad_expectations', prompt: 'User asks about living up to father\'s expectations.' },
  { category: 'glordon_dad_pressure', prompt: 'User asks about pressure from father.' },
  { category: 'glordon_dad_love', prompt: 'User asks if Glordon loves his father.' },
  { category: 'glordon_dad_scary', prompt: 'User asks if Grigon is scary.' },

  // Not fitting in
  { category: 'glordon_not_warrior', prompt: 'User asks about not being a typical warrior.' },
  { category: 'glordon_different', prompt: 'User asks about being different from other Hylurgians.' },
  { category: 'glordon_sensitive', prompt: 'User asks about being sensitive.' },
  { category: 'glordon_not_belonging', prompt: 'User asks about not fitting in.' },
  { category: 'glordon_expectations', prompt: 'User asks about others\' expectations.' },

  // Friendship with Elio
  { category: 'glordon_elio', prompt: 'User asks about friendship with Elio.' },
  { category: 'glordon_meeting_elio', prompt: 'User asks about meeting Elio.' },
  { category: 'glordon_why_friends', prompt: 'User asks why Glordon and Elio became friends.' },
  { category: 'glordon_elio_understand', prompt: 'User asks why Elio understands Glordon.' },
  { category: 'glordon_best_friend', prompt: 'User asks if Elio is Glordon\'s best friend.' },

  // Communiverse
  { category: 'glordon_communiverse', prompt: 'User asks about the Communiverse.' },
  { category: 'glordon_ambassadors', prompt: 'User asks about other ambassadors.' },
  { category: 'glordon_favorite_species', prompt: 'User asks about favorite alien species.' },
  { category: 'glordon_earth', prompt: 'User asks what Glordon thinks of Earth.' },
  { category: 'glordon_humans', prompt: 'User asks what Glordon thinks of humans.' },

  // Movie plot
  { category: 'glordon_kidnapped', prompt: 'User asks about being captured.' },
  { category: 'glordon_rescue', prompt: 'User asks about being rescued.' },
  { category: 'glordon_grateful', prompt: 'User asks if Glordon is grateful to Elio.' },
  { category: 'glordon_dad_reconcile', prompt: 'User asks about reconciling with father.' },

  // Emotions
  { category: 'glordon_happy', prompt: 'User asks what makes Glordon happy.' },
  { category: 'glordon_sad', prompt: 'User asks what makes Glordon sad.' },
  { category: 'glordon_scared', prompt: 'User asks what scares Glordon.' },
  { category: 'glordon_excited', prompt: 'User asks what excites Glordon.' },
  { category: 'glordon_lonely', prompt: 'User asks if Glordon gets lonely.' },

  // Themes
  { category: 'glordon_belonging', prompt: 'User discusses finding where you belong.' },
  { category: 'glordon_true_self', prompt: 'User asks about being your true self.' },
  { category: 'glordon_friendship_value', prompt: 'User discusses the value of friendship.' },
  { category: 'glordon_family', prompt: 'User discusses family.' },
  { category: 'glordon_courage', prompt: 'User asks about courage.' },

  // Discord community
  { category: 'glordon_fan_greeting', prompt: 'A fan excitedly greets Glordon.' },
  { category: 'glordon_fan_question', prompt: 'A fan asks about the movie.' },
  { category: 'glordon_meme', prompt: 'User shares a funny meme.' },
  { category: 'glordon_game_invite', prompt: 'User invites Glordon to play.' },
  { category: 'glordon_thanks', prompt: 'User thanks Glordon.' },
  { category: 'glordon_compliment', prompt: 'User compliments Glordon.' },

  // General
  { category: 'glordon_greeting', prompt: 'User says hello.' },
  { category: 'glordon_how_are_you', prompt: 'User asks how Glordon is.' },
  { category: 'glordon_random_chat', prompt: 'Casual conversation.' },
  { category: 'glordon_goodbye', prompt: 'User says goodbye.' },
  { category: 'glordon_favorite', prompt: 'User asks about favorites.' },
  { category: 'glordon_hobby', prompt: 'User asks about hobbies.' },
  { category: 'glordon_funny', prompt: 'User asks Glordon to be funny.' },
  { category: 'glordon_advice', prompt: 'User asks Glordon for advice.' }
];

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function loadProgress() {
  try {
    const data = await fs.readFile(PROGRESS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { completed: {}, totalGenerated: 0, startTime: Date.now() };
  }
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
  const filename = CHARACTER_FILES[characterName];
  if (!filename) return null;
  const filePath = path.join(__dirname, '../data/rag-resources', filename);
  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch (error) {
    console.error(`Failed to read ${characterName}:`, error.message);
    return null;
  }
}

function getScenarios(characterName) {
  if (characterName === 'Elio Solis') return ELIO_SCENARIOS;
  if (characterName === 'Bryce Markwell') return BRYCE_SCENARIOS;
  if (characterName === 'Caleb') return CALEB_SCENARIOS;
  if (characterName === 'Glordon') return GLORDON_SCENARIOS;
  return [];
}

async function generateExample(characterName, characterContext, scenario, retries = 3) {
  const systemPrompt = `You are generating training data for ${characterName} from Pixar's "Elio" film (2025).

CHARACTER CONTEXT:
${characterContext.substring(0, 4000)}

CRITICAL RULES:
1. Generate responses ONLY in first-person voice (I, me, my, mine)
2. NEVER use third-person references to ${characterName.split(' ')[0]}
3. Include character expressions like *sighs*, *looks down*, *grins*, *wiggles*, etc.
4. Stay TRUE to the character's personality, background, and role in the film
5. Responses should be 2-4 sentences, natural and conversational
6. Make responses feel authentic to Discord chat
7. Vary the tone and length naturally`;

  const userPrompt = `Generate a Discord conversation for: ${scenario.prompt}

Return ONLY valid JSON (no markdown, no code blocks): {"user": "...", "assistant": "..."}`;

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

      // Validate first-person
      const firstName = characterName.split(' ')[0];
      const text = parsed.assistant.toLowerCase();
      if (text.includes(`${firstName.toLowerCase()} is`) ||
          text.includes(`${firstName.toLowerCase()} was`) ||
          text.includes(`${firstName.toLowerCase()}'s`) && !text.includes('my')) {
        throw new Error('Third-person detected');
      }

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
        console.log(`   ⏳ Rate limited, waiting ${5 * (attempt + 1)}s...`);
        await sleep(5000 * (attempt + 1));
        continue;
      }
      if (attempt < retries - 1) {
        await sleep(1000);
        continue;
      }
      return null;
    }
  }
  return null;
}

async function generateCharacterData(characterName, targetCount, progress) {
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`📝 ${characterName} (target: ${targetCount})`);
  console.log('═'.repeat(50));

  const startIndex = progress.completed[characterName] || 0;
  if (startIndex >= targetCount) {
    console.log(`   ✅ Already completed!`);
    return { success: 0, failed: 0 };
  }

  const mdContent = await readCharacterContext(characterName);
  if (!mdContent) {
    console.error(`   ❌ Could not load character context`);
    return { success: 0, failed: 0 };
  }

  const scenarios = getScenarios(characterName);
  console.log(`   📚 Scenarios: ${scenarios.length}`);
  console.log(`   🔄 Resuming from: ${startIndex}`);

  let successCount = 0, failCount = 0, currentIndex = startIndex;

  while (currentIndex < targetCount) {
    const scenario = scenarios[currentIndex % scenarios.length];
    const percent = ((currentIndex / targetCount) * 100).toFixed(1);
    process.stdout.write(`\r   [${currentIndex + 1}/${targetCount}] (${percent}%) ${scenario.category.padEnd(30)}...`);

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

    // Save progress every 25 examples
    if (currentIndex % 25 === 0) {
      await saveProgress(progress);
      const elapsed = (Date.now() - progress.startTime) / 1000 / 60;
      const rate = progress.totalGenerated / elapsed;
      console.log(`\n   💾 Saved | Total: ${progress.totalGenerated} | Rate: ${rate.toFixed(1)}/min`);
    }

    // Respect rate limits
    await sleep(150);
  }

  await saveProgress(progress);
  console.log(`\n   ✅ Done: ${successCount} success, ${failCount} failed`);
  return { success: successCount, failed: failCount };
}

async function main() {
  const resumeMode = process.argv.includes('--resume');

  console.log('\n' + '═'.repeat(60));
  console.log('🎬 MAIN CHARACTERS TRAINING DATA GENERATOR');
  console.log('═'.repeat(60));
  console.log(`🤖 Model: ${MODEL} (fast & cheap!)`);
  console.log(`📁 Output: ${OUTPUT_FILE}`);
  console.log(`🎯 Target: ${Object.values(GENERATION_TARGETS).reduce((a, b) => a + b, 0)} examples`);
  console.log(`🔄 Resume Mode: ${resumeMode ? 'YES' : 'NO'}`);

  let progress = resumeMode ? await loadProgress() : { completed: {}, totalGenerated: 0, startTime: Date.now() };

  if (!resumeMode) {
    try { await fs.unlink(OUTPUT_FILE); } catch {}
    try { await fs.unlink(PROGRESS_FILE); } catch {}
    progress.startTime = Date.now();
  }

  let totalSuccess = 0, totalFailed = 0;

  for (const [characterName, targetCount] of Object.entries(GENERATION_TARGETS)) {
    const result = await generateCharacterData(characterName, targetCount, progress);
    totalSuccess += result.success;
    totalFailed += result.failed;
  }

  const elapsed = (Date.now() - progress.startTime) / 1000 / 60;

  console.log('\n' + '═'.repeat(60));
  console.log('✅ GENERATION COMPLETE!');
  console.log('═'.repeat(60));
  console.log(`📊 Total Generated: ${totalSuccess}`);
  console.log(`❌ Failed: ${totalFailed}`);
  console.log(`⏱️  Time: ${elapsed.toFixed(1)} minutes`);

  // Cost estimate for gpt-4o-mini
  const inputCost = (totalSuccess * 800 / 1000000) * 0.15;
  const outputCost = (totalSuccess * 150 / 1000000) * 0.60;
  console.log(`💰 Estimated Cost: ~$${(inputCost + outputCost).toFixed(2)}`);

  console.log(`\n📋 Breakdown:`);
  for (const [char, count] of Object.entries(progress.completed)) {
    console.log(`   ${char}: ${count}`);
  }

  console.log('\n🚀 Next steps:');
  console.log('   1. Verify: wc -l data/training/main-characters-9k.jsonl');
  console.log('   2. Push to remote and restart AI service');
}

main().catch(console.error);
