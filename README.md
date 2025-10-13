# Communiverse Bot (MVP scaffold)
Node.js 20+, discord.js v14, MongoDB, node-cron, dotenv.

## Quick start
1) cp .env.example .env  (fill values)
2) npm install
3) npm run deploy:dev
4) npm run dev

## Folders
- src/index.js             (entry; gateway + router)
- src/config.js            (env/constants)
- src/commands/*.js        (/drop, /game)
- src/services/*.js        (scheduler, media repo, points)
- src/db/mongo.js          (Mongo client)
- src/util/replies.js      (reply helpers)
- scripts/deploy-commands.js (guild-scoped registration)

### Mongo via Docker (recommended)
```bash
docker volume create mongo_data
docker run -d --name mongo \
  -p 27017:27017 \
  -v mongo_data:/data/db \
  -e MONGO_INITDB_ROOT_USERNAME=dev \
  -e MONGO_INITDB_ROOT_PASSWORD=devpass \
  mongo:7 --auth
```

Set `.env` → `MONGODB_URI=mongodb://dev:devpass@127.0.0.1:27017/?authSource=admin`

> On WSL, prefer WSL2 and run Node inside WSL. If your repo is under `/mnt/c/...`, installation works but is slower.

## Seed & Persona/Scenario visuals

This repo ships JSON seeds under `data/`:

- `data/personas.json` — now includes per-persona `avatar` (URL) and `color` (decimal int).
- `data/scenarios.json` — each scenario may define `hostPersonaName` so reveals are announced by that persona via webhook.
- `data/greetings.json` / `data/media.json` — optional, for greetings and media pool.

Run seeds:

```bash
npm run seed:personas
npm run seed:scenarios
npm run seed:greetings   # optional
npm run seed:media       # optional
