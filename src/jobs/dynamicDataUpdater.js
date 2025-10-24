/**
 * src/jobs/dynamicDataUpdater.js
 * Dynamic Data Update System - AI Agent automatically generates and updates data
 *
 * Features:
 * - Analyzes RAG resources for new characters and scenarios
 * - Generates personas, greetings, scenarios using AI
 * - Auto-validates and updates database
 * - Scheduled to run periodically
 */

import { withCollection } from "../db/mongo.js";
import { logger } from "../util/logger.js";
import fs from "fs/promises";
import path from "path";

/**
 * Main function to update data dynamically using AI
 */
export async function runDynamicDataUpdate(ai) {
  try {
    logger.info("[DYNAMIC-UPDATE] Starting dynamic data update cycle");

    // Step 1: Analyze RAG resources for new content
    const ragAnalysis = await analyzeRAGResources(ai);
    logger.info("[DYNAMIC-UPDATE] RAG analysis complete", {
      newCharacters: ragAnalysis.newCharacters?.length || 0,
      potentialScenarios: ragAnalysis.scenarios?.length || 0
    });

    // Step 2: Generate new personas if new characters found
    if (ragAnalysis.newCharacters && ragAnalysis.newCharacters.length > 0) {
      const newPersonas = await generateNewPersonas(ai, ragAnalysis.newCharacters);
      if (newPersonas.length > 0) {
        await insertPersonas(newPersonas);
        logger.info("[DYNAMIC-UPDATE] Inserted new personas", { count: newPersonas.length });
      }
    }

    // Step 3: Generate new scenarios
    const newScenarios = await generateNewScenarios(ai, ragAnalysis);
    if (newScenarios.length > 0) {
      await insertScenarios(newScenarios);
      logger.info("[DYNAMIC-UPDATE] Inserted new scenarios", { count: newScenarios.length });
    }

    // Step 4: Generate new greetings
    const newGreetings = await generateNewGreetings(ai, ragAnalysis);
    if (newGreetings.length > 0) {
      await insertGreetings(newGreetings);
      logger.info("[DYNAMIC-UPDATE] Inserted new greetings", { count: newGreetings.length });
    }

    logger.info("[DYNAMIC-UPDATE] Dynamic data update cycle complete");
    return {
      success: true,
      newPersonas: ragAnalysis.newCharacters?.length || 0,
      newScenarios: newScenarios.length,
      newGreetings: newGreetings.length
    };
  } catch (error) {
    logger.error("[DYNAMIC-UPDATE] Dynamic data update failed", {
      error: error.message,
      stack: error.stack
    });
    return { success: false, error: error.message };
  }
}

/**
 * Analyze RAG resources to find new characters and scenario opportunities
 */
async function analyzeRAGResources(ai) {
  try {
    // Get existing personas from database
    const existingPersonas = await withCollection("personas", col =>
      col.find({}, { name: 1 }).toArray()
    );
    const existingNames = new Set(existingPersonas.map(p => p.name));

    // Read RAG resource files
    const ragDir = path.join(process.cwd(), "data/rag-resources");
    const characterFiles = await findCharacterFiles(ragDir);

    logger.info("[DYNAMIC-UPDATE] Analyzing RAG resources", {
      characterFiles: characterFiles.length,
      existingPersonas: existingNames.size
    });

    // Use AI to analyze each character file and extract info
    const analysisPrompt = `Analyze the following character files and identify:
1. New characters not in existing list: ${Array.from(existingNames).join(", ")}
2. Potential scenario ideas involving these characters
3. Character relationships and interactions

Character files found: ${characterFiles.map(f => path.basename(f)).join(", ")}

Return a JSON object with:
{
  "newCharacters": [{"name": "...", "file": "...", "summary": "..."}],
  "scenarios": [{"description": "...", "characters": [...]}]
}`;

    const result = await ai.llm.generate({
      prompt: analysisPrompt,
      maxTokens: 1000,
      temperature: 0.7
    });

    if (result.ok && result.data?.text) {
      try {
        // Try to extract JSON from response
        const jsonMatch = result.data.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const analysis = JSON.parse(jsonMatch[0]);
          return analysis;
        }
      } catch (parseError) {
        logger.warn("[DYNAMIC-UPDATE] Failed to parse AI analysis as JSON", {
          error: parseError.message
        });
      }
    }

    // Fallback: Manual character detection
    const newCharacters = [];
    for (const file of characterFiles) {
      const content = await fs.readFile(file, "utf-8");
      const nameMatch = content.match(/(?:name|character|title):\s*[""']?([A-Z][a-zA-Z\s]+)[""']?/i);
      if (nameMatch) {
        const characterName = nameMatch[1].trim();
        if (!existingNames.has(characterName)) {
          newCharacters.push({
            name: characterName,
            file: path.basename(file),
            summary: content.substring(0, 300)
          });
        }
      }
    }

    return {
      newCharacters,
      scenarios: []
    };
  } catch (error) {
    logger.error("[DYNAMIC-UPDATE] RAG analysis failed", { error: error.message });
    return { newCharacters: [], scenarios: [] };
  }
}

