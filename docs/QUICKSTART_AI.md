# AI Services Quick Start Guide

Quick Start Guide for Elioverse Bot AI Features

## Prerequisites

### 1. Python AI Service (Backend)

Ensure Python AI service is installed and running:

```bash
cd ai-service

# Install dependencies (first time setup)
pip install -r requirements.txt

# Start service
python -m uvicorn app.app:app --reload --host 0.0.0.0 --port 8000
```

Verify service status:
```bash
curl http://localhost:8000/health
```

### 2. Discord Bot Configuration

Add to `.env` file:

```env
# AI Service
AI_SERVICE_URL=http://localhost:8000
AI_SERVICE_TIMEOUT_MS=60000
AI_ENABLED=true

# Models
AI_MODEL_TEXT=deepseek
AI_MODEL_VLM=qwen-vl
EMBEDDINGS_MODEL=bge-m3

# Optional: Web Search
WEB_SEARCH_ENABLED=true
WEB_SEARCH_API_KEY=your_brave_api_key_here
```

### 3. Install Node.js Dependencies

```bash
npm install
```

## 5-Minute Quick Test

### 1. Test LLM (Text Generation)

Create test file `test_ai.js`:

```javascript
import { llm } from './src/services/ai/index.js';

async function testLLM() {
  console.log('Testing LLM...');

  const result = await llm.generate({
    prompt: "Explain quantum entanglement in simple terms",
    maxTokens: 200,
    temperature: 0.7
  });

  if (result.ok) {
    console.log('✅ LLM Test Passed');
    console.log('Response:', result.data.text);
    console.log('Tokens used:', result.data.tokensUsed);
  } else {
    console.error('❌ LLM Test Failed:', result.error.message);
  }
}

testLLM();
```

Run:
```bash
node test_ai.js
```

### 2. Test VLM (Image Understanding)

```javascript
import { vlm } from './src/services/ai/index.js';

async function testVLM() {
  console.log('Testing VLM...');

  const result = await vlm.describe({
    imageUrl: "https://picsum.photos/400/300",
    task: "describe",
    tone: "neutral"
  });

  if (result.ok) {
    console.log('✅ VLM Test Passed');
    console.log('Description:', result.data.description);
  } else {
    console.error('❌ VLM Test Failed:', result.error.message);
  }
}

testVLM();
```

### 3. Test RAG (Knowledge Retrieval)

```javascript
import { rag } from './src/services/ai/index.js';

async function testRAG() {
  console.log('Testing RAG...');

  // First insert some test data
  await rag.insert({
    text: "The Elioverse Bot is a Discord bot for the Pixar Elio community. It provides AI-powered features including story generation, persona interactions, and knowledge search.",
    source: "Bot Documentation",
    metadata: { category: "docs" }
  });

  // Then search
  const result = await rag.search({
    query: "What is Elioverse Bot?",
    topK: 3,
    generateAnswer: true
  });

  if (result.ok) {
    console.log('✅ RAG Test Passed');
    console.log('Answer:', result.data.answer);
    console.log('Sources:', result.data.hits.length);
  } else {
    console.error('❌ RAG Test Failed:', result.error.message);
  }
}

testRAG();
```

### 4. Test Story (Story Generation)

```javascript
import { story } from './src/services/ai/index.js';

async function testStory() {
  console.log('Testing Story Generation...');

  const result = await story.generate({
    prompt: "A curious alien befriends a lost astronaut",
    genre: "sci-fi",
    length: "short"
  });

  if (result.ok) {
    console.log('✅ Story Test Passed');
    console.log('Story:', result.data.story);
    console.log('Word count:', result.data.wordCount);
  } else {
    console.error('❌ Story Test Failed:', result.error.message);
  }
}

testStory();
```

### 5. Test Agent (Multi-step Reasoning)

```javascript
import { agent } from './src/services/ai/index.js';

async function testAgent() {
  console.log('Testing Agent...');

  const result = await agent.reasoning({
    problem: "How can I improve my Discord bot's user engagement?",
    reasoningType: "chain-of-thought",
    maxSteps: 3
  });

  if (result.ok) {
    console.log('✅ Agent Test Passed');
    console.log('Steps:', result.data.steps.length);
    console.log('Conclusion:', result.data.conclusion);
  } else {
    console.error('❌ Agent Test Failed:', result.error.message);
  }
}

testAgent();
```

