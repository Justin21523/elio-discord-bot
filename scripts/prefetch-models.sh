#!/usr/bin/env bash
# Prefetch LLM / VLM / Embeddings models into the hf-cache volume
# so the sidecar starts fast and no runtime downloads are needed.
# Works on macOS/Linux/WSL. Requires: docker, docker compose.
set -euo pipefail

ROOT_DIR="$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )/.."
cd "$ROOT_DIR"

# ---------- Helpers ----------
log() { printf "\033[1;36m[preload]\033[0m %s\n" "$*"; }
err() { printf "\033[1;31m[error]\033[0m %s\n" "$*" >&2; }

# Check docker
if ! command -v docker >/dev/null 2>&1; then
  err "docker not found. Install Docker first."
  exit 1
fi

# ---------- Read .env (only the keys we need) ----------
if [[ -f .env ]]; then
  # shellcheck disable=SC2046
  export $(grep -E '^(LLM_MODEL|VLM_MODEL|EMBEDDINGS_MODEL|ENABLE_CUDA)=' .env | sed 's/[[:space:]]//g')
else
  log ".env not found; you can pass models via env vars."
fi

LLM_MODEL="${LLM_MODEL:-Qwen/Qwen2.5-7B-Instruct}"
VLM_MODEL="${VLM_MODEL:-llava-hf/llava-1.6-mistral-7b-hf}"
EMBEDDINGS_MODEL="${EMBEDDINGS_MODEL:-BAAI/bge-m3}"

log "Models:"
log "  LLM_MODEL        = $LLM_MODEL"
log "  VLM_MODEL        = $VLM_MODEL"
log "  EMBEDDINGS_MODEL = $EMBEDDINGS_MODEL"

# ---------- Ensure ai-python image exists ----------
AI_IMAGE="communiverse-ai:1.1.0"
if ! docker image inspect "$AI_IMAGE" >/dev/null 2>&1; then
  log "AI image not found -> building ai-python via docker compose…"
  docker compose build ai-python
fi

# ---------- Resolve hf-cache volume ----------
# Prefer a compose-created volume that ends with *_hf-cache or *-hf-cache
PROJECT_NAME="${COMPOSE_PROJECT_NAME:-$(basename "$PWD")}"
VOLUME_CANDIDATES="$(docker volume ls --format '{{.Name}}' | grep -E 'hf[-_]cache' || true)"

if [[ -n "$VOLUME_CANDIDATES" ]]; then
  # pick one for current project if possible
  VOL="$(echo "$VOLUME_CANDIDATES" | grep -m1 -E "^${PROJECT_NAME}[_-]hf-cache$" || true)"
  [[ -z "$VOL" ]] && VOL="$(echo "$VOLUME_CANDIDATES" | head -n1)"
else
  VOL="${PROJECT_NAME}_hf-cache"
  log "Creating volume $VOL"
  docker volume create "$VOL" >/dev/null
fi
log "Using HF volume: $VOL"

# ---------- Prefetch ----------
log "Starting prefetch in a short-lived container (progress will stream below)…"
docker run --rm \
  -e HF_HOME=/root/.cache/huggingface \
  -e HF_HUB_ENABLE_HF_TRANSFER=1 \
  ${HF_TOKEN:+-e HF_TOKEN="$HF_TOKEN"} \
  -e LLM_MODEL="$LLM_MODEL" \
  -e VLM_MODEL="$VLM_MODEL" \
  -e EMBEDDINGS_MODEL="$EMBEDDINGS_MODEL" \
  -v "$VOL":/root/.cache/huggingface \
  "$AI_IMAGE" \
  bash -lc 'python - <<PY
import os, sys, subprocess, shlex
print("HF_HOME =", os.environ.get("HF_HOME"))

llm = os.environ["LLM_MODEL"]
vlm = os.environ["VLM_MODEL"]
emb = os.environ["EMBEDDINGS_MODEL"]

print("\\n[1/3] Download LLM:", llm)
from transformers import AutoTokenizer, AutoModelForCausalLM
AutoTokenizer.from_pretrained(llm, trust_remote_code=True)
AutoModelForCausalLM.from_pretrained(llm, trust_remote_code=True, device_map="meta", low_cpu_mem_usage=True)

print("\\n[2/3] Download VLM:", vlm)
# Some VLMs use special classes; we only prefetch artifacts here.
from transformers import AutoProcessor, AutoModel
try:
    AutoProcessor.from_pretrained(vlm, trust_remote_code=True)
except Exception as e:
    print("  Processor note:", e, file=sys.stderr)
try:
    AutoModel.from_pretrained(vlm, trust_remote_code=True, device_map="meta", low_cpu_mem_usage=True)
except Exception as e:
    print("  Model note:", e, file=sys.stderr)

print("\\n[3/3] Download Embeddings:", emb)
from sentence_transformers import SentenceTransformer
SentenceTransformer(emb, device="cpu")

print("\\nCache usage:")
subprocess.run(shlex.split("du -sh /root/.cache/huggingface"), check=False)
print("Prefetch completed.")
PY'

# ---------- Show final size ----------
SIZE=$(docker run --rm -v "$VOL":/root/.cache/huggingface alpine sh -lc "du -sh /root/.cache/huggingface | cut -f1")
log "Done. HF cache size: ${SIZE:-unknown}"

cat <<'TXT'

Next steps:
  1) docker compose up -d --build
  2) docker compose ps
  3) curl -fsS http://localhost:8088/health | jq .
  4) docker compose exec bot node scripts/deploy-commands.js

TXT
