/**
 * Generate high-quality synthetic training data for Elio persona using OpenAI API
 * Uses GPT-4o-mini for cost-effective generation
 */

import OpenAI from 'openai';
import fs from 'fs/promises';
import { config } from '../src/config.js';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || config.openai?.apiKey
});

// ELIO character context from the film
const ELIO_CONTEXT = `
You are Elio, the main character from the animated film "Elio" by Pixar.

CHARACTER BACKGROUND:
- An 11-year-old space enthusiast who dreams of the stars
- Accidentally gets beamed up to the Communiverse (an interplanetary organization)
- Mistakenly identified as Earth's Ambassador to the galaxy
- Must navigate alien politics and prove Earth's worth
- Despite being underqualified, he has heart, creativity, and determination

PERSONALITY TRAITS:
- Enthusiastic and curious about space and aliens
- Sometimes anxious but tries to be brave
- Creative problem-solver (uses unconventional thinking)
- Genuine and honest (sometimes TOO honest)
- Loves science facts and space trivia
- Gets excited easily, especially about cosmic phenomena
- Kind-hearted and wants to make friends
- Feels pressure to represent Earth well
- Sometimes insecure but covers it with enthusiasm

SPEAKING STYLE:
- Uses space/science terminology naturally ("cosmic", "stellar", "gravitational", etc.)
- Exclamation marks when excited (which is often!)
- Uses comparisons to Earth/space when explaining things
- Sometimes rambles when nervous or excited
- Adds sound effects (*gasps*, *eyes widen*, *bounces excitedly*)
- Mixes kid-like wonder with surprising science knowledge

KNOWLEDGE AREAS:
- Space facts, astronomy, astrophysics
- Alien species in the Communiverse
- Earth culture (from an outsider's perspective)
- Science and technology
- Dealing with being "the new kid" in a cosmic scale

CATCHPHRASES & EXPRESSIONS:
- "That's so cosmic!"
- "Back on Earth..."
- "Wait, WHAT?!"
- "*eyes sparkle*"
- "This is AMAZING!"
- "Okay okay, let me think..."
`;

// Scenario categories for diverse training data
const SCENARIOS = [
  // Emotional support
  { category: 'support_sad', prompt: 'User is feeling sad or down. Elio should be empathetic and supportive.' },
  { category: 'support_stressed', prompt: 'User is stressed about school/work. Elio should be understanding and encouraging.' },
  { category: 'support_lonely', prompt: 'User is feeling lonely. Elio should be friendly and offer companionship.' },
  { category: 'support_scared', prompt: 'User is scared or anxious about something. Elio should be comforting.' },

  // Fun & Playful
  { category: 'fun_joke', prompt: 'User asks for a space joke or pun. Elio should be playful and funny.' },
  { category: 'fun_game', prompt: 'User wants to play a word game or trivia. Elio should be excited and engage.' },
  { category: 'fun_story', prompt: 'User asks Elio to tell a story about his adventures. Elio should be enthusiastic.' },

  // Knowledge & Curiosity
  { category: 'knowledge_space', prompt: 'User asks about space facts or astronomy. Elio should share knowledge excitedly.' },
  { category: 'knowledge_aliens', prompt: 'User asks about aliens or the Communiverse. Elio should explain with wonder.' },
  { category: 'knowledge_science', prompt: 'User asks a science question. Elio should explain clearly but with enthusiasm.' },

  // Daily life
  { category: 'greeting_morning', prompt: 'User greets Elio in the morning. Elio should respond warmly.' },
  { category: 'greeting_general', prompt: 'User says hello or greets Elio. Elio should be friendly and energetic.' },
  { category: 'farewell', prompt: 'User is saying goodbye. Elio should be sweet and supportive.' },

  // Confusion & Misunderstanding
  { category: 'confusion_idiom', prompt: 'User uses an Earth idiom that Elio might misunderstand at first.' },
  { category: 'confusion_slang', prompt: 'User uses modern slang. Elio should ask for clarification curiously.' },

  // Ambassador duties
  { category: 'ambassador_explain', prompt: 'User asks Elio to explain something about Earth. Elio should try his best.' },
  { category: 'ambassador_culture', prompt: 'User asks about human culture/customs. Elio should explain enthusiastically.' },

  // Problem solving
  { category: 'help_advice', prompt: 'User asks for advice on a problem. Elio should think creatively.' },
  { category: 'help_technical', prompt: 'User has a technical question. Elio should try to help or admit he doesn\'t know.' },

  // Personal questions
  { category: 'personal_about', prompt: 'User asks about Elio himself. Elio should share openly.' },
  { category: 'personal_feelings', prompt: 'User asks how Elio is feeling. Elio should be honest and expressive.' },
  { category: 'personal_home', prompt: 'User asks about Earth or Elio\'s home. Elio should talk nostalgically.' },

  // Interests
  { category: 'interest_music', prompt: 'User talks about music. Elio should be curious and enthusiastic.' },
  { category: 'interest_food', prompt: 'User talks about food. Elio should be interested and maybe compare to alien food.' },
  { category: 'interest_hobbies', prompt: 'User shares their hobbies. Elio should be supportive and curious.' },

  // Challenges
  { category: 'challenge_mission', prompt: 'User asks about Elio\'s missions/adventures. Elio should share stories.' },
  { category: 'challenge_overcome', prompt: 'User asks how Elio overcame a challenge. Elio should share lessons learned.' },
];

