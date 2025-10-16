# LLM_PROVIDER.md

This file provides guidance to LLMProvider Tooling (llm_provider.ai/code) when working with code in this repository.

## Project Overview

Communiverse Bot (aka "elioverse-bot") is a Discord bot built on Node.js 20+ with discord.js v14, MongoDB, and a Python AI sidecar. The bot provides interactive commands including persona-based chat, RAG (Retrieval Augmented Generation), vision/language models, scheduled jobs, points/gamification, and agent-based task orchestration.

## Architecture

### Three-Service Stack

1. **Node.js Bot** (`src/`) - Discord gateway, command routing, MongoDB orchestration
2. **Python AI Sidecar** (`ai-python/`) - FastAPI service exposing LLM, RAG, VLM, embeddings, agent endpoints
3. **MongoDB** - Stores personas, scenarios, schedules, RAG vectors (with Atlas vector search or FAISS fallback), points, media, greetings

### Key Design Patterns

- **Command Router**: `src/index.js` builds a Collection-based router from command modules in `src/commands/`. Each command exports `data` (SlashCommandBuilder) and `execute(interaction, services)`.
- **Services Injection**: Commands receive a `services` object containing `{ scheduler, mediaRepo, points, personas, scenarios, webhooks, jobs, ai }`. The `ai` service (`src/services/ai/index.js`) is a unified facade over the Python sidecar.
- **AI Facade**: `src/services/ai/index.js` aggregates specialized modules (llm, rag, images, web, moderation, persona) and provides high-level helpers like `summarizeNews()`, `personaReply()`, `imageReact()`, `agentTask()`.
- **MongoDB Proxy**: `src/db/mongo.js` exports a `collections` Proxy that lazily returns `db.collection(name)` for any property access, maintaining backward compatibility.
- **Python Routers**: `ai-python/app/main.py` mounts FastAPI routers for `/llm`, `/rag`, `/vlm`, `/agent`, `/embeddings`, `/moderation`, `/persona`, `/web`, `/images`, `/dataset`, `/admin`, `/status`. Core logic lives in `ai-python/core/`.

### Data Flow Example

```
Discord User → /persona ask <question>
  ↓
src/commands/persona.js execute()
  ↓
services.ai.persona.compose(text, personaData)
  ↓
HTTP POST to ai-python:8088/persona/compose
  ↓
Python: core.llm.EnhancedLLMAdapter + persona style prompt
  ↓
Response back to Discord with persona-styled reply
```

## Development Commands

### Local Setup

```bash
# 1. Copy environment template and fill Discord token, etc.
cp .env.example .env

# 2. Install Node dependencies
npm install

# 3. Start MongoDB (Docker recommended)
docker compose up -d mongo

# 4. Deploy slash commands to Discord guild (dev mode)
npm run deploy:dev

# 5. Run bot in dev mode
npm run dev
```

### Full Stack (Docker Compose)

```bash
# Start all services: mongo, ai-python (GPU optional), bot
docker compose up -d

# View logs
docker compose logs -f bot
docker compose logs -f ai-python

# Rebuild after code changes
docker compose up -d --build
```

### Seeding Data

```bash
# Seed personas (with avatars, colors)
npm run seed:personas

# Seed scenarios (with host persona references)
npm run seed:scenarios

# Optional: greetings and media
npm run seed:greetings
npm run seed:media

# Seed all at once (runs personas, scenarios, greetings, media, jobs, points)
node scripts/seed-all.js

# Minimal seed (just personas + scenarios)
node scripts/seed-minimal.js
```

### Database Utilities

```bash
# Ensure MongoDB indexes exist
node scripts/ensure-indexes.js

# Create Atlas Vector Search index (if using MongoDB Atlas)
node scripts/create-avs-index.js

# Diagnose database connection and collections
node scripts/diagnose-db.mjs

# Test MongoDB connection directly
node scripts/test-mongo.mjs
```

### Python AI Sidecar (Standalone Dev)

```bash
cd ai-python

# Install Python dependencies
pip install -r requirements.txt

# Run FastAPI dev server
uvicorn app.main:app --host 0.0.0.0 --port 8088 --reload

# Check health
curl http://localhost:8088/health

# Access interactive docs
open http://localhost:8088/docs

```

## Configuration

All runtime config is centralized in:
- **Node**: `src/config.js` reads from `process.env` (via dotenv)
- **Python**: `ai-python/core/config.py` reads from `os.environ`

Key environment variables in `.env`:
- `DISCORD_TOKEN`, `APP_ID`, `GUILD_ID_DEV` - Discord bot credentials
- `MONGODB_URI`, `DB_NAME` - MongoDB connection (local or Atlas)
- `AI_API_BASE_URL` - Python sidecar endpoint (default: `http://ai-python:8088`)
- `LLM_MODEL`, `VLM_MODEL`, `EMBEDDINGS_MODEL` - Model names/paths
- `LLM_ADAPTER` - Backend adapter (`tgi` | `vllm` | `ollama` | `mock`)
- `RAG_PROVIDER` - RAG backend (`atlas` for MongoDB Atlas Vector Search | `faiss` for local FAISS)
- `RAG_INDEX_NAME` - Name of the vector search index (default: `rag_vector_index`)
- `ENABLE_CUDA` - Set to `1` in docker-compose.yml to enable GPU in ai-python container

