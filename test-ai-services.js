// test-ai-services.js
// ============================================================================
// Comprehensive AI Services Integration Test Suite
// Run with: node test-ai-services.js
// ============================================================================

import {
  llm,
  vlm,
  rag,
  embeddings,
  story,
  agent,
  finetune,
  moderation,
  healthCheck
} from './src/services/ai/index.js';

// Test configuration
const TEST_IMAGE_URL = "https://picsum.photos/400/300";
const VERBOSE = process.argv.includes('--verbose');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function logSuccess(test, duration) {
  log(`✅ ${test} (${duration}ms)`, 'green');
}

function logError(test, error) {
  log(`❌ ${test}`, 'red');
  log(`   Error: ${error.message || error}`, 'red');
}

function logSkip(test, reason) {
  log(`⏭️  ${test} - ${reason}`, 'yellow');
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'cyan');
}

// Test runner
async function runTest(name, testFn) {
  const start = Date.now();
  try {
    await testFn();
    const duration = Date.now() - start;
    logSuccess(name, duration);
    return { name, passed: true, duration };
  } catch (error) {
    logError(name, error);
    if (VERBOSE) {
      console.error(error);
    }
    return { name, passed: false, error: error.message };
  }
}

// Test suites
const tests = {
  // 0. Health Check
  async healthCheck() {
    const result = await healthCheck();
    if (!result.ok) throw new Error("Health check failed");
    if (VERBOSE) console.log("Health:", result.data);
  },

  // 1. LLM Tests
  async llmGenerate() {
    const result = await llm.generate({
      prompt: "Explain quantum computing in one sentence.",
      maxTokens: 100,
      temperature: 0.7
    });

    if (!result.ok) throw new Error(result.error.message);
    if (!result.data.text) throw new Error("No text generated");
    if (VERBOSE) console.log("Generated:", result.data.text.substring(0, 100));
  },

  async llmPersonaReply() {
    const result = await llm.personaReply({
      personaName: "Elio",
      context: "Discussing space exploration",
      userMessage: "What's your favorite planet?",
      maxTokens: 150,
      temperature: 0.8
    });

    if (!result.ok) throw new Error(result.error.message);
    if (!result.data.reply) throw new Error("No reply generated");
    if (VERBOSE) console.log("Persona reply:", result.data.reply);
  },

  async llmNewsIfEnabled() {
    if (process.env.WEB_SEARCH_ENABLED !== 'true' || !process.env.WEB_SEARCH_API_KEY) {
      logSkip("LLM News Summary", "Web search not configured");
      return;
    }

    const result = await llm.summarizeNews({
      topics: ["artificial intelligence"],
      locale: "en",
      maxItems: 3,
      style: "concise-bullet"
    });

    if (!result.ok) throw new Error(result.error.message);
    if (VERBOSE) console.log("News items:", result.data.items?.length || 0);
  },

  // 2. VLM Tests
  async vlmDescribe() {
    const result = await vlm.describe({
      imageUrl: TEST_IMAGE_URL,
      task: "caption",
      tone: "neutral"
    });

    if (!result.ok) throw new Error(result.error.message);
    if (!result.data.caption) throw new Error("No caption generated");
    if (VERBOSE) console.log("Caption:", result.data.caption);
  },

  async vlmAnalyze() {
    const result = await vlm.analyze({
      imageUrl: TEST_IMAGE_URL,
      prompt: "Describe the main elements in this image."
    });

    if (!result.ok) throw new Error(result.error.message);
    if (!result.data.description) throw new Error("No description generated");
    if (VERBOSE) console.log("Analysis:", result.data.description.substring(0, 100));
  },

  // 3. RAG Tests
  async ragInsert() {
    const result = await rag.insert({
      text: "The Elioverse Bot is a Discord bot for the Pixar Elio community. It provides AI-powered features including story generation, persona interactions, and knowledge search.",
      source: "Test Documentation",
      metadata: { category: "test", timestamp: Date.now() }
    });

    if (!result.ok) throw new Error(result.error.message);
    if (!result.data.docId) throw new Error("No document ID returned");
    if (VERBOSE) console.log("Inserted doc:", result.data.docId);
  },

  async ragSearch() {
    const result = await rag.search({
      query: "What is Elioverse Bot?",
      topK: 3,
      generateAnswer: true
    });

    if (!result.ok) throw new Error(result.error.message);
    if (result.data.totalHits === 0) throw new Error("No results found");
    if (VERBOSE) {
      console.log("Found hits:", result.data.totalHits);
      console.log("Answer:", result.data.answer?.substring(0, 100));
    }
  },

  // 4. Embeddings Tests
  async embeddingsGenerate() {
    const result = await embeddings.embed(
      ["Hello world", "AI is amazing"],
      { normalize: true }
    );

    if (!result.ok) throw new Error(result.error.message);
    if (!result.data.vectors || result.data.vectors.length !== 2) {
      throw new Error("Invalid vectors returned");
    }
    if (VERBOSE) console.log("Vector dimension:", result.data.dim);
  },

  async embeddingsModelInfo() {
    const result = await embeddings.getModelInfo();

    if (!result.ok) throw new Error(result.error.message);
    if (!result.data.model) throw new Error("No model info returned");
    if (VERBOSE) {
      console.log("Model:", result.data.model);
      console.log("Dimension:", result.data.dimension);
    }
  },

  // 5. Story Tests
  async storyGenerate() {
    const result = await story.generate({
      prompt: "A curious alien befriends a lost astronaut",
      genre: "sci-fi",
      length: "short"
    });

    if (!result.ok) throw new Error(result.error.message);
    if (!result.data.story) throw new Error("No story generated");
    if (VERBOSE) console.log("Story words:", result.data.wordCount);
  },

  async storyContinue() {
    const result = await story.continueStory({
      existingStory: "Once upon a time, in a galaxy far away, there lived a brave explorer named Luna.",
      direction: "Add an unexpected discovery",
      length: 200
    });

    if (!result.ok) throw new Error(result.error.message);
    if (!result.data.continuation) throw new Error("No continuation generated");
    if (VERBOSE) console.log("Continuation words:", result.data.continuationWordCount);
  },

  async storyDialogue() {
    const result = await story.generateDialogue({
      characters: ["Alice", "Bob"],
      context: "Meeting at a space station",
      tone: "friendly",
      turns: 3
    });

    if (!result.ok) throw new Error(result.error.message);
    if (!result.data.dialogue) throw new Error("No dialogue generated");
    if (VERBOSE) console.log("Dialogue lines:", result.data.totalLines);
  },

  // 6. Agent Tests
  async agentReasoning() {
    const result = await agent.reasoning({
      problem: "How can I improve user engagement in a Discord bot?",
      reasoningType: "chain-of-thought",
      maxSteps: 3
    });

    if (!result.ok) throw new Error(result.error.message);
    if (!result.data.steps || result.data.steps.length === 0) {
      throw new Error("No reasoning steps generated");
    }
    if (VERBOSE) console.log("Reasoning steps:", result.data.steps.length);
  },

  async agentTaskPlanning() {
    const result = await agent.taskPlanning({
      goal: "Deploy a new bot feature",
      constraints: ["Must pass tests", "Zero downtime"],
      maxTasks: 5
    });

    if (!result.ok) throw new Error(result.error.message);
    if (!result.data.tasks || result.data.tasks.length === 0) {
      throw new Error("No tasks generated");
    }
    if (VERBOSE) console.log("Planned tasks:", result.data.totalTasks);
  },

  async agentWebSearchIfEnabled() {
    if (process.env.WEB_SEARCH_ENABLED !== 'true' || !process.env.WEB_SEARCH_API_KEY) {
      logSkip("Agent Web Search", "Web search not configured");
      return;
    }

    const result = await agent.webSearch({
      query: "latest AI developments",
      numResults: 3,
      summarize: true
    });

    if (!result.ok) throw new Error(result.error.message);
    if (!result.data.results) throw new Error("No search results");
    if (VERBOSE) console.log("Search results:", result.data.totalResults);
  },

  // 7. Finetuning Tests (Status only - don't start actual training)
  async finetuneListJobs() {
    const result = await finetune.listJobs({ limit: 5 });

    if (!result.ok) throw new Error(result.error.message);
    if (VERBOSE) console.log("Training jobs found:", result.data.total);
  },

  // 8. Moderation Tests
  async moderationScan() {
    const result = await moderation.scan({
      content: "This is a friendly message about space exploration.",
      categories: ["nsfw", "hate", "violence"]
    });

    if (!result.ok) throw new Error(result.error.message);
    if (result.data.flagged === undefined) {
      throw new Error("No moderation result");
    }
    if (VERBOSE) console.log("Content flagged:", result.data.flagged);
  },

  async moderationBatchScan() {
    const result = await moderation.batchScan({
      contents: [
        "Hello world!",
        "How are you today?",
        "Let's explore space together!"
      ],
      categories: ["nsfw", "hate"]
    });

    if (!result.ok) throw new Error(result.error.message);
    if (!result.data.results) throw new Error("No batch results");
    if (VERBOSE) console.log("Batch scanned:", result.data.results.length);
  }
};

