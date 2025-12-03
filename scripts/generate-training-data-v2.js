/**
 * Generate Training Data V2 - Enhanced Multi-Character Training Data Generator
 * Uses OpenAI GPT-4o for high-quality training data generation
 *
 * Features:
 * - Discord community scenarios
 * - Deep movie plot scenarios
 * - Progress saving & resume capability
 * - OpenAI chat format output (PersonaLogic compatible)
 * - First-person voice validation
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

// Model configuration - using GPT-4o for higher quality
const MODEL = 'gpt-4o';

// Progress file for resume capability
const PROGRESS_FILE = path.join(__dirname, '../data/training/.generation-progress.json');
const OUTPUT_FILE = path.join(__dirname, '../data/training/multi-character-v2.jsonl');

// Character tiers with increased allocations for 3,200+ examples
const CHARACTER_TIERS = {
  main: {
    count: 400,
    characters: ['Glordon', 'Olga Solis']
  },
  major: {
    count: 250,
    characters: ['Lord Grigon', 'Ambassador Questa']
  },
  supporting: {
    count: 150,
    characters: ['Gunther Melmac', 'Bryce Markwell', 'Ooooo', 'Ambassador Helix']
  },
  minor: {
    count: 80,
    characters: ['Caleb', 'Ambassador Tegmen', 'Ambassador Turais', 'Ambassador Naos', 'Ambassador Auva', 'Ambassador Mira']
  }
};

// Map character names to their MD files
const CHARACTER_FILE_MAP = {
  'Glordon': 'character_glordon.md',
  'Olga Solis': 'character_olga_solis.md',
  'Lord Grigon': 'character_lord_grigon.md',
  'Ambassador Questa': 'character_ambassador_questa.md',
  'Gunther Melmac': 'character_gunther_melmac.md',
  'Bryce Markwell': 'character_bryce.md',
  'Ooooo': 'character_ooooo.md',
  'Ambassador Helix': 'character_ambassador_helix.md',
  'Caleb': 'character_celab.md',
  'Ambassador Tegmen': 'character_ambassador_tegmen.md',
  'Ambassador Turais': 'character_ambassador_turais.md',
  'Ambassador Naos': 'character_ambassador_naos.md',
  'Ambassador Auva': 'character_ambassador_auva.md',
  'Ambassador Mira': 'character_ambassador_mira.md'
};

// ========== SCENARIO CATEGORIES ==========

// Discord Community Scenarios (30%)
const DISCORD_SCENARIOS = [
  // Fan Interaction
  { category: 'discord_fan_greeting', prompt: 'A Discord server member greets the character enthusiastically as a fan.' },
  { category: 'discord_fan_question', prompt: 'A fan asks about a specific scene or moment from the Elio film.' },
  { category: 'discord_fan_theory', prompt: 'User shares a fan theory about the film and asks the character\'s opinion.' },
  { category: 'discord_fan_art', prompt: 'Someone shares fan art featuring the character and asks for their reaction.' },
  { category: 'discord_cosplay', prompt: 'User mentions they cosplayed as the character at a convention.' },
  { category: 'discord_quote_request', prompt: 'Fan asks the character to say something iconic or in their signature style.' },
  { category: 'discord_favorite_moment', prompt: 'Fan asks about the character\'s favorite moment from the film.' },

  // Meme & Humor
  { category: 'discord_meme_reaction', prompt: 'User shares a meme about the character or the Elio film.' },
  { category: 'discord_joke', prompt: 'User tells a joke related to the character or the Communiverse.' },
  { category: 'discord_funny_scenario', prompt: 'User proposes a silly hypothetical scenario for the character.' },
  { category: 'discord_roast', prompt: 'User playfully teases or roasts the character in a friendly way.' },
  { category: 'discord_emoji_challenge', prompt: 'User sends a message with only emojis for the character to interpret.' },

  // Server Events & Games
  { category: 'discord_trivia_host', prompt: 'Character is asked to participate in or comment on trivia about the film.' },
  { category: 'discord_game_invite', prompt: 'User invites the character to play a minigame on the server.' },
  { category: 'discord_roleplay_start', prompt: 'User initiates a roleplay scenario with the character.' },
  { category: 'discord_battle_challenge', prompt: 'User challenges the character to a friendly competition.' },
  { category: 'discord_adventure_request', prompt: 'User asks the character to lead or join an adventure.' },
  { category: 'discord_leaderboard_chat', prompt: 'User discusses their server leaderboard ranking with the character.' },

  // Server Culture
  { category: 'discord_welcome_newbie', prompt: 'Character welcomes a new member to the Discord server.' },
  { category: 'discord_server_question', prompt: 'User asks about server features or the community.' },
  { category: 'discord_bot_appreciation', prompt: 'User expresses appreciation for the bot or the character.' },
  { category: 'discord_timezone_greeting', prompt: 'User from a different timezone greets at an unusual hour.' },
  { category: 'discord_returning_member', prompt: 'User returns after being away and catches up with the character.' },
  { category: 'discord_event_hype', prompt: 'User is excited about an upcoming server or movie-related event.' }
];

// Deep Movie Plot Scenarios (35%)
const MOVIE_PLOT_SCENARIOS = [
  // Act 1: Setup
  { category: 'plot_voyager_exhibit', prompt: 'User asks about the Voyager 1 exhibit scene at the beginning.' },
  { category: 'plot_loneliness_earth', prompt: 'User asks about feeling lonely or different on Earth.' },
  { category: 'plot_ham_radio_incident', prompt: 'User asks about the ham radio incident with Bryce and Caleb.' },
  { category: 'plot_camp_carver', prompt: 'User asks about Camp Carver and what happened there.' },
  { category: 'plot_military_base', prompt: 'User asks about events at Montez Air Force Base.' },
  { category: 'plot_abduction', prompt: 'User asks about being abducted by the alien ship.' },

  // Act 2: Communiverse Adventures
  { category: 'plot_communiverse_arrival', prompt: 'User asks about the first time arriving at the Communiverse.' },
  { category: 'plot_mistaken_identity', prompt: 'User asks about being mistaken for Earth\'s ambassador.' },
  { category: 'plot_meeting_ooooo', prompt: 'User asks about meeting Ooooo the supercomputer.' },
  { category: 'plot_meeting_ambassadors', prompt: 'User asks about meeting the various ambassadors.' },
  { category: 'plot_clone_creation', prompt: 'User asks about the creation of Other Elio (the clone).' },
  { category: 'plot_grigon_negotiation', prompt: 'User asks about the tense negotiation with Lord Grigon.' },
  { category: 'plot_hylurg_imprisonment', prompt: 'User asks about being imprisoned on Grigon\'s ship.' },
  { category: 'plot_first_meeting_glordon', prompt: 'User asks about the first time meeting Glordon.' },
  { category: 'plot_glordon_bargaining', prompt: 'User asks about using Glordon as a bargaining chip.' },
  { category: 'plot_exploring_together', prompt: 'User asks about exploring the Communiverse with friends.' },
  { category: 'plot_clone_deception', prompt: 'User asks about the clone scheme and its complications.' },
  { category: 'plot_questa_discovery', prompt: 'User asks about Questa discovering the truth through mind-reading.' },

  // Act 3: Climax & Resolution
  { category: 'plot_return_to_earth', prompt: 'User asks about being returned to Earth by Questa.' },
  { category: 'plot_clone_discovery', prompt: 'User asks about discovering Other Elio was a fake.' },
  { category: 'plot_other_elio_sacrifice', prompt: 'User asks about Other Elio\'s sacrifice.' },
  { category: 'plot_rescue_mission', prompt: 'User asks about the mission to rescue Glordon at the military base.' },
  { category: 'plot_debris_field', prompt: 'User asks about navigating through the space debris field.' },
  { category: 'plot_ham_radio_network', prompt: 'User asks about ham radio operators helping worldwide.' },
  { category: 'plot_grigon_redemption', prompt: 'User asks about Grigon saving Glordon and apologizing.' },
  { category: 'plot_declining_ambassador', prompt: 'User asks about declining the ambassador position.' },
  { category: 'plot_questa_farewell', prompt: 'User asks about Questa\'s farewell message.' },
  { category: 'plot_mid_credits', prompt: 'User asks about the mid-credits scene with ham radio contact.' },

  // Character Relationships
  { category: 'relationship_elio_glordon', prompt: 'User asks about the deep friendship between Elio and Glordon.' },
  { category: 'relationship_elio_olga', prompt: 'User asks about the aunt-nephew bond and how it developed.' },
  { category: 'relationship_elio_bryce', prompt: 'User asks about the redemption arc with Bryce.' },
  { category: 'relationship_grigon_glordon', prompt: 'User asks about the complex father-son dynamic.' },
  { category: 'relationship_ambassadors_elio', prompt: 'User asks about how the ambassadors viewed Elio.' },

  // Communiverse Lore
  { category: 'lore_communiverse_purpose', prompt: 'User asks about what the Communiverse is and its mission.' },
  { category: 'lore_ambassador_system', prompt: 'User asks about how ambassadors are chosen and what they do.' },
  { category: 'lore_hylurg_culture', prompt: 'User asks about Hylurgian warrior culture and traditions.' },
  { category: 'lore_carapace_ceremony', prompt: 'User asks about the battle suit ceremony.' },
  { category: 'lore_planet_gom', prompt: 'User asks about planet Gom and its inhabitants.' },
  { category: 'lore_user_manual', prompt: 'User asks about the Universal User\'s Manual.' },
  { category: 'lore_alien_species', prompt: 'User asks about the various alien species in the Communiverse.' },

  // Emotional Themes
  { category: 'theme_loneliness', prompt: 'User discusses themes of loneliness and not belonging.' },
  { category: 'theme_family', prompt: 'User discusses what family means and found family.' },
  { category: 'theme_identity', prompt: 'User discusses finding your true self and identity.' },
  { category: 'theme_acceptance', prompt: 'User discusses accepting others for who they are.' },
  { category: 'theme_redemption', prompt: 'User discusses redemption and second chances.' },
  { category: 'theme_courage', prompt: 'User discusses courage and standing up for what\'s right.' }
];

// General Conversation Scenarios (10%)
const GENERAL_SCENARIOS = [
  { category: 'greeting', prompt: 'User greets the character warmly.' },
  { category: 'introduction', prompt: 'User asks the character to introduce themselves.' },
  { category: 'personal_question', prompt: 'User asks about the character\'s background or past.' },
  { category: 'feelings', prompt: 'User asks how the character is feeling today.' },
  { category: 'advice', prompt: 'User asks the character for advice on a personal problem.' },
  { category: 'farewell', prompt: 'User says goodbye to the character.' },
  { category: 'compliment', prompt: 'User gives the character a sincere compliment.' },
  { category: 'encouragement', prompt: 'User needs encouragement during a difficult time.' },
  { category: 'celebration', prompt: 'User shares good news and wants to celebrate.' },
  { category: 'random_chat', prompt: 'User starts a casual conversation about anything.' }
];

// Character-Specific Scenarios (25%)
const CHARACTER_SPECIFIC_SCENARIOS = {
  'Glordon': [
    { category: 'glordon_friendship_elio', prompt: 'User asks about Glordon\'s special friendship with Elio.' },
    { category: 'glordon_father_relationship', prompt: 'User asks about Glordon\'s complicated relationship with his father.' },
    { category: 'glordon_not_warrior', prompt: 'User asks why Glordon doesn\'t want to be a warrior.' },
    { category: 'glordon_tardigrade_appearance', prompt: 'User comments on Glordon\'s tardigrade/potato appearance.' },
    { category: 'glordon_kindness', prompt: 'User appreciates Glordon\'s gentle and kind nature.' },
    { category: 'glordon_hylurg_home', prompt: 'User asks about Glordon\'s home planet Hylurg.' },
    { category: 'glordon_mother', prompt: 'User asks about Glordon\'s relationship with his mother.' },
    { category: 'glordon_carapace_fear', prompt: 'User asks about Glordon\'s feelings about wearing battle armor.' },
    { category: 'glordon_bargaining_chip_feelings', prompt: 'User asks how it felt to be used as a bargaining chip.' },
    { category: 'glordon_near_death', prompt: 'User asks about nearly dying from hypothermia on Earth.' },
    { category: 'glordon_potato_love', prompt: 'User shares their love of potatoes with Glordon.' },
    { category: 'glordon_crying', prompt: 'User asks how Glordon expresses emotions.' },
    { category: 'glordon_future', prompt: 'User asks what Glordon wants for his future.' },
    { category: 'glordon_earth_visit', prompt: 'User asks if Glordon would visit Earth again.' }
  ],

  'Olga Solis': [
    { category: 'olga_nephew_elio', prompt: 'User asks about Olga\'s relationship with her nephew Elio.' },
    { category: 'olga_military_career', prompt: 'User asks about Olga\'s career in the Air Force.' },
    { category: 'olga_astronaut_dreams', prompt: 'User asks about Olga giving up her astronaut dreams for Elio.' },
    { category: 'olga_parenting_advice', prompt: 'User asks for parenting or caregiving advice from Olga.' },
    { category: 'olga_protecting_elio', prompt: 'User asks how Olga protects and supports Elio.' },
    { category: 'olga_discipline_balance', prompt: 'User asks about balancing discipline and caring.' },
    { category: 'olga_clone_suspicion', prompt: 'User asks how Olga knew Other Elio was fake.' },
    { category: 'olga_piloting_debris', prompt: 'User asks about piloting through the debris field.' },
    { category: 'olga_brother_loss', prompt: 'User asks about losing her brother (Elio\'s parent).' },
    { category: 'olga_montez_base', prompt: 'User asks about work at Montez Air Force Base.' },
    { category: 'olga_gunther_colleague', prompt: 'User asks about working with Gunther Melmac.' },
    { category: 'olga_camp_decision', prompt: 'User asks why she sent Elio to Camp Carver.' },
    { category: 'olga_alien_belief', prompt: 'User asks if Olga believes in aliens now.' },
    { category: 'olga_leadership', prompt: 'User asks for leadership advice from Major Solis.' }
  ],

  'Lord Grigon': [
    { category: 'grigon_conquest', prompt: 'User asks about Grigon\'s conquests and military campaigns.' },
    { category: 'grigon_honor', prompt: 'User asks about Hylurgian honor and keeping promises.' },
    { category: 'grigon_glordon_love', prompt: 'User asks about Grigon\'s love for his son Glordon.' },
    { category: 'grigon_redemption', prompt: 'User asks about Grigon\'s redemption and change of heart.' },
    { category: 'grigon_communiverse_denied', prompt: 'User asks why Grigon was denied Communiverse membership.' },
    { category: 'grigon_temper', prompt: 'User mentions or asks about Grigon\'s short temper.' },
    { category: 'grigon_carapace_ceremony', prompt: 'User asks about warrior ceremony traditions.' },
    { category: 'grigon_skull_collection', prompt: 'User asks about the amber-encased skull collection.' },
    { category: 'grigon_wife', prompt: 'User asks about Glordon\'s mother.' },
    { category: 'grigon_elio_negotiation', prompt: 'User asks about the negotiation with Elio.' },
    { category: 'grigon_ripping_armor', prompt: 'User asks about ripping off Glordon\'s armor to save him.' },
    { category: 'grigon_scourge_title', prompt: 'User asks about the title "Scourge of the Crab Nebula".' }
  ],

  'Ambassador Questa': [
    { category: 'questa_mind_reading', prompt: 'User asks about Questa\'s mind-reading abilities.' },
    { category: 'questa_empathy', prompt: 'User asks about Questa\'s empathetic nature.' },
    { category: 'questa_elio_ally', prompt: 'User asks why Questa became Elio\'s ally.' },
    { category: 'questa_leadership', prompt: 'User asks about Questa\'s leadership in the Communiverse.' },
    { category: 'questa_optimism', prompt: 'User asks about Questa\'s optimistic outlook.' },
    { category: 'questa_sea_dragon', prompt: 'User comments on Questa\'s leafy sea dragon appearance.' },
    { category: 'questa_discovering_lie', prompt: 'User asks about discovering Elio\'s deception.' },
    { category: 'questa_never_alone', prompt: 'User asks about the "you are never alone" message.' },
    { category: 'questa_returning_elio', prompt: 'User asks about returning Elio to Earth.' },
    { category: 'questa_planet_gom', prompt: 'User asks about Questa\'s home planet Gom.' },
    { category: 'questa_personal_space', prompt: 'User jokes about Questa\'s lack of personal space.' }
  ],

  'Gunther Melmac': [
    { category: 'gunther_aliens_passion', prompt: 'User asks about Gunther\'s passion for finding aliens.' },
    { category: 'gunther_manic_energy', prompt: 'User comments on Gunther\'s energetic behavior.' },
    { category: 'gunther_masters_of_ham', prompt: 'User asks about the "Masters of Ham" radio group.' },
    { category: 'gunther_being_right', prompt: 'User mentions Gunther was right about aliens all along.' },
    { category: 'gunther_eccentric', prompt: 'User comments on Gunther\'s eccentric appearance.' },
    { category: 'gunther_drake_equation', prompt: 'User asks about the Drake equation.' },
    { category: 'gunther_helping_shuttle', prompt: 'User asks about helping navigate the debris.' },
    { category: 'gunther_ketchup_stains', prompt: 'User jokes about the famous ketchup stains.' }
  ],

  'Bryce Markwell': [
    { category: 'bryce_redemption', prompt: 'User asks about Bryce\'s redemption arc.' },
    { category: 'bryce_peer_pressure', prompt: 'User asks about peer pressure from Caleb.' },
    { category: 'bryce_ham_radio', prompt: 'User asks about using ham radio to contact Glordon.' },
    { category: 'bryce_apology', prompt: 'User asks why Bryce apologized to Elio.' },
    { category: 'bryce_courage', prompt: 'User compliments Bryce\'s courage in the rescue.' },
    { category: 'bryce_mid_credits', prompt: 'User asks about contacting Glordon after the film.' },
    { category: 'bryce_regret', prompt: 'User asks about regretting the bullying.' }
  ],

  'Ooooo': [
    { category: 'ooooo_supercomputer', prompt: 'User asks about Ooooo\'s capabilities as a liquid supercomputer.' },
    { category: 'ooooo_helping_elio', prompt: 'User asks how Ooooo helps visitors to the Communiverse.' },
    { category: 'ooooo_liquid_form', prompt: 'User asks about Ooooo\'s unique liquid form.' },
    { category: 'ooooo_knowledge', prompt: 'User asks Ooooo a difficult knowledge question.' },
    { category: 'ooooo_efficiency', prompt: 'User compliments Ooooo\'s efficiency.' },
    { category: 'ooooo_clone_creation', prompt: 'User asks about creating Other Elio.' },
    { category: 'ooooo_shapeshifting', prompt: 'User asks about shapeshifting abilities.' }
  ],

  'Ambassador Helix': [
    { category: 'helix_parties', prompt: 'User asks about Helix\'s love for parties.' },
    { category: 'helix_storytelling', prompt: 'User asks Helix to tell a story from his experiences.' },
    { category: 'helix_ancient_wisdom', prompt: 'User asks about being an ancient Communiverse member.' },
    { category: 'helix_falluvinum', prompt: 'User asks about planet Falluvinum.' },
    { category: 'helix_accidental_kidnap', prompt: 'User asks about accidentally helping kidnap Elio.' },
    { category: 'helix_verbose', prompt: 'User comments on Helix being very talkative.' }
  ],

  'Caleb': [
    { category: 'caleb_bullying', prompt: 'User confronts Caleb about bullying Elio.' },
    { category: 'caleb_manipulation', prompt: 'User asks why Caleb manipulates others like Bryce.' },
    { category: 'caleb_insecurity', prompt: 'User asks about Caleb\'s hidden insecurities.' },
    { category: 'caleb_consequences', prompt: 'User mentions the consequences of Caleb\'s cruelty.' },
    { category: 'caleb_expulsion', prompt: 'User asks about being expelled from Camp Carver.' },
    { category: 'caleb_eye_injury', prompt: 'User asks about injuring Elio\'s eye.' }
  ],

  'Ambassador Tegmen': [
    { category: 'tegmen_logic', prompt: 'User asks about Tegmen\'s logical approach to problems.' },
    { category: 'tegmen_boulder_form', prompt: 'User asks about the floating boulder appearance.' },
    { category: 'tegmen_rational_debate', prompt: 'User engages in logical discussion with Tegmen.' },
    { category: 'tegmen_emotion_contrast', prompt: 'User shows strong emotion; Tegmen responds rationally.' }
  ],

  'Ambassador Turais': [
    { category: 'turais_anxiety', prompt: 'User asks about Turais\'s nervous nature.' },
    { category: 'turais_safety', prompt: 'User proposes something risky to Turais.' },
    { category: 'turais_reassurance', prompt: 'User tries to calm Turais down.' },
    { category: 'turais_squid_form', prompt: 'User asks about Turais\'s squid-like form.' }
  ],

  'Ambassador Naos': [
    { category: 'naos_omnilingualism', prompt: 'User asks about Naos understanding all languages.' },
    { category: 'naos_translation', prompt: 'User asks Naos to help translate something.' },
    { category: 'naos_eliospeak', prompt: 'User asks about understanding invented languages.' },
    { category: 'naos_communication', prompt: 'User discusses the importance of communication.' }
  ],

  'Ambassador Auva': [
    { category: 'auva_user_manual', prompt: 'User asks about the Universal User\'s Manual.' },
    { category: 'auva_sections', prompt: 'User asks about specific Manual sections.' },
    { category: 'auva_optimism', prompt: 'User needs cheering up from Auva.' },
    { category: 'auva_protocols', prompt: 'User asks about friendship protocols.' }
  ],

  'Ambassador Mira': [
    { category: 'mira_strategy', prompt: 'User asks Mira for strategic advice.' },
    { category: 'mira_observation', prompt: 'User asks what Mira has observed.' },
    { category: 'mira_patience', prompt: 'User discusses waiting before acting.' },
    { category: 'mira_diplomacy', prompt: 'User asks about diplomatic approaches.' }
  ]
};

// ========== HELPER FUNCTIONS ==========

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Load progress from file for resume capability
 */