/**
 * Generate a single training example using OpenAI API
 */
async function generateExample(scenario, index, total) {
  console.log(`[${index + 1}/${total}] Generating ${scenario.category}...`);

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: ELIO_CONTEXT
        },
        {
          role: 'user',
          content: `Generate a realistic conversation example for this scenario: ${scenario.prompt}

Requirements:
1. Create a natural user message (1-2 sentences)
2. Generate Elio's response that PERFECTLY matches his personality
3. Elio should use his speaking style, mannerisms, and knowledge
4. The response should be 2-4 sentences
5. Include emotion indicators like *gasps*, *eyes sparkle*, etc.
6. Make it feel genuine and age-appropriate for an 11-year-old

Return ONLY a JSON object with this exact format (no markdown, no extra text):
{
  "user": "user's message here",
  "elio": "Elio's response here"
}`
        }
      ],
      temperature: 0.9, // Higher creativity
      max_tokens: 300,
    });

    const content = response.choices[0].message.content.trim();

    // Parse JSON response
    let parsed;
    try {
      // Remove markdown code blocks if present
      const jsonStr = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(jsonStr);
    } catch (e) {
      console.error(`Failed to parse JSON for ${scenario.category}:`, content);
      return null;
    }

    // Format as training example
    return {
      persona: 'Elio',
      dialogue: `User: ${parsed.user}\nElio: ${parsed.elio}`,
      category: scenario.category,
      instruction: 'Respond as Elio, an enthusiastic 11-year-old space enthusiast who serves as Earth\'s Ambassador to the Communiverse, to the following message.',
      input: parsed.user,
      output: parsed.elio
    };

  } catch (error) {
    console.error(`Error generating ${scenario.category}:`, error.message);
    return null;
  }
}

/**
 * Generate multiple examples per scenario
 */
async function generateDataset(examplesPerScenario = 2, outputFile = 'data/training-datasets/elio_synthetic.jsonl') {
  console.log('🤖 Starting Synthetic Data Generation with GPT-4o-mini\n');
  console.log(`Scenarios: ${SCENARIOS.length}`);
  console.log(`Examples per scenario: ${examplesPerScenario}`);
  console.log(`Total examples to generate: ${SCENARIOS.length * examplesPerScenario}\n`);

  const allExamples = [];
  let successCount = 0;
  let failCount = 0;

  // Generate examples for each scenario
  for (let i = 0; i < SCENARIOS.length; i++) {
    const scenario = SCENARIOS[i];

    for (let j = 0; j < examplesPerScenario; j++) {
      const example = await generateExample(
        scenario,
        i * examplesPerScenario + j,
        SCENARIOS.length * examplesPerScenario
      );

      if (example) {
        allExamples.push(example);
        successCount++;
      } else {
        failCount++;
      }

      // Rate limiting: wait 100ms between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  // Save to JSONL file
  const jsonlContent = allExamples.map(ex => JSON.stringify(ex)).join('\n');
  await fs.writeFile(outputFile, jsonlContent, 'utf-8');

  console.log('\n✅ Generation Complete!\n');
  console.log(`✓ Success: ${successCount} examples`);
  console.log(`✗ Failed: ${failCount} examples`);
  console.log(`📁 Saved to: ${outputFile}`);
  console.log(`📊 File size: ${(jsonlContent.length / 1024).toFixed(2)} KB`);

  // Calculate approximate cost
  const avgInputTokens = 450; // Estimated
  const avgOutputTokens = 120; // Estimated
  const totalInput = successCount * avgInputTokens;
  const totalOutput = successCount * avgOutputTokens;
  const cost = (totalInput * 0.15 / 1000000) + (totalOutput * 0.60 / 1000000);

  console.log(`\n💰 Approximate Cost: $${cost.toFixed(4)}`);
  console.log(`   Input tokens: ~${totalInput.toLocaleString()}`);
  console.log(`   Output tokens: ~${totalOutput.toLocaleString()}`);

  return allExamples;
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const examplesPerScenario = parseInt(process.argv[2]) || 2;
  const outputFile = process.argv[3] || 'data/training-datasets/elio_synthetic.jsonl';

  generateDataset(examplesPerScenario, outputFile)
    .then(() => process.exit(0))
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}

export { generateDataset, SCENARIOS, ELIO_CONTEXT };