// Main test runner
async function runAllTests() {
  log("\n🚀 Starting AI Services Integration Tests\n", 'cyan');
  log("=" .repeat(60), 'blue');

  const results = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  // Run health check first
  logInfo("Running health check...");
  const healthResult = await runTest("Health Check", tests.healthCheck);
  results.push(healthResult);

  if (!healthResult.passed) {
    log("\n❌ Health check failed. AI service may not be running.", 'red');
    log("   Make sure Python AI service is running on http://localhost:8000\n", 'yellow');
    process.exit(1);
  }

  log("=" .repeat(60), 'blue');
  log("");

  // Run all other tests
  const testNames = Object.keys(tests).filter(name => name !== 'healthCheck');

  for (const testName of testNames) {
    const testFn = tests[testName];

    // Check if test should be skipped
    if (testName.includes('IfEnabled')) {
      // These tests will skip themselves if needed
    }

    const result = await runTest(testName, testFn);
    results.push(result);

    if (result.passed) {
      passed++;
    } else {
      failed++;
    }

    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  // Summary
  log("\n" + "=".repeat(60), 'blue');
  log("\n📊 Test Summary\n", 'cyan');

  log(`Total tests: ${results.length}`, 'blue');
  log(`✅ Passed: ${passed}`, 'green');
  if (failed > 0) {
    log(`❌ Failed: ${failed}`, 'red');
  }

  // Performance summary
  const totalDuration = results.reduce((sum, r) => sum + (r.duration || 0), 0);
  const avgDuration = Math.round(totalDuration / results.length);

  log(`\n⏱️  Total time: ${totalDuration}ms`, 'cyan');
  log(`⏱️  Average time: ${avgDuration}ms per test`, 'cyan');

  // Failed tests details
  if (failed > 0) {
    log("\n❌ Failed Tests:", 'red');
    results
      .filter(r => !r.passed)
      .forEach(r => {
        log(`   - ${r.name}: ${r.error}`, 'red');
      });
  }

  log("\n" + "=".repeat(60), 'blue');

  // Exit code
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(error => {
  log("\n💥 Fatal error running tests:", 'red');
  console.error(error);
  process.exit(1);
});
