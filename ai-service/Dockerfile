# ============================================================================
# Elioverse Bot AI Service - Dockerfile
# GPU: NVIDIA GeForce RTX 5080
# CUDA: 12.8
# Compute Capability: sm120
# ============================================================================

# Use NVIDIA CUDA 12.8 base image with cuDNN (compatible with RTX 5080)
# CUDA 12.8 matches PyTorch cu128 build and RTX 5080 sm_120 architecture
FROM nvidia/cuda:12.8.0-cudnn-runtime-ubuntu22.04

# Set non-interactive installation
ENV DEBIAN_FRONTEND=noninteractive

# Install Python 3.10+ and system dependencies
RUN apt-get update && apt-get install -y \
    python3.10 \
    python3-pip \
    python3-dev \
    git \
    wget \
    curl \
    build-essential \
    libssl-dev \
    libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# Upgrade pip
RUN pip3 install --upgrade pip setuptools wheel

# Set working directory
WORKDIR /app

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
# PyTorch with CUDA 12.8 support will be installed from requirements.txt
RUN pip3 install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/
COPY scripts/ ./scripts/

# Expose ports
EXPOSE 8000 9091

# Set environment variables
ENV PYTHONUNBUFFERED=1
ENV PYTHONDONTWRITEBYTECODE=1

# GPU-specific environment variables
ENV CUDA_VISIBLE_DEVICES=0
ENV PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:512
ENV TORCH_DTYPE=float16

# Shared warehouse paths (will be mounted as volumes)
ENV MODEL_CACHE_DIR=/mnt/ai_warehouse/models
ENV HF_HOME=/mnt/ai_warehouse/models/huggingface
ENV TRANSFORMERS_CACHE=/mnt/ai_warehouse/models/transformers
ENV SENTENCE_TRANSFORMERS_HOME=/mnt/ai_warehouse/models/sentence-transformers
ENV DATASET_CACHE_DIR=/mnt/ai_warehouse/datasets
ENV HF_DATASETS_CACHE=/mnt/ai_warehouse/datasets/huggingface

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=120s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# Run the application
CMD ["python3", "-m", "uvicorn", "app.app:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]