#!/bin/bash
# ============================================================================
# Remote Deployment Script (Example)
# Copy to scripts/deploy-remote.sh (gitignored) and set secrets in .env.deploy
# ============================================================================
#
# Usage:
#   ./scripts/deploy-remote.example.sh                # Deploy + restart services
#   ./scripts/deploy-remote.example.sh --build        # Deploy + rebuild images
#   ./scripts/deploy-remote.example.sh --seed         # Deploy + seed database
#   ./scripts/deploy-remote.example.sh --dev          # Deploy + dev guild commands
#   ./scripts/deploy-remote.example.sh --global       # Deploy + global commands
#   ./scripts/deploy-remote.example.sh --both         # Deploy + dev + global commands
#   ./scripts/deploy-remote.example.sh --bot-only     # Deploy + restart only bot
#   ./scripts/deploy-remote.example.sh --sudo         # Use sudo for docker on remote
#   ./scripts/deploy-remote.example.sh --skip-commands
#   ./scripts/deploy-remote.example.sh --help
#
# Required:
#   - export SSHPASS='...'  (or create .env.deploy with SSHPASS='...')
# Optional overrides:
#   - DEPLOY_HOST='user@host'
#   - DEPLOY_PORT='2965'
#   - DEPLOY_PATH='~/elio-discord-bot'
#
# Notes:
#   - This script never prints SSHPASS.
#   - It excludes .env/.env.deploy from rsync. Configure remote .env separately.

set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

REBUILD=false
DEPLOY_DEV=false
DEPLOY_GLOBAL=false
SKIP_COMMANDS=false
SEED=false
BOT_ONLY=false
SYNC_MODE="full"     # full | bot
REMOTE_SUDO_MODE="auto" # auto | true | false

print_help() {
  cat <<'EOF'
Remote deploy (example)

Options:
  --build          Rebuild Docker images (bot + admin-web)
  --seed           Run `npm run seed:all` after startup
  --dev            Deploy guild (dev) slash commands
  --global         Deploy global slash commands
  --both           Deploy both dev + global commands
  --bot-only       Only restart the bot service (recommended for quick updates)
  --sync-full      Rsync the whole repo (default)
  --sync-bot       Rsync only bot-relevant files (faster / safer)
  --sudo           Force sudo for docker compose on remote
  --no-sudo        Force no sudo for docker compose on remote
  --skip-commands  Skip slash command deployment
  --help           Show help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --build)
      REBUILD=true
      shift
      ;;
    --seed)
      SEED=true
      shift
      ;;
    --dev)
      DEPLOY_DEV=true
      shift
      ;;
    --global)
      DEPLOY_GLOBAL=true
      shift
      ;;
    --both)
      DEPLOY_DEV=true
      DEPLOY_GLOBAL=true
      shift
      ;;
    --bot-only)
      BOT_ONLY=true
      SYNC_MODE="bot"
      shift
      ;;
    --sync-full)
      SYNC_MODE="full"
      shift
      ;;
    --sync-bot)
      SYNC_MODE="bot"
      shift
      ;;
    --sudo)
      REMOTE_SUDO_MODE="true"
      shift
      ;;
    --no-sudo)
      REMOTE_SUDO_MODE="false"
      shift
      ;;
    --skip-commands)
      SKIP_COMMANDS=true
      shift
      ;;
    --help|-h)
      print_help
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      print_help >&2
      exit 1
      ;;
  esac
done

if [[ -f "$PROJECT_ROOT/.env.deploy" ]]; then
  # shellcheck disable=SC1091
  source "$PROJECT_ROOT/.env.deploy"
  export SSHPASS DEPLOY_HOST DEPLOY_PORT DEPLOY_PATH DEPLOY_SUDO DEPLOY_SUDO_PASS
fi

if [[ -z "${SSHPASS:-}" ]]; then
  echo "Error: SSHPASS is not set." >&2
  echo "Set it via: export SSHPASS='...'" >&2
  echo "Or create: $PROJECT_ROOT/.env.deploy with SSHPASS='...'" >&2
  exit 1
fi

export SSHPASS

REMOTE_HOST="${DEPLOY_HOST:-neojustin@live.dothost.net}"
REMOTE_PORT="${DEPLOY_PORT:-2965}"
REMOTE_PATH="${DEPLOY_PATH:-~/elio-discord-bot}"

if [[ "${DEPLOY_SUDO:-}" == "true" && "$REMOTE_SUDO_MODE" == "auto" ]]; then
  REMOTE_SUDO_MODE="true"
fi

# By default, reuse SSHPASS for remote sudo. Override via DEPLOY_SUDO_PASS.
SUDO_PASS="${DEPLOY_SUDO_PASS:-$SSHPASS}"

echo "=== Deploying to ${REMOTE_HOST}:${REMOTE_PORT} (${REMOTE_PATH}) ==="