## Usage in Discord Commands

### Example 1: Text Generation Command

```javascript
// src/commands/ask.js
import { SlashCommandBuilder } from "discord.js";
import { llm } from "../services/ai/index.js";
import { sendErrorReply, sendSuccessReply } from "../util/replies.js";

export const data = new SlashCommandBuilder()
  .setName("ask")
  .setDescription("Ask AI a question")
  .addStringOption((opt) =>
    opt.setName("question").setDescription("Your question").setRequired(true)
  );

export async function execute(interaction) {
  await interaction.deferReply();

  const question = interaction.options.getString("question");

  const result = await llm.generate({
    prompt: question,
    system: "You are a helpful assistant in a Discord community.",
    maxTokens: 500,
    temperature: 0.7
  });

  if (!result.ok) {
    await sendErrorReply(interaction, result.error);
    return;
  }

  await sendSuccessReply(interaction, {
    title: "🤖 AI Answer",
    description: result.data.text,
    footer: `Tokens: ${result.data.tokensUsed}`
  });
}
```

### Example 2: Image Analysis Command

```javascript
// src/commands/analyze-image.js
import { SlashCommandBuilder } from "discord.js";
import { vlm } from "../services/ai/index.js";
import { sendErrorReply, sendSuccessReply } from "../util/replies.js";

export const data = new SlashCommandBuilder()
  .setName("analyze-image")
  .setDescription("Analyze an image")
  .addAttachmentOption((opt) =>
    opt.setName("image").setDescription("Image to analyze").setRequired(true)
  );

export async function execute(interaction) {
  await interaction.deferReply();

  const attachment = interaction.options.getAttachment("image");

  if (!attachment.contentType?.startsWith("image/")) {
    await sendErrorReply(interaction, {
      code: "BAD_REQUEST",
      message: "Please provide a valid image file"
    });
    return;
  }

  const result = await vlm.describe({
    imageUrl: attachment.url,
    task: "describe",
    tone: "neutral"
  });

  if (!result.ok) {
    await sendErrorReply(interaction, result.error);
    return;
  }

  await sendSuccessReply(interaction, {
    title: "🖼️ Image Analysis",
    description: result.data.description,
    thumbnail: attachment.url
  });
}
```

### Example 3: Knowledge Search Command

```javascript
// src/commands/search.js
import { SlashCommandBuilder } from "discord.js";
import { rag } from "../services/ai/index.js";
import { sendErrorReply, sendSuccessReply } from "../util/replies.js";

export const data = new SlashCommandBuilder()
  .setName("search")
  .setDescription("Search the knowledge base")
  .addStringOption((opt) =>
    opt.setName("query").setDescription("Search query").setRequired(true)
  );

export async function execute(interaction) {
  await interaction.deferReply();

  const query = interaction.options.getString("query");

  const result = await rag.search({
    query,
    guildId: interaction.guildId,
    topK: 5,
    generateAnswer: true
  });

  if (!result.ok) {
    await sendErrorReply(interaction, result.error);
    return;
  }

  const fields = result.data.hits.slice(0, 3).map((hit, i) => ({
    name: `Source ${i + 1}: ${hit.source}`,
    value: hit.chunk.substring(0, 200) + "...",
    inline: false
  }));

  await sendSuccessReply(interaction, {
    title: "🔍 Search Results",
    description: result.data.answer || "No answer generated",
    fields,
    footer: `Found ${result.data.totalHits} results`
  });
}
```

## Common Usage Scenarios

### Scenario 1: AI Assistant

```javascript
import { llm, rag } from './src/services/ai/index.js';

async function aiAssistant(userQuestion, guildId) {
  // 1. Search relevant knowledge
  const ragResult = await rag.search({
    query: userQuestion,
    guildId,
    topK: 3,
    generateAnswer: false
  });

  // 2. Use knowledge to generate answer
  const context = ragResult.ok
    ? ragResult.data.hits.map(h => h.chunk).join("\n\n")
    : "";

  const llmResult = await llm.generate({
    system: "You are a helpful assistant. Use the provided context to answer questions.",
    prompt: `Context:\n${context}\n\nQuestion: ${userQuestion}\n\nAnswer:`,
    maxTokens: 300
  });

  return llmResult;
}
```

### Scenario 2: Persona-based Chat

