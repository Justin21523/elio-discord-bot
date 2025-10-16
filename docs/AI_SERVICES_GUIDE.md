# AI Services Integration Guide

Complete Documentation for Discord Bot and Python AI Service Integration

## Overview

This project has completed full integration between the JavaScript Discord Bot and Python FastAPI AI Service. All AI functionalities communicate with the backend through a unified HTTP client.

## Architecture Diagram

```
Discord Bot (JavaScript)
├── src/commands/          # Discord commands
├── src/services/
│   └── ai/                # AI service integration layer
│       ├── client.js      # HTTP client (axios)
│       ├── llm.js         # LLM service
│       ├── vlm.js         # Vision-Language models
│       ├── rag.js         # RAG search
│       ├── embeddings.js  # Text embeddings
│       ├── story.js       # Story generation
│       ├── agentService.js# Agent orchestration
│       ├── finetune.js    # Model fine-tuning
│       ├── moderation.js  # Content moderation
│       └── index.js       # Unified exports
└── ai-service/            # Python FastAPI backend
    ├── app/
    │   ├── api/routers/   # API routers
    │   ├── models/        # Model management
    │   └── services/      # Business logic
    └── ...
```

## Implemented Services

### 1. LLM Service (`src/services/ai/llm.js`)

Provides text generation capabilities based on large language models.

#### Available Methods

##### `generate(params)`
Basic text generation

```javascript
import { llm } from './services/ai/index.js';

const result = await llm.generate({
  prompt: "Explain quantum computing",
  system: "You are a helpful physics teacher",
  maxTokens: 512,
  temperature: 0.7,
  topP: 0.9,
  stop: ["\n\n"]
});

// result.data.text - Generated text
// result.data.tokensUsed - Tokens used
```

##### `personaReply(params)`
Persona-based response generation

```javascript
const result = await llm.personaReply({
  personaName: "Elio",
  context: "User is asking about space",
  userMessage: "What's your favorite planet?",
  systemStyle: "Be enthusiastic and curious",
  maxTokens: 256,
  temperature: 0.8
});

// result.data.reply - Persona response
// result.data.persona - Persona name used
```

##### `summarizeNews(params)`
News summarization (with Web Search integration)

```javascript
const result = await llm.summarizeNews({
  topics: ["AI", "space exploration"],
  locale: "en",
  maxItems: 6,
  style: "concise-bullet"
});

// result.data.items - News items list
// result.data.digest - Overall summary
```

### 2. VLM Service (`src/services/ai/vlm.js`)

Vision-Language Model for image understanding.

#### Available Methods

##### `describe(params)`
Image description generation

```javascript
import { vlm } from './services/ai/index.js';

const result = await vlm.describe({
  imageUrl: "https://example.com/image.jpg",
  task: "caption", // or "describe", "react"
  tone: "playful", // or "neutral", "dramatic"
  question: "What's happening in this image?"
});

// result.data.caption - Short caption
// result.data.description - Detailed description
// result.data.safety - Safety check results
```

##### `imageReact(params)`
Persona-based image reactions

```javascript
const result = await vlm.imageReact({
  imageUrl: "https://example.com/meme.jpg",
  personaName: "Elio",
  context: "This is a funny space meme"
});

// result.data.reaction - Persona reaction
```

##### `analyze(params)`, `react(params)`, `ask(params)`
Convenience wrapper functions

```javascript
// Analyze image
const analysis = await vlm.analyze({
  imageUrl: "https://...",
  prompt: "Analyze the composition"
});

// Generate reaction
const reaction = await vlm.react({
  imageUrl: "https://...",
  style: "funny"
});

// Q&A
const answer = await vlm.ask({
  imageUrl: "https://...",
  question: "How many people are in this photo?"
});
```

### 3. RAG Service (`src/services/ai/rag.js`)

Retrieval Augmented Generation, semantic search + answer generation.

#### Available Methods

##### `search(params)`
Semantic document search

```javascript
import { rag } from './services/ai/index.js';

const result = await rag.search({
  query: "How do I configure the bot?",
  guildId: "123456789", // Optional: filter by guild
  topK: 5,
  mmrLambda: 0.3, // Diversity parameter (0-1)
  generateAnswer: true
});

// result.data.hits - Search results
// result.data.answer - Generated answer
// result.data.citations - Citation sources
```

##### `insert(params)`
Insert documents into knowledge base

```javascript
const result = await rag.insert({
  text: "The bot can be configured via environment variables...",
  source: "Configuration Guide",
  guildId: "123456789",
  metadata: { category: "docs", author: "admin" },
  url: "https://docs.example.com/config"
});

// result.data.docId - Document ID
```

