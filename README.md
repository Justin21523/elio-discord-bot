# Elio Discord Bot

A production-ready Discord bot with **LLM (fine-tuned personas), RAG, VLM (images), agent-style orchestration, proactive jobs, DM games, and multi-persona routing**—all packaged for Docker and tuned for real workloads.

> TL;DR: It’s live, fast, and fun. You get persona-true replies, lore-grounded answers, and scheduled content out of the box.

---

## Table of Contents

- [Communiverse / Elioverse Bot](#communiverse--elioverse-bot)
  - [Table of Contents](#table-of-contents)
  - [Features](#features)
  - [Architecture](#architecture)
  - [Requirements](#requirements)
  - [Quick Start (Docker)](#quick-start-docker)
  - [Configuration](#configuration)
  - [Slash Commands \& DM Flows](#slash-commands--dm-flows)
  - [Proactive Jobs (Scheduler)](#proactive-jobs-scheduler)
  - [Training \& Fine-Tuning](#training--fine-tuning)
    - [1) Local/Container Fine-Tuning (LoRA on DeepSeek-7B Chat)](#1-localcontainer-fine-tuning-lora-on-deepseek-7b-chat)
    - [2) Multi-Character Data Generation (if you need more)](#2-multi-character-data-generation-if-you-need-more)
  - [Testing \& Verification](#testing--verification)
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
  Per-channel & per-persona, last ~10 messages, ~30-minute TTL, auto-prune.

* **Proactive Engagement**
  Mentions, keyword triggers, random engagement (with cooldowns), and cron-driven content (meme drops, mini-games, story weave, world builder).

* **Production-Ready Docker Compose**
  Multi-task vs. performance deployment profiles with preloading toggles and CUDA allocator settings to avoid fragmentation.

* **DM Mini-Games**
  Trivia (RAG-grounded), riddle stub, and interactive story with scoring/leaderboard hooks.

---

## Architecture

High-level flow from Discord → Router → AI Service (LLM/RAG/VLM) → Webhooks back to Discord, with cron jobs for proactive content. File locations, responsibilities, and service boundaries are spelled out below.

```
Discord Gateway
  ├─ messageCreate (guild)  → src/events/messageCreate.js
  └─ dmCreate (DMs)         → src/events/dmCreate.js
         ↓
   src/services/messageRouter.js
     ├─ triggers & cooldowns
     ├─ conversationHistory (TTL)
     ├─ RAG (K=10, minScore=0.5)
     ├─ VLM (if image)
     └─ persona composition → ai-service (FastAPI)
         ├─ LLM (finetuned adapters)
         ├─ RAG search
         └─ VLM analysis
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

# 4) Ensure MongoDB indexes
docker compose exec bot node src/db/ensure-indexes.js

# 5) Ingest RAG resources + smoke test
docker compose exec bot node scripts/ingest-rag.js
docker compose exec bot node scripts/rag-smoketest.js

# 6) Seed personas/scenarios/greetings/etc.
docker compose exec bot node scripts/seed-all-local.js

# 7) Deploy slash commands (includes /game)
docker compose exec bot node scripts/deploy-commands.js
```

**Profile switch (optional):**

* **Performance mode (preload LLM 8-bit)**: set `PRELOAD_LLM=true` in the AI service env and recreate the service.
* **Back to Multi-task**: set `PRELOAD_LLM=false`.

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
`/ai, /rag, /persona, /scenario, /game, /minigame, /profile, /leaderboard, /points, /greet, /story, /finetune, /config-proactive, /schedule, /drop, /admin-data`.

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
  events/messageCreate.js | dmCreate.js    # Discord intake
  services/messageRouter.js                # triggers, routing, memory
  services/conversationHistory.js          # per persona/channel
  services/webhooks.js                     # persona avatar/name
  handlers/dmHandlers.js                   # DM chat + mini-games
  handlers/proactiveHandlers.js            # jobs orchestration
  jobs/*.js                                # scheduled jobs
scripts/                                   # seed/ingest/test/deploy
```

(See the status/feature guide for file paths and ownership across modules.)

---

## License

This repository bundles third-party models and datasets under their respective licenses. Ensure you have the right to use film-related character data and adhere to Discord’s platform rules. Model licenses and dataset terms apply.

---

### Production Status (for the record)

As of the latest deployment, **all services are healthy and fully operational**; commands are registered; cron jobs are active; fine-tuned adapters are loaded for persona replies; and RAG is populated. Deployment profiles and GPU allocator settings are captured in the deployment playbook.