```javascript
import { llm } from './src/services/ai/index.js';

async function personaChat(personaName, userMessage, conversationHistory) {
  const result = await llm.personaReply({
    personaName,
    context: conversationHistory.join("\n"),
    userMessage,
    temperature: 0.8
  });

  return result;
}
```

### Scenario 3: Content Generation Workflow

```javascript
import { story, agent, moderation } from './src/services/ai/index.js';

async function createStoryWorkflow(prompt) {
  // 1. Generate story
  const storyResult = await story.generate({
    prompt,
    length: "medium",
    genre: "sci-fi"
  });

  if (!storyResult.ok) return storyResult;

  // 2. Content moderation
  const moderationResult = await moderation.scan({
    content: storyResult.data.story
  });

  if (moderationResult.ok && moderationResult.data.flagged) {
    // 3. Rewrite inappropriate content
    const rewriteResult = await moderation.rewrite({
      content: storyResult.data.story,
      flaggedCategories: moderationResult.data.categories
    });

    return {
      ok: true,
      data: {
        story: rewriteResult.data.rewrittenContent,
        wasModerated: true
      }
    };
  }

  return {
    ok: true,
    data: {
      story: storyResult.data.story,
      wasModerated: false
    }
  };
}
```

## Performance Optimization Tips

### 1. Use Appropriate maxTokens

```javascript
// ❌ Bad: Wastes resources
const result = await llm.generate({
  prompt: "Say hi",
  maxTokens: 4096
});

// ✅ Good: Set according to needs
const result = await llm.generate({
  prompt: "Say hi",
  maxTokens: 50
});
```

### 2. Parallel Processing for Independent Requests

```javascript
// ❌ Bad: Sequential execution
const result1 = await llm.generate({ prompt: "Question 1" });
const result2 = await llm.generate({ prompt: "Question 2" });

// ✅ Good: Parallel execution
const [result1, result2] = await Promise.all([
  llm.generate({ prompt: "Question 1" }),
  llm.generate({ prompt: "Question 2" })
]);
```

### 3. Use Agent's Multi-task Feature

```javascript
// ✅ Use multiTask for parallel execution of multiple tasks
const result = await agent.multiTask({
  tasks: [
    { kind: "web_search", params: { query: "AI news" } },
    { kind: "rag_query", params: { query: "config" } }
  ],
  executionMode: "parallel"
});
```

## Error Handling Best Practices

```javascript
async function robustAICall() {
  try {
    const result = await llm.generate({ prompt: "Hello" });

    if (!result.ok) {
      // Handle AI service errors
      switch (result.error.code) {
        case "DEPENDENCY_UNAVAILABLE":
          console.error("AI service is down");
          // Return fallback response or notify admin
          break;

        case "AI_TIMEOUT":
          console.error("Request timed out");
          // Can retry or use shorter prompt
          break;

        case "AI_MODEL_ERROR":
          console.error("Model error:", result.error.message);
          // Log detailed error for debugging
          break;

        default:
          console.error("Unknown error:", result.error);
      }

      return null;
    }

    return result.data;

  } catch (error) {
    // Handle unexpected errors
    console.error("Unexpected error:", error);
    return null;
  }
}
```

## Debugging Tips

### Enable Verbose Logging

Set in `.env`:
```env
LOG_LEVEL=debug
```

### Test AI Service Health Status

```javascript
import { healthCheck } from './src/services/ai/index.js';

async function checkHealth() {
  const result = await healthCheck();
  console.log("AI Service Status:", result);
}
```

### Monitor Token Usage

```javascript
let totalTokens = 0;

async function monitoredGenerate(prompt) {
  const result = await llm.generate({ prompt });

  if (result.ok) {
    totalTokens += result.data.tokensUsed;
    console.log(`Used ${result.data.tokensUsed} tokens (Total: ${totalTokens})`);
  }

  return result;
}
```

## Next Steps

1. Read complete documentation: `AI_SERVICES_GUIDE.md`
2. Check Python AI Service documentation: `ai-service/README.md`
3. Explore more advanced features (Agent, Finetuning, etc.)
4. Join community discussions and share experiences

## Need Help?

- Check troubleshooting guide: `AI_SERVICES_GUIDE.md#troubleshooting`
- Check Python service logs: `ai-service/logs/`
- Check Bot logs: Console output or log files

Happy coding! 🚀