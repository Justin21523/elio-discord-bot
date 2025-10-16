# CUDA 12.8 runtime + Ubuntu 22.04 (Blackwell sm_120)
FROM nvidia/cuda:12.8.0-devel-ubuntu22.04

ARG DEBIAN_FRONTEND=noninteractive
ENV TZ=Etc/UTC

# ---- Base deps (Python3 + build tools) ----
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-dev python-is-python3 \
    build-essential git cmake ninja-build \
    libglib2.0-0 libgl1-mesa-glx \
    curl \
    && rm -rf /var/lib/apt/lists/*

# ---- HF cache & env knobs (speed + stability) ----
ENV PIP_NO_CACHE_DIR=1 \
    HF_HOME=/root/.cache/huggingface \
    SENTENCE_TRANSFORMERS_HOME=/root/.cache/huggingface/sentence-transformers \
    TOKENIZERS_PARALLELISM=false \
    HF_HUB_ENABLE_HF_TRANSFER=1 \
    PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:128

# ---- Torch stack (CUDA 12.8) ----
# Use the official CUDA 12.8 wheels channel to avoid mismatched CUDA.
RUN python -m pip install --upgrade pip && \
    python -m pip install --extra-index-url https://download.pytorch.org/whl/cu128 \
        torch==2.7.1+cu128 torchvision==0.22.1+cu128 torchaudio==2.7.1+cu128

# ---- Workdir ----
WORKDIR /app

# ---- Install Python deps (build context with ./ai-python) (excluding torch series) ----
COPY requirements.txt /app/requirements.txt
RUN python -m pip install -r /app/requirements.txt

# ---- Copy source (IMPORTANT: include core/rag/vlm) ----
# Layout inside container:
# /app/app        -> FastAPI app
# /app/core       -> core package

COPY app /app/app
COPY core /app/core

# ---- Expose & runtime env ----
ENV PYTHONPATH=/app
EXPOSE 8088

# ---- Healthcheck (now that curl is installed) ----
HEALTHCHECK CMD curl -sf http://localhost:8088/health >/dev/null || exit 1

# ---- Entrypoint ----
CMD ["python", "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8088"]