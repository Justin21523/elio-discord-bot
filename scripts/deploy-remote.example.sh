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

REMOTE_HOST="${DEPLOY_HOST:-neojustin@live.dothost.net}"
REMOTE_PORT="${DEPLOY_PORT:-2965}"
REMOTE_PATH="${DEPLOY_PATH:-~/elio-discord-bot}"

PROJECT_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

REBUILD=false
DEPLOY_DEV=false
DEPLOY_GLOBAL=false
SKIP_COMMANDS=false
SEED=false

print_help() {
  cat <<'EOF'
Remote deploy (example)

Options:
  --build          Rebuild Docker images (bot + admin-web)
  --seed           Run `npm run seed:all` after startup
  --dev            Deploy guild (dev) slash commands
  --global         Deploy global slash commands
  --both           Deploy both dev + global commands
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

if [[ -z "${SSHPASS:-}" ]]; then
  if [[ -f "$PROJECT_ROOT/.env.deploy" ]]; then
    # shellcheck disable=SC1091
    source "$PROJECT_ROOT/.env.deploy"
  fi
fi

if [[ -z "${SSHPASS:-}" ]]; then
  echo "Error: SSHPASS is not set." >&2
  echo "Set it via: export SSHPASS='...'" >&2
  echo "Or create: $PROJECT_ROOT/.env.deploy with SSHPASS='...'" >&2
  exit 1
fi

echo "=== Deploying to ${REMOTE_HOST}:${REMOTE_PORT} (${REMOTE_PATH}) ==="

echo ""
echo "=== Step 1/4: Syncing files (rsync) ==="
sshpass -e rsync -avz --delete \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='dist' \
  --exclude='logs' \
  --exclude='__pycache__' \
  --exclude='.pytest_cache' \
  --exclude='*.pyc' \
  --exclude='.env' \
  --exclude='.env.deploy' \
  --exclude='ai-service/.env' \
  --exclude='ai-service/logs' \
  --exclude='mongo_data' \
  --exclude='backup' \
  -e "ssh -o StrictHostKeyChecking=no -p $REMOTE_PORT" \
  "$PROJECT_ROOT/" "$REMOTE_HOST:$REMOTE_PATH/"

echo ""
echo "=== Step 2/4: Starting services (mongo + bot + admin-web) ==="
sshpass -e ssh -tt -p "$REMOTE_PORT" -o StrictHostKeyChecking=no "$REMOTE_HOST" <<REMOTE_SCRIPT
set -e
cd "$REMOTE_PATH"

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  else
    docker-compose "$@"
  fi
}

echo "=== docker-compose build ==="
if [ "$REBUILD" = "true" ]; then
  compose build bot admin-web
fi

echo "=== docker-compose up (mongo) ==="
compose up -d mongo
sleep 10

echo "=== docker-compose up (bot + admin-web) ==="
compose up -d bot admin-web
sleep 5

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
      sshpass -e ssh -tt -p "$REMOTE_PORT" -o StrictHostKeyChecking=no "$REMOTE_HOST" <<REMOTE_SCRIPT
set -e
cd "$REMOTE_PATH"
compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  else
    docker-compose "$@"
  fi
}
compose exec -T bot npm run deploy:dev
REMOTE_SCRIPT
    fi
    if [[ "$DEPLOY_GLOBAL" = "true" ]]; then
      sshpass -e ssh -tt -p "$REMOTE_PORT" -o StrictHostKeyChecking=no "$REMOTE_HOST" <<REMOTE_SCRIPT
set -e
cd "$REMOTE_PATH"
compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  else
    docker-compose "$@"
  fi
}
compose exec -T bot npm run deploy:global
REMOTE_SCRIPT
    fi
  fi
fi

echo ""
echo "=== Step 4/4: Quick health checks ==="
sshpass -e ssh -tt -p "$REMOTE_PORT" -o StrictHostKeyChecking=no "$REMOTE_HOST" <<'REMOTE_SCRIPT'
set -e
cd ~/elio-discord-bot

compose() {
  if docker compose version >/dev/null 2>&1; then
    docker compose "$@"
  else
    docker-compose "$@"
  fi
}

echo "--- bot logs (tail 40) ---"
compose logs --tail=40 bot 2>&1 | tail -40

echo "--- admin-web logs (tail 40) ---"
compose logs --tail=40 admin-web 2>&1 | tail -40
REMOTE_SCRIPT

echo ""
echo "=== Done ==="