### 4. Embeddings Service (`src/services/ai/embeddings.js`)

Text vectorization.

#### Available Methods

##### `embed(texts, options)`
Generate text embedding vectors

```javascript
import { embeddings } from './services/ai/index.js';

const result = await embeddings.embed(
  ["Hello world", "AI is amazing"],
  { langHint: "en", normalize: true }
);

// result.data.vectors - Vector arrays
// result.data.dim - Vector dimensions
// result.data.model - Model used
```

##### `getModelInfo()`
Get embedding model information

```javascript
const result = await embeddings.getModelInfo();

// result.data.model - Model name
// result.data.dimension - Vector dimensions
// result.data.maxLength - Maximum input length
```

### 5. Story Service (`src/services/ai/story.js`)

Story generation and management.

#### Available Methods

##### `generate(params)`
Generate complete stories

```javascript
import { story } from './services/ai/index.js';

const result = await story.generate({
  prompt: "A young astronaut discovers a new planet",
  genre: "sci-fi",
  length: "medium", // "short", "medium", "long"
  style: "adventurous",
  characters: ["Luna", "Captain Rex"],
  setting: "Deep space, year 2150"
});

// result.data.story - Generated story
// result.data.wordCount - Word count
```

##### `continueStory(params)`
Continue existing stories

```javascript
const result = await story.continueStory({
  existingStory: "Once upon a time...",
  direction: "Add a plot twist",
  length: 500
});

// result.data.continuation - Continuation part
// result.data.fullStory - Complete story
```

##### `generateDialogue(params)`
Generate character dialogues

```javascript
const result = await story.generateDialogue({
  characters: ["Alice", "Bob"],
  context: "Meeting at a space station",
  tone: "friendly",
  turns: 5
});

// result.data.dialogue - Dialogue text
// result.data.lines - Dialogue lines array
```

##### `developCharacter(params)`, `analyzeStory(params)`
Character development and story analysis

```javascript
// Character development
const charDev = await story.developCharacter({
  characterName: "Luna",
  traits: ["brave", "curious"],
  background: "Former engineer",
  developmentAspect: "personality" // or "backstory", "motivations", "arc"
});

// Story analysis
const analysis = await story.analyzeStory({
  storyText: "Once upon a time...",
  analysisType: "structure" // or "themes", "characters", "pacing"
});
```

### 6. Agent Service (`src/services/ai/agentService.js`)

Multi-step agent orchestration with reasoning, planning, and tool usage.

#### Available Methods

##### `reasoning(params)`
Structured reasoning

```javascript
import { agent } from './services/ai/index.js';

const result = await agent.reasoning({
  problem: "How can we reduce energy consumption?",
  context: "In a smart home environment",
  reasoningType: "chain-of-thought", // or "tree-of-thought", "step-by-step"
  maxSteps: 5
});

// result.data.steps - Reasoning steps
// result.data.conclusion - Final conclusion
// result.data.fullReasoning - Complete reasoning text
```

##### `taskPlanning(params)`
Task planning

```javascript
const result = await agent.taskPlanning({
  goal: "Deploy a new feature to production",
  constraints: ["Must pass all tests", "Zero downtime"],
  availableTools: ["git", "docker", "kubernetes"],
  maxTasks: 10
});

// result.data.tasks - Task list
// result.data.estimatedTotalDuration - Estimated total duration
```

##### `multiTask(params)`
Multi-task execution

```javascript
const result = await agent.multiTask({
  tasks: [
    { kind: "web_search", params: { query: "latest AI news" } },
    { kind: "rag_query", params: { query: "bot configuration" } }
  ],
  executionMode: "parallel", // or "sequential"
  timeoutPerTask: 30
});

// result.data.results - Task results array
// result.data.successful - Successful count
// result.data.failed - Failed count
```

##### `webSearch(params)`
Web search (Brave API)

```javascript
const result = await agent.webSearch({
  query: "quantum computing breakthroughs 2024",
  numResults: 5,
  recencyDays: 30,
  domains: ["arxiv.org", "nature.com"],
  summarize: true
});

// result.data.results - Search results
// result.data.summary - LLM-generated summary
```

##### `run(params)`
Execute complex agent tasks

```javascript
const result = await agent.run({
  kind: "daily_digest", // or "fact_check", "persona_compose"
  params: {
    topics: ["AI", "space"],
    guildId: "123456"
  },
  maxSteps: 10,
  timeoutSeconds: 60
});

// result.data.finalResponse - Final response
// result.data.steps - Execution steps
```

