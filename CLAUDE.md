# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Elioverse Bot is a Discord bot with AI-powered conversational responses, RAG for lore-grounded answers, mini-games, and proactive engagement features. It consists of:
- **Node.js Discord bot** (discord.js) in `src/`
- **Python AI microservice** (FastAPI) in `ai-service/` (optional, requires GPU)
- **MongoDB** for persistence

## Common Commands

```bash
# Run bot (development)
npm run dev

# Run bot (production)
npm start

# Deploy slash commands to dev guild
npm run deploy:dev

# Deploy slash commands globally (takes ~1 hour to propagate)
npm run deploy:global

# Seed database (run in order or use seed:all)
npm run seed:personas
npm run seed:greetings
npm run seed:scenarios
npm run seed:media
npm run seed:all          # All seeds at once

# RAG operations
npm run ingest:rag        # Ingest markdown docs from data/rag-resources/
npm run test:rag          # Validate RAG setup

# Docker
docker compose up -d                    # Mongo + Bot only
docker compose --profile ai up -d       # Include AI service (needs GPU)
docker compose exec bot npm run seed:all
docker compose exec bot npm run deploy:dev
```

## Architecture

```
Discord Gateway
    ↓
src/index.js (entry point)
├── events/messageCreate.js → messageRouter.js → personaSwitcher.js
├── events/dmCreate.js → minigame handlers
├── commands/*.js (slash commands)
└── jobs/*.js (11 cron jobs for proactive engagement)
    ↓
src/services/ai/client.js → HTTP → ai-service:8000 (Python FastAPI)
    ↓
MongoDB (personas, profiles, rag_chunks, game_sessions, etc.)
```

**Message Flow:**
1. `messageRouter.js` detects triggers (mentions, keywords, random)
2. `personaSwitcher.js` selects appropriate persona based on context
3. AI service generates response (with optional RAG context)
4. `webhooks.js` sends reply with persona's avatar/name

## Key Patterns

**Services Pattern:** All services are singletons in `src/services/`, imported in `index.js` and passed to command handlers as a `services` object:
```javascript
async function execute(interaction, services) {
  const { ai, points, personas } = services;
}
```

**Result Pattern:** Methods return `{ ok: boolean, data?, error? }`:
```javascript
function ok(data) { return { ok: true, data }; }
function err(code, message, cause) { return { ok: false, error: { code, message, cause } }; }
```

**Command Structure:** Each `src/commands/*.js` exports `data` (SlashCommandBuilder) and `execute(interaction, services)`.

## Key Files

- `src/index.js` - Entry point, wires services, registers cron jobs
- `src/config.js` - Centralized config (validated at startup)
- `src/services/messageRouter.js` - Core message routing, triggers, cooldowns
- `src/services/personaSwitcher.js` - Persona selection logic
- `src/services/ai/client.js` - HTTP client to Python AI service
- `src/services/minigames/GameManager.js` - Mini-game orchestrator
- `ai-service/app/app.py` - FastAPI app entry point
- `ai-service/app/models/manager.py` - ModelManager for LLM/VLM/embeddings

## Configuration

**Required Environment Variables:**
- `DISCORD_TOKEN` - Bot token
- `APP_ID` - Application ID
- `MONGODB_URI` - MongoDB connection string
- `DB_NAME` - Database name (default: `communiverse_bot`)

**AI Service (optional):**
- `AI_SERVICE_URL` - http://ai-service:8000 (Docker) or http://localhost:8000
- `AI_ENABLED` - Enable AI responses (true/false)
- `FINETUNED_MODEL_ENABLED` - Use LoRA adapter

See `.env.example` for full list.

## Database

MongoDB collections: `personas`, `scenarios`, `greetings`, `media`, `profiles`, `rag_chunks`, `game_sessions`, `guild_config`, `schedules`.

Indexes are ensured at startup via `src/db/ensure-indexes.js`.

## Mini-Games

12 game types in `src/services/minigames/games/`:
- TriviaGame, AdventureGame, ReactionGame, BattleGame
- IR/NLP-based games: IRClueGame, IRDocHuntGame, NgramStoryGame, etc.

Games register in `GameManager.GAME_TYPES`. Button handlers use custom IDs like `trivia_answer_{sessionId}_{optionIndex}`.

## Cron Jobs

11 proactive jobs in `src/jobs/`:
- `autoScenarios.js` (4h), `autoMemeDrop.js` (6h), `autoPersonaChat.js` (2h)
- `autoMiniGame.js` (4h), `autoStoryWeave.js` (12h), `autoWorldBuilder.js` (24h)
- `cosmicDigest.js` (daily 10:00), `channelSummary.js` (daily 23:00)

## Important Notes

- **Conversation memory** is in-memory with 30min TTL (resets on restart)
- **Persona replies** use Discord webhooks for custom avatar/name
- **Slash commands** must be deployed before Discord recognizes them
- **RAG ingestion** requires the AI service to be running
- **Third-person filter** (`utils/pronounFilter.js`) post-processes LLM output to enforce first-person voice
