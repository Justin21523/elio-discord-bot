# Elio Discord Bot

A production-ready Discord bot with **LLM (fine-tuned personas), RAG, VLM (images), agent-style orchestration, proactive jobs, DM games, and multi-persona routing**—all packaged for Docker and tuned for real workloads.

> TL;DR: It’s live, fast, and fun. You get persona-true replies, lore-grounded answers, and scheduled content out of the box.

---

## Table of Contents

- [Features](#features)
- [How To Use (Discord)](#how-to-use-discord)
  - [Auto-Replies: `/assistant`](#auto-replies-assistant)
  - [Scene Threads: `/scene`](#scene-threads-scene)
  - [Server Admin Setup: `/config-assistant`](#server-admin-setup-config-assistant)
- [Architecture](#architecture)
- [Requirements](#requirements)
- [Quick Start (Docker)](#quick-start-docker)
- [Configuration](#configuration)
- [Slash Commands & DM Flows](#slash-commands--dm-flows)
- [Proactive Jobs (Scheduler)](#proactive-jobs-scheduler)
- [Training & Fine-Tuning](#training--fine-tuning)
  - [1) Local/Container Fine-Tuning (LoRA on DeepSeek-7B Chat)](#1-localcontainer-fine-tuning-lora-on-deepseek-7b-chat)
  - [2) Multi-Character Data Generation (if you need more)](#2-multi-character-data-generation-if-you-need-more)
- [Testing & Verification](#testing--verification)
- [Performance](#performance)
- [Troubleshooting](#troubleshooting)
- [Project Structure](#project-structure)
- [License](#license)
  - [Production Status (for the record)](#production-status-for-the-record)

---

## Features

* **Fine-tuned Personas (LoRA on DeepSeek-7B Chat)**
  Default for persona replies, adapter mounted and active by default. Paths and toggles are provided; persona switching is automatic via keywords and context.

* **RAG (Vector + Hybrid)**
  Used for lore/trivia grounding and world info. Top-K and score thresholds are configurable.

* **VLM (Vision)**
  Image analysis gets woven into persona-style replies in channels and DMs.

* **Conversation Memory**
  Per-channel & **per-user** & per-persona, last ~10 messages, ~30-minute TTL, auto-prune (prevents cross-user contamination).

* **Assistant Auto-Replies (Opt-in)**
  Per-user modes (`off` / `mentions` / `full`), plus server-level **channel whitelist** and **/scene threads** for safe RP (includes scene recap on end + background cleanup).

* **Proactive Engagement**
  Mentions, keyword triggers, random engagement (with cooldowns), and cron-driven content (meme drops, mini-games, story weave, world builder).

* **Production-Ready Docker Compose**
  Multi-task vs. performance deployment profiles with preloading toggles and CUDA allocator settings to avoid fragmentation.

* **DM Mini-Games**
  Trivia (RAG-grounded), riddle stub, and interactive story with scoring/leaderboard hooks.

---

## How To Use (Discord)

This section is for **server users** and **server admins** who want the latest behavior in plain language.

### Auto-Replies: `/assistant`

Auto-replies are **per-user** and **per-server**.

Modes:
- `off`: no message-based replies (slash commands still work)
- `mentions` (default): replies only when you **@mention the bot** or **reply** to a bot/persona message
- `full`: same as `mentions`, plus RP prefix triggers like `caleb:` (see below)

Enable/disable:
- Enable full mode: `/assistant on` (or `/assistant mode value:full`)
- Disable: `/assistant off`
- Check status: `/assistant status`

RP prefix trigger (full mode only):
- Must be **lowercase**: `caleb: hello` ✅, `Caleb: hello` ❌
- `:` and `：` (fullwidth colon) are both supported
- Only works in:
  - channels allowed by the server’s **full-mode whitelist**, or
  - an active **/scene** thread

Notes:
- In **scene threads**, the bot avoids `@mention` in its reply to keep the RP clean.
- The bot has an in-flight guard to reduce “double replies” if you send multiple triggers quickly.

### Scene Threads: `/scene`

Scenes are thread-based RP spaces. They make “full mode” safe and contained.

Common flows:
- Start a new scene thread: `/scene start` (from a normal text channel)
- Adopt an existing thread as a scene: `/scene adopt` (requires **Manage Threads** or thread owner)
- Post a scene starter prompt: `/scene prompt persona:<name> situation:<text>`
- Check status: `/scene status`
- End (and archive) a scene: `/scene end`

Scene recap:
- When you end a scene, the bot tries to generate and post a **Scene Recap**.
- If recap generation fails, it is retried in the background.

Scene lifecycle safety:
- If a scene thread is **archived or deleted manually**, the bot automatically ends the scene record to prevent “stuck active” scenes.

### Server Admin Setup: `/config-assistant`

This is an **admin-only** command to keep auto-replies maintainable.

Recommended setup:
- View current settings: `/config-assistant view`
- Enable whitelist for full mode (RP prefix): `/config-assistant whitelist-enable enabled:true`
- Add allowed channels: `/config-assistant whitelist-add channel:#your-channel`
- Enable/disable scenes: `/config-assistant scenes-enable enabled:true|false`
- Set default scene auto-archive duration: `/config-assistant scenes-auto-archive minutes:1440`

Important:
- The whitelist affects **only** the `full` mode RP prefix trigger (e.g. `caleb:`).
- `mentions` mode (bot @mentions / replies) can still work outside the whitelist (unless a user sets `/assistant off`).

---

## Architecture

High-level flow from Discord → bot (Node.js) → AI services (optional) → persona-styled output back to Discord, plus cron jobs for proactive content.

```
Discord Gateway
  ├─ Guild messages → src/events/messageCreate.ts
  │   ├─ triggers: @mention / reply / (full mode) RP prefix like `caleb:`
  │   ├─ per-user mode gating → /assistant
  │   ├─ whitelist + scene gating for RP prefix → /config-assistant + /scene
  │   ├─ reply strategies: llama.cpp (optional) → personaLogic → local fallback
  │   └─ persona output → src/services/webhooks.ts (webhook or embed fallback)
  └─ DMs → src/events/dmCreate.ts → src/handlers/dmHandlers.ts
      ├─ DM chat + persona switching
      └─ DM mini-games

AI stack (optional / mixed):
  - ai-service/ (FastAPI): personaLogic, IR/RAG utilities, Markov/recs endpoints
  - optional llama.cpp server: fast on-device inference (USE_LLAMA_SERVER=true)
```

Persistence across MongoDB (profiles, personas, scenarios, game state) + vector store (Atlas Vector Search or FAISS). Webhook sender handles persona avatar/name.

---

## Requirements

* **GPU:** CUDA-enabled (e.g., RTX 5080 16 GB). Multi-task profile idles at ~2.2–2.3 GB; performance profile preloads LLM at ~11.2 GB.
* **Docker & Docker Compose** for orchestration.
* **Discord Bot Token**, MongoDB (dockerized), and local ports open for the AI service.

---

## Quick Start (Docker)

From project root (where `docker-compose.yml` lives):

```bash
# 1) Bring everything up
docker compose up -d

# 2) Tail logs
docker compose logs -f

# 3) Wait for AI service readiness
docker compose logs -f ai-service | grep "Application startup complete"

# (Optional) Admin dashboard (Discord OAuth)
# - Set `DISCORD_OAUTH_CLIENT_SECRET` + redirect URL in Discord portal
# - Enable bot runtime bridge: `BOT_ADMIN_ENABLED=true` (and set `BOT_ADMIN_TOKEN`)
# - Then open: http://localhost:3030

# 4) Ensure MongoDB indexes
docker compose exec bot npm run ensure-indexes

# 5) Ingest RAG resources + smoke test
docker compose exec bot npm run ingest:rag
docker compose exec bot npm run test:rag

# 6) Seed personas/scenarios/greetings/etc.
docker compose exec bot npm run seed:all

# 7) Deploy slash commands (includes /game)
docker compose exec bot npm run deploy-commands
```

**Profile switch (optional):**

* **Performance mode (preload LLM 8-bit)**: set `PRELOAD_LLM=true` in the AI service env and recreate the service.
* **Back to Multi-task**: set `PRELOAD_LLM=false`.

**Remote deployment (maintainers):**
- See `docs/REMOTE_DEPLOYMENT.md`
- Use `scripts/deploy-remote.example.sh` for a safe, bot-only restart workflow (keep secrets in `.env.deploy`, do not commit)

---

## Configuration

Key `.env` flags (bot + AI service). Tune these per your environment:

```bash
# AI Service
AI_SERVICE_URL=http://ai-service:8000
AI_ENABLED=true

# Fine-tuned model (LoRA on DeepSeek 7B Chat)
FINETUNED_MODEL_ENABLED=true
FINETUNED_BASE_MODEL=deepseek-ai/deepseek-llm-7b-chat
FINETUNED_ADAPTER_PATH=/app/models/sft_lora_balanced
FINETUNED_USE_FOR_PERSONAS=true

# RAG
RAG_TOP_K=10
RAG_MIN_SCORE=0.5

# Router thresholds
RELEVANCE_THRESHOLD=0.3

# Preload knobs
PRELOAD_EMBEDDINGS=true
PRELOAD_LLM=false
PRELOAD_VLM=false

# Logging
LOG_LEVEL=info
```

**Guild-level toggles** (MongoDB `guild_config`): proactive features + channel allowlist + feature switches for RAG/VLM/Agent. Sample update statement provided in docs.

**CUDA allocator (stability):**
`PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:256,expandable_segments:true` (helps reduce fragmentation).

---

## Slash Commands & DM Flows

Core commands include:
`/help, /assistant, /scene, /config-assistant, /ai, /rag, /persona, /scenario, /game, /minigame, /profile, /leaderboard, /points, /greet, /story, /finetune, /config-proactive, /schedule, /drop, /admin-data`.

Quick help:
- `/help` shows a categorized command guide (recommended)
- `!help` in a server channel shows the DM help guide

DM helpers: `!persona`, `!game trivia`, `!story`, `!clear`, `!status`. Mini-game loop includes start/status/answer/stop with scoring & logs.

---

## Proactive Jobs (Scheduler)

Cron-driven tasks (examples & cadences): auto scenario (4h), media sweep (6h), daily digest (10:00), channel summary (23:00), content expansion (6h), scenario reveal (every minute), auto meme drop (6h), auto persona chat (2h), auto mini-game (4h), auto story weave (noon), auto world builder (midnight).

Jobs can also be triggered manually for testing (examples in Docker guide).

---

## Training & Fine-Tuning

Two supported paths:

### 1) Local/Container Fine-Tuning (LoRA on DeepSeek-7B Chat)

* **Dataset**: 1,185 film-accurate examples across 15 characters (Elio, Glordon, Olga, Lord Grigon, etc.).
* **Strategy**: Use a **chat** base model + **persona data** (single-stage). Prevents catastrophic forgetting and focuses on style/voice.
* **Starter params**: LoRA r=16/α=32, epochs=3, LR=2e-4, 4-bit quant where appropriate.

**One-pager quick run:** copy dataset + script into the `ai-service` container, `nvidia-smi` check, then `bash /app/scripts/train_all_characters_chat.sh`. Progress and expected losses are documented.

**Deep-dive guide:** data sources, persona dataset curation, and training script/notebook examples (PEFT, bitsandbytes, Accelerate) are provided.

### 2) Multi-Character Data Generation (if you need more)

Script generates per-persona JSONL (tiered counts) from your RAG bios and merges into a complete file. Also includes QA/validation snippets and cost/runtime notes.

---

## Testing & Verification

**Channel auto-reply & DM flows:** step-by-step scenarios, expected logs (`[ROUTER] [RAG] [LLM] [DM-GAME]`), and DB checks are included.

**Functional tests:**

* Keyword/mention/random/image triggers with cooldowns.
* RAG retrieval sanity.
* Mini-game start/answer/status.
  All with example commands and expected outputs.

**Production verification:** health endpoints, compose ps/logs, and GPU monitoring helpers.

---

## Performance

* **Observed**: warm LLM 1–2s; on-demand cold start 4–6s; RAG <0.5s; VLM 2–3s warm / 8–10s cold. Auto-unload after ~10 minutes idle in the multi-task profile.
* **Conversation & triggers**: 10-message memory (30-minute TTL); thresholds/cooldowns documented with typical values.

---

## Troubleshooting

* **No persona replies?**
  Lower `RELEVANCE_THRESHOLD` (e.g., 0.4→0.3), check logs for relevance scores and ensure personas exist in DB.

* **RAG ingestion fails**
  Check AI service health/logs and restart. Validate embed model via `/embed/model-info`.

* **Jobs not running**
  Grep for scheduler registration; verify cron logs.

* **Training issues**
  OOM → reduce batch size and/or raise grad accumulation. Loss not decreasing → adjust learning rate. bitsandbytes import problems → pin/reinstall or drop 4-bit. CUDA missing → add GPU reservations in compose. Detailed command snippets provided.

* **Slow responses**
  Confirm fine-tuned model load status, and inspect GPU utilization.

---

## Project Structure

```
ai-service/
  app/api/routers/persona_router.py        # persona composition
  app/services/rag/search.py               # retrieval
  app/services/vlm/                        # vision
  models/finetuned.py                      # LoRA loading & use
src/
  index.ts                                 # entry point + router + cron
  events/messageCreate.ts | dmCreate.ts    # Discord intake
  commands/assistant.ts                    # per-user auto-reply mode
  commands/config-assistant.ts             # admin: whitelist + scenes config
  commands/scene.ts                        # thread-based RP scenes (+ recap)
  services/assistantGuildSettings.ts       # guild assistant settings
  services/assistantScenes.ts              # scene persistence + recap state
  services/conversationHistory.ts          # per-channel/per-user/per-persona memory (TTL)
  services/webhooks.ts                     # persona avatar/name (webhook or embed fallback)
  handlers/dmHandlers.ts                   # DM chat + mini-games
  jobs/sceneCleanup.ts                     # cleanup active scene records
  jobs/sceneRecap.ts                       # background recap generator
  jobs/*.ts                                # scheduled jobs
scripts/                                   # seed/ingest/test/deploy
```

(See the status/feature guide for file paths and ownership across modules.)

---

## License

This repository bundles third-party models and datasets under their respective licenses. Ensure you have the right to use film-related character data and adhere to Discord’s platform rules. Model licenses and dataset terms apply.

---

### Production Status (for the record)

As of the latest deployment, **all services are healthy and fully operational**; commands are registered; cron jobs are active; fine-tuned adapters are loaded for persona replies; and RAG is populated. Deployment profiles and GPU allocator settings are captured in the deployment playbook.