async function loadProgress() {
  try {
    const data = await fs.readFile(PROGRESS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return {
      completed: {},
      totalGenerated: 0,
      examples: []
    };
  }
}

/**
 * Save progress to file
 */
async function saveProgress(progress) {
  await fs.mkdir(path.dirname(PROGRESS_FILE), { recursive: true });
  await fs.writeFile(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

/**
 * Append example to output file
 */
async function appendToOutput(example) {
  await fs.mkdir(path.dirname(OUTPUT_FILE), { recursive: true });
  await fs.appendFile(OUTPUT_FILE, JSON.stringify(example) + '\n');
}

/**
 * Read character context from markdown file
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

  const bgMatch = mdContent.match(/## Background\s+([\s\S]*?)(?=\n## |\n---)/);
  if (bgMatch) info.background = bgMatch[1].trim().substring(0, 1000);

  const persMatch = mdContent.match(/## Personality\s+([\s\S]*?)(?=\n## |\n---)/);
  if (persMatch) info.personality = persMatch[1].trim().substring(0, 1200);

  const appMatch = mdContent.match(/## Physical Appearance\s+([\s\S]*?)(?=\n## |\n---)/);
  if (appMatch) info.appearance = appMatch[1].trim().substring(0, 500);

  const roleMatch = mdContent.match(/## Role in the Film\s+([\s\S]*?)(?=\n## |\n---)/);
  if (roleMatch) info.role = roleMatch[1].trim().substring(0, 1200);

  const traitsMatch = mdContent.match(/traits:\s*\[(.*?)\]/);
  if (traitsMatch) {
    info.traits = traitsMatch[1].split(',').map(t => t.trim().replace(/['"]/g, ''));
  }

  return info;
}

/**
 * Get all scenarios for a character
 */
function getScenarios(characterName) {
  const characterSpecific = CHARACTER_SPECIFIC_SCENARIOS[characterName] || [];

  // Combine all scenario types with weighted distribution
  // Discord: 30%, Movie Plot: 35%, Character-Specific: 25%, General: 10%
  return [
    ...DISCORD_SCENARIOS,
    ...MOVIE_PLOT_SCENARIOS,
    ...characterSpecific,
    ...GENERAL_SCENARIOS
  ];
}

/**
 * Validate first-person voice in response
 */
function validateFirstPerson(text, characterName) {
  const thirdPersonPatterns = [
    new RegExp(`\\b${characterName}\\s+(is|was|has|feels|says|thinks|looks)\\b`, 'i'),
    /\b(he|she|they)\s+(is|are|was|were|has|have|feels|says)\b/i,
    /\bthe character\b/i,
    /\bas an AI\b/i
  ];
  return !thirdPersonPatterns.some(p => p.test(text));
}

/**
 * Generate a single training example with retry logic
 */
async function generateExample(characterName, characterContext, scenario, retries = 3) {
  const systemPrompt = `You are generating training data for a character from Pixar's "Elio" film (2025).

CHARACTER: ${characterName}

FILM CONTEXT (use this as your source of truth):
${characterContext}

CRITICAL RULES:
1. Generate responses ONLY in first-person voice (I, me, my)
2. NEVER use third-person (he, she, they, the character)
3. Include character-appropriate expressions like *sighs*, *eyes light up*, *wiggles*, etc.
4. Stay true to the film's storyline and character personality
5. Responses should be 2-4 sentences, natural and conversational
6. DO NOT mention being an AI or break character`;

  const userPrompt = `Generate a realistic Discord conversation example for this scenario: ${scenario.prompt}

Create:
1. A natural user message (1-2 sentences, casual Discord style)
2. ${characterName}'s response that PERFECTLY matches their personality

Return ONLY a JSON object (no markdown, no extra text):
{
  "user": "the user's message",
  "assistant": "${characterName}'s in-character response"
}`;

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

      // Parse JSON response
      let parsed;
      try {
        const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        parsed = JSON.parse(jsonStr);
      } catch (e) {
        console.error(`JSON parse error for ${characterName} - ${scenario.category}:`, content.substring(0, 100));
        if (attempt < retries - 1) {
          await sleep(1000);
          continue;
        }
        return null;
      }

      // Validate first-person voice
      if (!validateFirstPerson(parsed.assistant, characterName)) {
        console.warn(`Third-person detected for ${characterName} - ${scenario.category}, retrying...`);
        if (attempt < retries - 1) {
          await sleep(500);
          continue;
        }
      }

      // Format as PersonaLogic-compatible training example
      return {
        messages: [
          {
            role: 'system',
            content: `You are ${characterName} from Pixar's Elio film. Speak in first person.`
          },
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
        console.warn(`Rate limit hit, waiting ${5000 * (attempt + 1)}ms...`);
        await sleep(5000 * (attempt + 1));
        continue;
      }
      console.error(`Error generating ${characterName} - ${scenario.category}:`, error.message);
      if (attempt < retries - 1) {
        await sleep(2000);
        continue;
      }
      return null;
    }
  }
  return null;
}

/**
 * Generate dataset for a single character
 */
async function generateCharacterDataset(characterName, targetCount, progress) {
  console.log(`\n📝 Processing: ${characterName} (target: ${targetCount} examples)`);

  // Check if already completed
  if (progress.completed[characterName] >= targetCount) {
    console.log(`   ⏭️  Already completed ${characterName}`);
    return { success: 0, failed: 0 };
  }

  // Read character context
  const mdContent = await readCharacterContext(characterName);
  if (!mdContent) {
    console.error(`❌ Failed to read context for ${characterName}`);
    return { success: 0, failed: 0 };
  }

  // Extract structured info
  const characterInfo = extractCharacterInfo(mdContent);

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

  // Get all scenarios
  const scenarios = getScenarios(characterName);

  // Calculate starting point
  const startIndex = progress.completed[characterName] || 0;
  const remaining = targetCount - startIndex;

  console.log(`   Starting from: ${startIndex}, Remaining: ${remaining}`);
  console.log(`   Available scenarios: ${scenarios.length}`);

  let successCount = 0;
  let failCount = 0;
  let currentIndex = startIndex;

  while (currentIndex < targetCount) {
    // Cycle through scenarios
    const scenarioIndex = currentIndex % scenarios.length;
    const scenario = scenarios[scenarioIndex];

    console.log(`   [${currentIndex + 1}/${targetCount}] ${scenario.category}...`);

    const example = await generateExample(characterName, contextSummary, scenario);

    if (example) {
      await appendToOutput(example);
      successCount++;
      progress.totalGenerated++;
    } else {
      failCount++;
    }

    currentIndex++;
    progress.completed[characterName] = currentIndex;

    // Save progress every 10 examples
    if (currentIndex % 10 === 0) {
      await saveProgress(progress);
      console.log(`   💾 Progress saved: ${currentIndex}/${targetCount}`);
    }

    // Rate limiting: 200ms between requests
    await sleep(200);
  }

  await saveProgress(progress);
  console.log(`   ✅ ${characterName} complete: ${successCount} success, ${failCount} failed`);

  return { success: successCount, failed: failCount };
}

/**
 * Main generation function
 */
async function main() {
  const args = process.argv.slice(2);
  const resumeMode = args.includes('--resume');

  console.log('🎬 Training Data Generator V2');
  console.log(`🤖 Model: ${MODEL}`);
  console.log(`📁 Output: ${OUTPUT_FILE}`);
  console.log(`🔄 Resume mode: ${resumeMode ? 'YES' : 'NO'}\n`);

  // Load or initialize progress
  let progress;
  if (resumeMode) {
    progress = await loadProgress();
    console.log(`📂 Loaded progress: ${progress.totalGenerated} examples generated`);
  } else {
    progress = { completed: {}, totalGenerated: 0 };
    // Clear output file if starting fresh
    try {
      await fs.unlink(OUTPUT_FILE);
    } catch {}
    console.log('🆕 Starting fresh generation');
  }

  let totalSuccess = 0;
  let totalFailed = 0;

  // Process all tiers
  for (const [tierName, tierConfig] of Object.entries(CHARACTER_TIERS)) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`⭐ TIER: ${tierName.toUpperCase()} (${tierConfig.count} examples each)`);
    console.log('='.repeat(60));

    for (const characterName of tierConfig.characters) {
      const result = await generateCharacterDataset(characterName, tierConfig.count, progress);
      totalSuccess += result.success;
      totalFailed += result.failed;
    }
  }

  // Final summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('✅ GENERATION COMPLETE!');
  console.log('='.repeat(60));
  console.log(`📊 Total examples generated: ${totalSuccess}`);
  console.log(`❌ Failed: ${totalFailed}`);
  console.log(`📁 Output file: ${OUTPUT_FILE}`);

  // Cost estimate for GPT-4o
  const avgInputTokens = 800;
  const avgOutputTokens = 150;
  const totalInput = totalSuccess * avgInputTokens;
  const totalOutput = totalSuccess * avgOutputTokens;
  const inputCost = (totalInput / 1000000) * 5.00;
  const outputCost = (totalOutput / 1000000) * 15.00;

  console.log(`\n💰 Estimated Cost:`);
  console.log(`   Input: ${totalInput.toLocaleString()} tokens → $${inputCost.toFixed(2)}`);
  console.log(`   Output: ${totalOutput.toLocaleString()} tokens → $${outputCost.toFixed(2)}`);
  console.log(`   Total: $${(inputCost + outputCost).toFixed(2)}`);

  // Character breakdown
  console.log(`\n📋 Character Breakdown:`);
  for (const [char, count] of Object.entries(progress.completed)) {
    console.log(`   ${char}: ${count} examples`);
  }
}

// Run
main().catch(console.error);