##### `personaChallenge(params)`
Persona challenge game

```javascript
const result = await agent.personaChallenge({
  personaName: "Elio",
  messages: [
    { userId: "user1", content: "Tell me about stars" },
    { userId: "user2", content: "What's for dinner?" }
  ],
  maxReplies: 5
});

// result.data.replies - Filtered and generated replies
```

### 7. Finetuning Service (`src/services/ai/finetune.js`)

Model fine-tuning and management.

#### Available Methods

##### `startTraining(params)`
Start training job

```javascript
import { finetune } from './services/ai/index.js';

const result = await finetune.startTraining({
  jobName: "elio-persona-v1",
  baseModel: "qwen25",
  datasetPath: "./data/elio_conversations.jsonl",
  taskType: "persona", // or "sft", "dpo", "story", "dialogue"
  hyperparameters: {
    num_train_epochs: 3,
    learning_rate: 2e-5,
    per_device_train_batch_size: 4
  },
  validationSplit: 0.1,
  earlyStopping: true
});

// result.data.jobId - Job ID
// result.data.status - Job status
```

##### `getJobStatus(jobId)`, `listJobs(options)`, `cancelJob(jobId)`
Job management

```javascript
// Get status
const status = await finetune.getJobStatus("job_12345");
// status.data.progress - Progress (0-1)
// status.data.metrics - Training metrics

// List all jobs
const jobs = await finetune.listJobs({ status: "running", limit: 10 });

// Cancel job
const cancel = await finetune.cancelJob("job_12345");
```

##### `hyperparameterTuning(params)`, `registerModel(params)`, `prepareDataset(params)`
Advanced features

```javascript
// Hyperparameter tuning
const tuning = await finetune.hyperparameterTuning({
  baseModel: "qwen25",
  datasetPath: "./data/training.jsonl",
  taskType: "sft",
  searchSpace: {
    learning_rate: [1e-5, 5e-5],
    batch_size: [4, 8, 16]
  },
  numTrials: 10
});

// Register model version
const register = await finetune.registerModel({
  modelPath: "./models/elio-v1",
  versionName: "elio-persona-v1.0",
  metadata: { trained_on: "2024-01-15", accuracy: 0.95 },
  description: "Elio personality model"
});

// Prepare dataset
const dataset = await finetune.prepareDataset({
  rawDataPath: "./data/raw_convos.json",
  outputPath: "./data/prepared.jsonl",
  formatType: "chat",
  validationSplit: 0.1,
  maxLength: 2048
});
```

### 8. Moderation Service (`src/services/ai/moderation.js`)

Content moderation and safety filtering.

#### Available Methods

##### `scan(params)`
Scan content for safety issues

```javascript
import { moderation } from './services/ai/index.js';

const result = await moderation.scan({
  content: "User-generated text to check",
  categories: ["nsfw", "violence", "hate", "spam"]
});

// result.data.flagged - Whether flagged
// result.data.categories - Flagged categories
// result.data.scores - Category scores
// result.data.action - Recommended action ("allow", "warn", "block")
```

##### `rewrite(params)`
Rewrite inappropriate content

```javascript
const result = await moderation.rewrite({
  content: "Potentially inappropriate text",
  flaggedCategories: ["profanity"]
});

// result.data.rewrittenContent - Rewritten content
// result.data.changes - List of changes
```

##### `batchScan(params)`
Batch scanning

```javascript
const result = await moderation.batchScan({
  contents: [
    "First message",
    "Second message",
    "Third message"
  ],
  categories: ["nsfw", "hate"]
});

// result.data.results - Results for each content
// result.data.totalFlagged - Total flagged count
```

## Unified Export Usage

```javascript
// Method 1: Import entire namespace
import { llm, vlm, rag, agent, story } from './services/ai/index.js';

// Usage
const text = await llm.generate({ prompt: "Hello" });
const image = await vlm.describe({ imageUrl: "..." });

// Method 2: Import convenience functions
import { generateText, describeImage, searchRAG } from './services/ai/index.js';

const text = await generateText({ prompt: "Hello" });
const desc = await describeImage({ imageUrl: "..." });
const docs = await searchRAG({ query: "config" });

// Method 3: Import as needed
import { generate } from './services/ai/llm.js';
import { describe } from './services/ai/vlm.js';
```

## Configuration

Ensure the following environment variables are set in `.env` file:

```env
# AI Service Configuration
AI_SERVICE_URL=http://localhost:8000
AI_SERVICE_TIMEOUT_MS=60000
AI_ENABLED=true

# Model Selection
AI_MODEL_TEXT=deepseek
AI_MODEL_VLM=qwen-vl
EMBEDDINGS_MODEL=bge-m3

# RAG Configuration
RAG_TOP_K=5
RAG_MIN_SCORE=0.7
RAG_INDEX_NAME=vector_index

# Agent Configuration
AGENT_MAX_STEPS=10
AGENT_STEP_TIMEOUT_MS=15000

# Web Search
WEB_SEARCH_ENABLED=true
WEB_SEARCH_API_KEY=your_brave_api_key
WEB_SEARCH_MAX_RESULTS=5
```

## Error Handling

All service methods return unified result format:

```javascript
// Success
{
  ok: true,
  data: {
    // Service-specific data
  }
}

// Failure
{
  ok: false,
  error: {
    code: "ERROR_CODE", // BAD_REQUEST, AI_MODEL_ERROR, AI_TIMEOUT, etc.
    message: "Human-readable error message",
    details: { /* Additional details */ }
  }
}
```

Usage example:

```javascript
const result = await llm.generate({ prompt: "Hello" });

if (result.ok) {
  console.log("Generated text:", result.data.text);
} else {
  console.error("Error:", result.error.message);

  if (result.error.code === "AI_TIMEOUT") {
    // Handle timeout
  } else if (result.error.code === "DEPENDENCY_UNAVAILABLE") {
    // AI service unavailable
  }
}
```

## Usage in Discord Commands

Updated command example:

```javascript
// src/commands/ai.js
import { llm, vlm } from "../services/ai/index.js";
import { sendErrorReply, sendSuccessReply } from "../util/replies.js";

export async function execute(interaction) {
  await interaction.deferReply();

  if (subcommand === "chat") {
    const message = interaction.options.getString("message");

    const result = await llm.generate({
      prompt: message,
      maxTokens: 512
    });

    if (!result.ok) {
      await sendErrorReply(interaction, result.error);
      return;
    }

    await sendSuccessReply(interaction, {
      title: "🤖 AI Response",
      description: result.data.text
    });
  }
}
```

## Testing

Start Python AI Service:

```bash
cd ai-service
python -m uvicorn app.app:app --reload --port 8000
```

Start Discord Bot:

```bash
npm start
```

Test API health status:

```javascript
import { healthCheck } from './services/ai/index.js';

const health = await healthCheck();
console.log("AI Service status:", health.data.status);
```

## Performance Optimization Recommendations

1. **Connection Pooling**: HTTP client configured with connection pooling, reuses connections by default
2. **Timeout Settings**: Adjust timeout durations based on task types
3. **Batch Processing**: Use batch APIs (like `moderation.batchScan`) for efficiency
4. **Caching**: Implement result caching for frequent queries
5. **Parallel Execution**: Use `agent.multiTask` for parallel execution of independent tasks

## Logging and Monitoring

All service calls are automatically logged:

- Request parameters
- Response times
- Error information
- Token usage

View logs:

```javascript
import { logger } from './util/logger.js';

// Logs automatically recorded to console and files (if configured)
```

Metrics collection:

```javascript
import { incrementCounter, observeHistogram } from './util/metrics.js';

// Metrics automatically collected:
// - ai_service_requests_total
// - ai_service_latency_seconds
// - agent_runs_total
// - agent_step_seconds
```

## Troubleshooting

### 1. AI Service Connection Failure

```
Error: ECONNREFUSED
```

Solutions:
- Ensure Python AI service is running
- Check `AI_SERVICE_URL` configuration
- Verify firewall settings

### 2. Timeout Errors

```
Error: AI_TIMEOUT
```

Solutions:
- Increase `AI_SERVICE_TIMEOUT_MS`
- Reduce `maxTokens` parameter
- Check model loading status

### 3. Model Errors

```
Error: AI_MODEL_ERROR
```

Solutions:
- Check Python service logs
- Verify model configuration
- Ensure sufficient system resources (GPU/RAM)

## Extension Development

Adding new AI features:

1. Create new router in Python backend
2. Create corresponding JavaScript wrapper in `src/services/ai/`
3. Export in `src/services/ai/index.js`
4. Update this documentation

## Version Compatibility

- Node.js: >= 18.0.0
- Python: >= 3.10
- Discord.js: >= 14.0.0
- FastAPI: >= 0.109.0

## Contribution Guidelines

When submitting new features, please:

1. Follow existing code structure
2. Add JSDoc comments
3. Update this documentation
4. Include error handling
5. Provide usage examples

## License

MIT License