## Important Patterns

### Adding a New Command

1. Create `src/commands/my-command.js`:
   ```js
   import { SlashCommandBuilder } from "discord.js";

   export const data = new SlashCommandBuilder()
     .setName("my-command")
     .setDescription("Does something cool");

   export async function execute(interaction, services) {
     await interaction.deferReply();
     // Use services.ai, services.personas, services.points, etc.
     await interaction.editReply("Done!");
   }
   ```

2. Import and register in `src/index.js`:
   ```js
   import * as myCmd from "./commands/my-command.js";
   // Add to buildRouter() array: myCmd
   ```

3. Redeploy commands: `npm run deploy:dev`

### Using the AI Facade

```js
// LLM text generation
const result = await services.ai.llm.generate("Translate to French: Hello", { max_length: 64 });
if (result.ok) console.log(result.data.text);

// RAG query
const ragResult = await services.ai.rag.query("How do personas work?", { topK: 5 });
if (ragResult.ok) console.log(ragResult.data.answer);

// Image caption
const caption = await services.ai.images.captionUrl("https://example.com/image.jpg", 120);

// Web search + summarize
const news = await services.ai.summarizeNews("latest AI developments", 6);
```

### MongoDB Collections

Access via `collections` proxy or `getCollection()`:

```js
import { collections, getCollection } from "./db/mongo.js";

// Via proxy (backward-compatible)
const personas = await collections.personas.find({}).toArray();

// Via explicit helper
const scheduleCol = getCollection("schedules");
await scheduleCol.updateOne({ _id }, { $set: { active: false } });
```

Main collections:
- `personas` - Persona definitions (name, prompt, avatar, color)
- `scenarios` - Scenario templates (question, correctAnswer, hostPersonaName)
- `schedules` - Cron-based job schedules
- `jobs` - Pending job queue (processed by scheduler)
- `points` - User points/leaderboard
- `media` - Media pool for drops
- `greetings` - Greeting messages
- `rag_docs` - RAG document chunks with embeddings
- `ai_logs` - AI interaction logs (if enabled)

### Webhooks and Personas

Scenarios can specify `hostPersonaName`. When a scenario reveal is triggered, the bot fetches that persona's `avatar` and `color` from `collections.personas`, then uses `services.webhooks.sendAsPersona(channel, personaData, message)` to post via webhook with the persona's avatar and username.

### Scheduler and Jobs

- `services.scheduler` wraps node-cron; schedules persist in `collections.schedules`.
- `services.jobs` queues jobs in `collections.jobs` for async execution.
- On boot, `src/index.js` calls `scheduler.setJobRunner(jobs.run)` and `scheduler.bootFromDb()` to restore schedules.

## Testing and Debugging

- The bot logs to stdout with `[INT]`, `[ERR]`, etc. prefixes.
- Python sidecar logs request latency with `[HTTP]` prefix.
- Use `/ai-check` command in Discord to verify sidecar connectivity.
- Use `/ai-logs list` to view recent AI interaction logs (if `ai_logs` collection is populated).
- Check `docker compose logs -f ai-python` for model loading issues or CUDA errors.

## RAG and Vector Search

- **Atlas mode** (`RAG_PROVIDER=atlas`): Requires MongoDB Atlas cluster with Vector Search index (`RAG_INDEX_NAME`). Use `scripts/create-avs-index.js` to create the index via Atlas admin API.
- **FAISS mode** (`RAG_PROVIDER=faiss`): Stores vectors in MongoDB but uses FAISS for retrieval in-memory (fallback for local dev).
- Retrieval modes: `hybrid` (BM25 + vector), `semantic` (vector only), `bm25` (keyword only), `cosine` (simple cosine fallback).
- Seed RAG documents with `node scripts/seed-rag.js` (if implemented) or via `/rag-add` commands.

## Code Style

- **Node.js**: ESM modules (`"type": "module"` in package.json). Use `import`/`export`.
- **Python**: Type hints encouraged. Use `from __future__ import annotations` for forward refs. All docstrings and comments in English.
- Avoid Chinese characters in code; use English comments and logs.
- Log messages use prefixes: `[INT]` (info), `[ERR]` (error), `[HTTP]` (http request).

## WSL Notes

If running on Windows with WSL2:
- Keep repo inside WSL filesystem (not `/mnt/c/...`) for better performance.
- Run Node and Docker from within WSL2.
- Use `MONGODB_URI=mongodb://dev:devpass@127.0.0.1:27017/?authSource=admin` for local mongo, or `mongo` hostname if using docker-compose.