echo ""
echo "=== Step 1/4: Syncing files (rsync) ==="
RSH="ssh -o StrictHostKeyChecking=no -p $REMOTE_PORT"

RSYNC_EXCLUDES=(
  --exclude='node_modules'
  --exclude='.git'
  --exclude='dist'
  --exclude='logs'
  --exclude='__pycache__'
  --exclude='.pytest_cache'
  --exclude='*.pyc'
  --exclude='.env'
  --exclude='.env.deploy'
  --exclude='ai-service/.env'
  --exclude='ai-service/logs'
  --exclude='mongo_data'
  --exclude='backup'
  --exclude='models'            # prevent deleting/overwriting remote AI weights
  --exclude='ai-service/models' # same
)

if [[ "$SYNC_MODE" == "bot" ]]; then
  echo "[INFO] SYNC_MODE=bot (syncing src/ + scripts/ + core build files)"
  sshpass -e rsync -avz --delete \
    "${RSYNC_EXCLUDES[@]}" \
    -e "$RSH" \
    "$PROJECT_ROOT/src/" "$REMOTE_HOST:$REMOTE_PATH/src/"

  sshpass -e rsync -avz --delete \
    "${RSYNC_EXCLUDES[@]}" \
    -e "$RSH" \
    "$PROJECT_ROOT/scripts/" "$REMOTE_HOST:$REMOTE_PATH/scripts/"

  sshpass -e rsync -avz \
    -e "$RSH" \
    "$PROJECT_ROOT/package.json" "$PROJECT_ROOT/package-lock.json" "$PROJECT_ROOT/tsconfig.json" \
    "$PROJECT_ROOT/Dockerfile" "$PROJECT_ROOT/.dockerignore" "$PROJECT_ROOT/docker-compose.yml" \
    "$REMOTE_HOST:$REMOTE_PATH/"
else
  echo "[INFO] SYNC_MODE=full (syncing repo with safe excludes)"
  sshpass -e rsync -avz --delete \
    "${RSYNC_EXCLUDES[@]}" \
    -e "$RSH" \
    "$PROJECT_ROOT/" "$REMOTE_HOST:$REMOTE_PATH/"
fi

echo ""
echo "=== Step 2/4: Starting services ==="
sshpass -e ssh -T -p "$REMOTE_PORT" -o StrictHostKeyChecking=no "$REMOTE_HOST" <<REMOTE_SCRIPT
set -e
REMOTE_PATH_RAW="$REMOTE_PATH"
if [[ "\$REMOTE_PATH_RAW" == "~"* ]]; then
  REMOTE_PATH_EXPANDED="\${REMOTE_PATH_RAW/#\\~/\$HOME}"
else
  REMOTE_PATH_EXPANDED="\$REMOTE_PATH_RAW"
fi
cd "\$REMOTE_PATH_EXPANDED"

SUDO_MODE="$REMOTE_SUDO_MODE"
SUDO_PASS="$SUDO_PASS"

if [ "\$SUDO_MODE" = "auto" ]; then
  if docker info >/dev/null 2>&1; then
    SUDO_MODE="false"
  else
    SUDO_MODE="true"
  fi
fi

compose() {
  if [ "\$SUDO_MODE" = "true" ]; then
    if docker compose version >/dev/null 2>&1; then
      printf '%s\n' "\$SUDO_PASS" | sudo -S docker compose "\$@"
    else
      printf '%s\n' "\$SUDO_PASS" | sudo -S docker-compose "\$@"
    fi
    return
  fi

  if docker compose version >/dev/null 2>&1; then
    docker compose "\$@"
    return
  fi
  docker-compose "\$@"
}

echo "=== docker compose build ==="
if [ "$REBUILD" = "true" ]; then
  if [ "$BOT_ONLY" = "true" ]; then
    compose build bot
  else
    compose build bot admin-web
  fi
fi

if [ "$BOT_ONLY" = "true" ]; then
  echo "=== docker compose up (bot only) ==="
  compose up -d bot
  sleep 5
else
  echo "=== docker compose up (mongo) ==="
  compose up -d mongo
  sleep 10

  echo "=== docker compose up (bot + admin-web) ==="
  compose up -d bot admin-web
  sleep 5
fi

echo "=== Ensuring Mongo indexes ==="
compose exec -T bot npm run ensure-indexes

if [ "$SEED" = "true" ]; then
  echo "=== Seeding database ==="
  compose exec -T bot npm run seed:all
fi

echo "=== Service status ==="
compose ps
REMOTE_SCRIPT

if [[ "$SKIP_COMMANDS" = "false" ]]; then
  if [[ "$DEPLOY_DEV" = "true" || "$DEPLOY_GLOBAL" = "true" ]]; then
    echo ""
    echo "=== Step 3/4: Deploying slash commands ==="
    if [[ "$DEPLOY_DEV" = "true" ]]; then
      sshpass -e ssh -T -p "$REMOTE_PORT" -o StrictHostKeyChecking=no "$REMOTE_HOST" <<REMOTE_SCRIPT
