# Remote Deployment Guide

This repository is designed to run in Docker on a remote host. For day-to-day operations, use the **bot-only deploy workflow** to avoid restarting Mongo/Admin unnecessarily.

> Chinese version: `docs/REMOTE_DEPLOYMENT.zh.md`

## Hosts (CPU / GPU)

### CPU VPS (no GPU)

| Item | Value |
|------|-------|
| Host | `live.dothost.net` |
| SSH Port | `2965` |
| User | `neojustin` |
| Project Path | `~/elio-discord-bot` |
| Mode | CPU / Mock (no GPU) |

### GPU Dedicated (llama.cpp GPU host)

| Item | Value |
|------|-------|
| Host | `live4.dothost.net` |
| SSH Port | `2285` |
| User | `neojustin` |
| Project Path | `~/elio-discord-bot` |
| GPU | `NVIDIA GeForce GTX 1050 Ti (4GB VRAM)` |
| LLM | `llama.cpp server` (recommended bind `172.18.0.1:8080` for Docker bridge-only access) |

Notes:
- If `docker compose` requires `sudo` on the remote host, either add the user to the `docker` group or use the deploy script’s `--sudo` support.
- The example deploy script uses `ssh -T` (no TTY) to reduce the risk of secrets being echoed by an interactive TTY session.

---

## One-Click Deploy (Recommended)

### One-time setup (local machine)

`scripts/deploy-remote.sh` and `remote.md` are **local-only** (gitignored). Create your local deploy script from the example:

```bash
cp scripts/deploy-remote.example.sh scripts/deploy-remote.sh
chmod +x scripts/deploy-remote.sh
```

Create `./.env.deploy` (do not commit):

```bash
cat > .env.deploy <<'EOF'
SSHPASS='your-ssh-password'
DEPLOY_HOST='neojustin@live4.dothost.net'
DEPLOY_PORT='2285'
DEPLOY_PATH='~/elio-discord-bot'

# If remote docker needs sudo (common on live4):
# DEPLOY_SUDO='true'

# If sudo password differs from SSH password (often the same, can omit):
# DEPLOY_SUDO_PASS='your-sudo-password'
EOF
```

### Common usage

```bash
# Quick daily update: sync bot files + restart only bot (recommended)
./scripts/deploy-remote.sh --bot-only --sync-bot

# Rebuild the bot image + restart bot only
./scripts/deploy-remote.sh --bot-only --sync-bot --build

# If remote docker requires sudo
./scripts/deploy-remote.sh --bot-only --sync-bot --build --sudo

# Skip slash command deployment (safe when you didn’t change command schema)
./scripts/deploy-remote.sh --bot-only --sync-bot --build --skip-commands
```

What the script does (high level):
1) Rsync to remote (safe excludes; avoids deleting `models/`)
2) `docker compose build` (optional)
3) Start services (bot-only or full stack)
4) Ensure MongoDB indexes
5) Deploy slash commands (optional) and tail logs

---

## Manual Deployment (Reference)

### 1) Rsync to remote

```bash
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude 'dist' \
  --exclude 'logs' \
  --exclude '.env' \
  --exclude '.env.deploy' \
  --exclude 'ai-service/.env' \
  --exclude 'models' \
  -e 'ssh -p 2285' \
  /path/to/elio-discord-bot/ \
  neojustin@live4.dothost.net:~/elio-discord-bot/
```

### 2) SSH into the host

```bash
ssh -p 2285 neojustin@live4.dothost.net
cd ~/elio-discord-bot
```

### 3) Bot-only restart (recommended)

```bash
# If docker does not require sudo:
docker compose build bot
docker compose up -d bot

# If docker requires sudo:
sudo docker compose build bot
sudo docker compose up -d bot
```

### 4) Ensure indexes

```bash
sudo docker compose exec -T bot npm run ensure-indexes
```

### 5) Logs / status

```bash
sudo docker compose ps
sudo docker compose logs -f bot
```

### 6) Slash command deploy (only when schema changes)

```bash
# Dev guild (immediate)
sudo docker compose exec -T bot npm run deploy:dev

# Global (may take ~1 hour)
sudo docker compose exec -T bot npm run deploy:global
```