/**
 * Find all character-related files in RAG resources
 */
async function findCharacterFiles(dir) {
  const files = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...await findCharacterFiles(fullPath));
      } else if (entry.name.includes("character") && entry.name.endsWith(".md")) {
        files.push(fullPath);
      }
    }
  } catch (error) {
    logger.debug("[DYNAMIC-UPDATE] Error reading directory", { dir, error: error.message });
  }
  return files;
}

/**
 * Generate new persona objects using AI
 */
async function generateNewPersonas(ai, newCharacters) {
  const personas = [];

  for (const char of newCharacters.slice(0, 3)) { // Limit to 3 at a time
    try {
      const prompt = `Create a detailed persona JSON for character: ${char.name}

Character context: ${char.summary}

Generate a JSON object with these exact fields:
{
  "name": "${char.name}",
  "avatar": "https://via.placeholder.com/150?text=${char.name}",
  "color": 5814783,
  "description": "Brief description (1-2 sentences)",
  "traits": {"humor": 0.5, "warmth": 0.5, "discipline": 0.5},
  "likes": ["item1", "item2", "item3"],
  "dislikes": ["item1", "item2"],
  "openers": ["greeting1", "greeting2"],
  "personality": "Full personality description",
  "speaking_style": "How they speak",
  "system_prompt": "You are ${char.name}...",
  "enabled": true
}

Return ONLY the JSON, no other text.`;

      const result = await ai.llm.generate({
        prompt,
        maxTokens: 800,
        temperature: 0.8
      });

      if (result.ok && result.data?.text) {
        try {
          const jsonMatch = result.data.text.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const persona = JSON.parse(jsonMatch[0]);
            // Add required fields for database
            persona.systemStyle = persona.speaking_style || "Default style";
            persona.actions = getDefaultActions();
            persona.avatarUrl = persona.avatar;
            personas.push(persona);
            logger.info("[DYNAMIC-UPDATE] Generated persona", { name: persona.name });
          }
        } catch (parseError) {
          logger.warn("[DYNAMIC-UPDATE] Failed to parse persona JSON", {
            character: char.name,
            error: parseError.message
          });
        }
      }
    } catch (error) {
      logger.error("[DYNAMIC-UPDATE] Failed to generate persona", {
        character: char.name,
        error: error.message
      });
    }
  }

  return personas;
}

/**
 * Generate new scenarios using AI
 */
async function generateNewScenarios(ai, ragAnalysis) {
  const scenarios = [];

  try {
    // Get existing personas for context
    const personas = await withCollection("personas", col =>
      col.find({}, { name: 1 }).limit(15).toArray()
    );
    const personaNames = personas.map(p => p.name).join(", ");

    const prompt = `Generate 3 new scenario quiz questions for the Elio Communiverse bot.

Available characters: ${personaNames}

Create scenarios that test users' understanding of:
- Character personalities and relationships
- Film plot points
- Decision-making in character-appropriate ways

Return a JSON array with this exact format:
[
  {
    "prompt": "Question text here?",
    "options": ["Option A", "Option B", "Option C", "Option D"],
    "correctIndex": 0,
    "tags": ["character", "theme"],
    "enabled": true,
    "weight": 1,
    "hostPersonaName": "CharacterName"
  }
]

Return ONLY the JSON array, no other text.`;

    const result = await ai.llm.generate({
      prompt,
      maxTokens: 1000,
      temperature: 0.9
    });

    if (result.ok && result.data?.text) {
      try {
        const jsonMatch = result.data.text.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const generatedScenarios = JSON.parse(jsonMatch[0]);
          scenarios.push(...generatedScenarios);
          logger.info("[DYNAMIC-UPDATE] Generated scenarios", { count: generatedScenarios.length });
        }
      } catch (parseError) {
        logger.warn("[DYNAMIC-UPDATE] Failed to parse scenarios JSON", {
          error: parseError.message
        });
      }
    }
  } catch (error) {
    logger.error("[DYNAMIC-UPDATE] Failed to generate scenarios", {
      error: error.message
    });
  }

  return scenarios;
}