set -e
REMOTE_PATH_RAW="$REMOTE_PATH"
if [[ "\$REMOTE_PATH_RAW" == "~"* ]]; then
  REMOTE_PATH_EXPANDED="\${REMOTE_PATH_RAW/#\\~/\$HOME}"
else
  REMOTE_PATH_EXPANDED="\$REMOTE_PATH_RAW"
fi
cd "\$REMOTE_PATH_EXPANDED"
SUDO_MODE="$REMOTE_SUDO_MODE"
SUDO_PASS="$SUDO_PASS"
if [ "\$SUDO_MODE" = "auto" ]; then
  if docker info >/dev/null 2>&1; then
    SUDO_MODE="false"
  else
    SUDO_MODE="true"
  fi
fi
compose() {
  if [ "\$SUDO_MODE" = "true" ]; then
    if docker compose version >/dev/null 2>&1; then
      printf '%s\n' "\$SUDO_PASS" | sudo -S docker compose "\$@"
    else
      printf '%s\n' "\$SUDO_PASS" | sudo -S docker-compose "\$@"
    fi
    return
  fi
  if docker compose version >/dev/null 2>&1; then
    docker compose "\$@"
    return
  fi
  docker-compose "\$@"
}
compose exec -T bot npm run deploy:dev
REMOTE_SCRIPT
    fi
    if [[ "$DEPLOY_GLOBAL" = "true" ]]; then
      sshpass -e ssh -T -p "$REMOTE_PORT" -o StrictHostKeyChecking=no "$REMOTE_HOST" <<REMOTE_SCRIPT
set -e
REMOTE_PATH_RAW="$REMOTE_PATH"
if [[ "\$REMOTE_PATH_RAW" == "~"* ]]; then
  REMOTE_PATH_EXPANDED="\${REMOTE_PATH_RAW/#\\~/\$HOME}"
else
  REMOTE_PATH_EXPANDED="\$REMOTE_PATH_RAW"
fi
cd "\$REMOTE_PATH_EXPANDED"
SUDO_MODE="$REMOTE_SUDO_MODE"
SUDO_PASS="$SUDO_PASS"
if [ "\$SUDO_MODE" = "auto" ]; then
  if docker info >/dev/null 2>&1; then
    SUDO_MODE="false"
  else
    SUDO_MODE="true"
  fi
fi
compose() {
  if [ "\$SUDO_MODE" = "true" ]; then
    if docker compose version >/dev/null 2>&1; then
      printf '%s\n' "\$SUDO_PASS" | sudo -S docker compose "\$@"
    else
      printf '%s\n' "\$SUDO_PASS" | sudo -S docker-compose "\$@"
    fi
    return
  fi
  if docker compose version >/dev/null 2>&1; then
    docker compose "\$@"
    return
  fi
  docker-compose "\$@"
}
compose exec -T bot npm run deploy:global
REMOTE_SCRIPT
    fi
  fi
fi

echo ""
echo "=== Step 4/4: Quick health checks ==="
sshpass -e ssh -T -p "$REMOTE_PORT" -o StrictHostKeyChecking=no "$REMOTE_HOST" <<REMOTE_SCRIPT
set -e
REMOTE_PATH_RAW="$REMOTE_PATH"
if [[ "\$REMOTE_PATH_RAW" == "~"* ]]; then
  REMOTE_PATH_EXPANDED="\${REMOTE_PATH_RAW/#\\~/\$HOME}"
else
  REMOTE_PATH_EXPANDED="\$REMOTE_PATH_RAW"
fi
cd "\$REMOTE_PATH_EXPANDED"

SUDO_MODE="$REMOTE_SUDO_MODE"
SUDO_PASS="$SUDO_PASS"
BOT_ONLY="$BOT_ONLY"

if [ "\$SUDO_MODE" = "auto" ]; then
  if docker info >/dev/null 2>&1; then
    SUDO_MODE="false"
  else
    SUDO_MODE="true"
  fi
fi

compose() {
  if [ "\$SUDO_MODE" = "true" ]; then
    if docker compose version >/dev/null 2>&1; then
      printf '%s\n' "\$SUDO_PASS" | sudo -S docker compose "\$@"
    else
      printf '%s\n' "\$SUDO_PASS" | sudo -S docker-compose "\$@"
    fi
    return
  fi

  if docker compose version >/dev/null 2>&1; then
    docker compose "\$@"
  else
    docker-compose "\$@"
  fi
}

echo "--- bot logs (tail 40) ---"
compose logs --tail=40 bot 2>&1 | tail -40

if [ "\$BOT_ONLY" != "true" ]; then
  echo "--- admin-web logs (tail 40) ---"
  compose logs --tail=40 admin-web 2>&1 | tail -40
fi
REMOTE_SCRIPT

echo ""
echo "=== Done ==="