/**
 * Generate new greetings using AI
 */
async function generateNewGreetings(ai, ragAnalysis) {
  const greetings = [];

  try {
    // Get existing personas
    const personas = await withCollection("personas", col =>
      col.find({}, { name: 1 }).limit(15).toArray()
    );

    // Generate 1-2 greetings for random personas
    const selectedPersonas = personas.sort(() => 0.5 - Math.random()).slice(0, 3);

    for (const persona of selectedPersonas) {
      const prompt = `Create 2 greeting messages for character: ${persona.name}

Greetings should:
- Match the character's speaking style
- Use {weekday} and {guild} placeholders
- Be warm and engaging
- Be 1-2 sentences

Return a JSON array:
[
  {
    "text": "Greeting text here with {weekday} and {guild} placeholders",
    "tags": ["${persona.name.toLowerCase()}", "tag2"],
    "weight": 1,
    "enabled": true,
    "personaHost": "${persona.name}",
    "style": {"title": "Title", "markdownAccent": "**"}
  }
]

Return ONLY the JSON array, no other text.`;

      const result = await ai.llm.generate({
        prompt,
        maxTokens: 500,
        temperature: 0.9
      });

      if (result.ok && result.data?.text) {
        try {
          const jsonMatch = result.data.text.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const generatedGreetings = JSON.parse(jsonMatch[0]);
            greetings.push(...generatedGreetings);
          }
        } catch (parseError) {
          logger.debug("[DYNAMIC-UPDATE] Failed to parse greetings JSON", {
            persona: persona.name,
            error: parseError.message
          });
        }
      }
    }

    logger.info("[DYNAMIC-UPDATE] Generated greetings", { count: greetings.length });
  } catch (error) {
    logger.error("[DYNAMIC-UPDATE] Failed to generate greetings", {
      error: error.message
    });
  }

  return greetings;
}

/**
 * Insert new personas into database
 */
async function insertPersonas(personas) {
  return withCollection("personas", async col => {
    for (const persona of personas) {
      try {
        await col.updateOne(
          { name: persona.name },
          { $set: persona },
          { upsert: true }
        );
        logger.info("[DYNAMIC-UPDATE] Upserted persona", { name: persona.name });
      } catch (error) {
        logger.error("[DYNAMIC-UPDATE] Failed to insert persona", {
          name: persona.name,
          error: error.message
        });
      }
    }
  });
}

/**
 * Insert new scenarios into database
 */
async function insertScenarios(scenarios) {
  return withCollection("scenarios", async col => {
    for (const scenario of scenarios) {
      try {
        // Check if scenario already exists (by prompt)
        const existing = await col.findOne({ prompt: scenario.prompt });
        if (!existing) {
          await col.insertOne(scenario);
          logger.info("[DYNAMIC-UPDATE] Inserted scenario", {
            prompt: scenario.prompt.substring(0, 50)
          });
        }
      } catch (error) {
        logger.error("[DYNAMIC-UPDATE] Failed to insert scenario", {
          error: error.message
        });
      }
    }
  });
}

/**
 * Insert new greetings into database
 */
async function insertGreetings(greetings) {
  return withCollection("greetings", async col => {
    for (const greeting of greetings) {
      try {
        // Check if greeting already exists (by text)
        const existing = await col.findOne({ text: greeting.text });
        if (!existing) {
          await col.insertOne(greeting);
          logger.info("[DYNAMIC-UPDATE] Inserted greeting", {
            text: greeting.text.substring(0, 50)
          });
        }
      } catch (error) {
        logger.error("[DYNAMIC-UPDATE] Failed to insert greeting", {
          error: error.message
        });
      }
    }
  });
}

/**
 * Get default action values for new personas
 */
function getDefaultActions() {
  return {
    joke: { friendship: 1, trust: 0, dependence: 0, notes: "Friendly interaction" },
    gift: { friendship: 1, trust: 1, dependence: 0, notes: "Thoughtful gesture" },
    help: { friendship: 1, trust: 2, dependence: 0, notes: "Practical assistance" },
    tease: { friendship: -1, trust: -1, dependence: 0, notes: "Risky banter" },
    comfort: { friendship: 2, trust: 1, dependence: 0, notes: "Emotional support" },
    challenge: { friendship: 1, trust: 1, dependence: 0, notes: "Growth opportunity" }
  };
}

export default {
  runDynamicDataUpdate
};
