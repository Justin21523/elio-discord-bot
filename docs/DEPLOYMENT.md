# Elioverse Bot - Docker Deployment Guide

Complete guide for deploying Elioverse Bot with Docker, Docker Compose, and GPU support.

---

## Table of Contents

1. [System Requirements](#system-requirements)
2. [Prerequisites](#prerequisites)
3. [Environment Setup](#environment-setup)
4. [Docker Configuration](#docker-configuration)
5. [Building and Running](#building-and-running)
6. [Verification](#verification)
7. [Troubleshooting](#troubleshooting)
8. [Maintenance](#maintenance)

---

## System Requirements

### Hardware Requirements

- **GPU**: NVIDIA GeForce RTX 5080 (or compatible CUDA-capable GPU)
- **CUDA**: Version 12.8
- **Compute Capability**: sm120 (RTX 5080)
- **RAM**: Minimum 16GB, Recommended 32GB+
- **Storage**: Minimum 100GB free space for models and datasets
- **Disk**: SSD recommended for model loading performance

### Software Requirements

- **OS**: Windows 10/11 with WSL2, Linux (Ubuntu 22.04+ recommended), or macOS with Docker Desktop
- **Docker**: Version 20.10+
- **Docker Compose**: Version 2.0+
- **NVIDIA Container Toolkit**: For GPU access in Docker
- **NVIDIA Driver**: Version 525.60.11+ (for CUDA 12.8)

---

## Prerequisites

### 1. Install Docker and Docker Compose

#### Windows (WSL2)

```bash
# Update WSL2
wsl --update

# Install Docker Desktop for Windows
# Download from: https://www.docker.com/products/docker-desktop

# Verify installation
docker --version
docker compose version
```

#### Linux (Ubuntu)

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo apt-get update
sudo apt-get install docker-compose-plugin

# Add user to docker group
sudo usermod -aG docker $USER
newgrp docker

# Verify installation
docker --version
docker compose version
```

### 2. Install NVIDIA Container Toolkit

This is **critical** for GPU access in Docker containers.

#### Linux

```bash
# Add NVIDIA package repositories
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | \
  sudo tee /etc/apt/sources.list.d/nvidia-docker.list

# Install nvidia-container-toolkit
sudo apt-get update
sudo apt-get install -y nvidia-container-toolkit

# Restart Docker
sudo systemctl restart docker

# Verify GPU access
docker run --rm --gpus all nvidia/cuda:12.8.0-base-ubuntu22.04 nvidia-smi
```

#### Windows (WSL2)

```bash
# NVIDIA Container Toolkit is included with Docker Desktop
# Enable GPU support in Docker Desktop settings:
# Settings -> Resources -> WSL Integration -> Enable GPU

# Verify GPU access
docker run --rm --gpus all nvidia/cuda:12.8.0-base-ubuntu22.04 nvidia-smi
```

### 3. Verify NVIDIA Driver and CUDA

```bash
# Check NVIDIA driver version
nvidia-smi

# Expected output should show:
# - Driver Version: 525.60.11 or higher
# - CUDA Version: 12.8 or compatible
# - GPU: GeForce RTX 5080
```

### 4. Create Shared AI Warehouse Directory

```bash
# Create warehouse directory structure
mkdir -p /mnt/c/AI_LLM_projects/ai_warehouse/{models,datasets,vector_db,bm25_index,stories,fine_tuned_models,training_data,checkpoints,logs}

# Set permissions (Linux)
chmod -R 755 /mnt/c/AI_LLM_projects/ai_warehouse

# Verify directory structure
ls -la /mnt/c/AI_LLM_projects/ai_warehouse/
```

**Directory Structure**:
```
ai_warehouse/
├── models/              # Model cache (HuggingFace, transformers, etc.)
├── datasets/            # Dataset cache
├── vector_db/           # Vector database files
├── bm25_index/          # BM25 search indexes
├── stories/             # Story generation storage
├── fine_tuned_models/   # Fine-tuned model outputs
├── training_data/       # Training datasets
├── checkpoints/         # Training checkpoints
└── logs/                # Service logs
```

---

## Environment Setup

### 1. Configure Discord Bot Environment

Copy and configure the Discord Bot environment variables:

```bash
# Copy example file
cp .env.example .env

# Edit .env file
nano .env  # or use your preferred editor
```

**Required variables**:
```env
# Discord Configuration
DISCORD_TOKEN=your_actual_bot_token_here
APP_ID=your_actual_app_id_here
GUILD_ID_DEV=your_dev_guild_id_here

# Database Configuration
MONGODB_URI=mongodb://localhost:27017
DB_NAME=communiverse_bot

# Shared Warehouse
AI_WAREHOUSE_ROOT=/mnt/c/AI_LLM_projects/ai_warehouse

# AI Configuration
AI_ENABLED=true
AI_MODEL_TEXT=deepseek
AI_MODEL_VLM=qwen-vl
EMBEDDINGS_MODEL=bge-m3

# AI Service Connection
AI_SERVICE_URL=http://localhost:8000
AI_SERVICE_TIMEOUT_MS=60000
```

### 2. Configure Python AI Service Environment

```bash
# Copy example file
cp ai-service/.env.example ai-service/.env

# Edit ai-service/.env file
nano ai-service/.env
```

**Key configurations to verify**:

```env
# Service Configuration
HOST=0.0.0.0
PORT=8000
LOG_LEVEL=info

# Models (verify these match your needs)
LLM_MODEL=deepseek
VLM_MODEL=qwen-vl
EMBED_MODEL=bge-m3

# Warehouse Paths (should match docker-compose volume mounts)
MODEL_CACHE_DIR=/mnt/c/AI_LLM_projects/ai_warehouse/models
HF_HOME=/mnt/c/AI_LLM_projects/ai_warehouse/models/huggingface
TRANSFORMERS_CACHE=/mnt/c/AI_LLM_projects/ai_warehouse/models/transformers
VECTOR_DB_PATH=/mnt/c/AI_LLM_projects/ai_warehouse/vector_db
FINETUNE_OUTPUT_DIR=/mnt/c/AI_LLM_projects/ai_warehouse/fine_tuned_models

# MongoDB (will be overridden by docker-compose)
MONGODB_URI=mongodb://localhost:27017
MONGODB_DB=communiverse_bot

# Web Search (optional)
WEB_SEARCH_ENABLED=true
WEB_SEARCH_API_KEY=your_brave_api_key_here
```

### 3. Verify Environment Variable Consistency

Run this verification script:

```bash
# Create verification script
cat > verify_env.sh << 'EOF'
#!/bin/bash

echo "Verifying environment configuration..."
echo ""

# Check warehouse directory
if [ -d "/mnt/c/AI_LLM_projects/ai_warehouse" ]; then
  echo "✅ Warehouse directory exists"
else
  echo "❌ Warehouse directory not found"
  exit 1
fi

# Check .env files
if [ -f ".env" ]; then
  echo "✅ Bot .env exists"
else
  echo "❌ Bot .env not found"
  exit 1
fi

if [ -f "ai-service/.env" ]; then
  echo "✅ AI Service .env exists"
else
  echo "❌ AI Service .env not found"
  exit 1
fi

# Check critical variables
if grep -q "DISCORD_TOKEN=your_" .env; then
  echo "⚠️  Warning: Update DISCORD_TOKEN in .env"
fi

if grep -q "AI_WAREHOUSE_ROOT=/mnt/c/AI_LLM_projects/ai_warehouse" .env; then
  echo "✅ Bot warehouse path configured"
else
  echo "⚠️  Warning: Bot warehouse path may not be configured"
fi

echo ""
echo "Environment verification complete!"
EOF

chmod +x verify_env.sh
./verify_env.sh
```

---

## Docker Configuration

### 1. Verify docker-compose.yml

The docker-compose.yml file is already configured for:
- ✅ MongoDB with authentication
- ✅ Python AI Service with GPU support (RTX 5080, CUDA 12.8)
- ✅ Discord Bot service
- ✅ Shared warehouse volume mount
- ✅ Health checks for all services
- ✅ Service dependency management

**Key configurations**:

```yaml
ai-service:
  # GPU access
  deploy:
    resources:
      reservations:
        devices:
          - driver: nvidia
            count: 1
            capabilities: [gpu]

  # Volume mounts
  volumes:
    - /mnt/c/AI_LLM_projects/ai_warehouse:/mnt/ai_warehouse
```

### 2. Verify Dockerfile (ai-service)

The Dockerfile is configured for:
- ✅ CUDA 12.8 base image
- ✅ PyTorch 2.7.1+cu128
- ✅ All required Python dependencies
- ✅ Warehouse path environment variables
- ✅ GPU-specific configurations

---

## Building and Running

### 1. Build Docker Images

```bash
# Build all services
docker compose build

# Or build specific service
docker compose build ai-service
docker compose build bot
```

**Expected output**:
- Building progress for each service
- PyTorch CUDA 12.8 installation
- All dependencies installed successfully

**Note**: First build may take 10-30 minutes depending on internet speed.

### 2. Start Services

```bash
# Start all services in detached mode
docker compose up -d

# Or start with logs visible
docker compose up

# Or start specific services
docker compose up -d mongo ai-service
```

**Startup sequence**:
1. MongoDB starts first (20-30 seconds)
2. AI Service starts and loads models (2-5 minutes first time)
3. Discord Bot starts and connects (10-20 seconds)

### 3. Monitor Startup Progress

```bash
# Watch all logs
docker compose logs -f

# Watch specific service
docker compose logs -f ai-service
docker compose logs -f bot

# Check service status
docker compose ps
```

**Expected output**:
```
NAME                    STATUS          PORTS
elioverse-bot-mongo-1   Up (healthy)    0.0.0.0:27017->27017/tcp
elioverse-bot-ai-1      Up (healthy)    0.0.0.0:8000->8000/tcp, 0.0.0.0:9091->9091/tcp
elioverse-bot-bot-1     Up (healthy)
```

---

## Verification

### 1. Verify GPU Access in AI Service

```bash
# Check if GPU is detected
docker compose exec ai-service python3 -c "import torch; print(f'CUDA available: {torch.cuda.is_available()}'); print(f'GPU: {torch.cuda.get_device_name(0) if torch.cuda.is_available() else \"None\"}')"
```

**Expected output**:
```
CUDA available: True
GPU: NVIDIA GeForce RTX 5080
```

### 2. Verify AI Service Health

```bash
# Health check endpoint
curl http://localhost:8000/health

# Or from inside container
docker compose exec ai-service curl http://localhost:8000/health
```

**Expected response**:
```json
{
  "status": "healthy",
  "service": "communiverse-ai-service",
  "version": "2.0.0",
  "cuda_available": true,
  "gpu_name": "NVIDIA GeForce RTX 5080"
}
```

### 3. Verify Model Loading

```bash
# Check AI service logs for model loading
docker compose logs ai-service | grep -i "model"

# Or check warehouse directory
ls -lh /mnt/c/AI_LLM_projects/ai_warehouse/models/
```

**Expected**: Models should be downloaded to warehouse directory.

### 4. Run Integration Tests

```bash
# Copy test file to ai-service container
docker compose exec ai-service python3 /app/test_integration.py

# Or from host (if ai-service is accessible)
node test-ai-services.js
```

### 5. Verify Discord Bot Connection

Check bot logs for successful connection:

```bash
docker compose logs bot | grep -i "logged in"
```

**Expected output**:
```
Logged in as YourBotName#1234
Ready! Serving X guilds
```

### 6. Test Bot Commands

In Discord, try these commands:
```
/ping              - Check bot responsiveness
/help              - View available commands
/ai ask "test"     - Test AI integration
/story generate    - Test story generation
```

---

## Troubleshooting

### Common Issues

#### 1. GPU Not Detected

**Problem**: AI service can't access GPU

**Solutions**:
```bash
# Verify NVIDIA Container Toolkit
docker run --rm --gpus all nvidia/cuda:12.8.0-base-ubuntu22.04 nvidia-smi

# Check Docker GPU support
docker info | grep -i nvidia

# Restart Docker
sudo systemctl restart docker  # Linux
# or restart Docker Desktop  # Windows

# Rebuild ai-service
docker compose build --no-cache ai-service
docker compose up -d ai-service
```

#### 2. Out of Memory Errors

**Problem**: CUDA out of memory

**Solutions**:

1. Reduce batch size in ai-service/.env:
```env
MAX_BATCH_SIZE=4  # or lower
PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:256
```

2. Enable 8-bit quantization:
```env
USE_8BIT=true
```

3. Restart service:
```bash
docker compose restart ai-service
```

#### 3. Model Loading Timeout

**Problem**: Models take too long to load

**Solutions**:

1. Increase health check timeout in docker-compose.yml:
```yaml
ai-service:
  healthcheck:
    start_period: 300s  # 5 minutes
```

2. Pre-download models before starting:
```bash
# Download models manually
docker compose run --rm ai-service python3 -c "
from transformers import AutoModel, AutoTokenizer
AutoModel.from_pretrained('deepseek-ai/deepseek-llm-7b-chat')
AutoTokenizer.from_pretrained('deepseek-ai/deepseek-llm-7b-chat')
"
```

#### 4. MongoDB Connection Issues

**Problem**: Services can't connect to MongoDB

**Solutions**:

1. Check MongoDB status:
```bash
docker compose ps mongo
docker compose logs mongo
```

2. Verify authentication:
```bash
docker compose exec mongo mongosh -u dev -p devpass --authenticationDatabase admin
```

3. Reset MongoDB:
```bash
docker compose down mongo
docker volume rm elioverse-bot_mongo_data
docker compose up -d mongo
```

#### 5. AI Service HTTP Errors

**Problem**: Bot can't connect to AI service

**Solutions**:

1. Check AI service logs:
```bash
docker compose logs ai-service | tail -100
```

2. Verify network connectivity:
```bash
docker compose exec bot ping ai-service
docker compose exec bot curl http://ai-service:8000/health
```

3. Check AI_SERVICE_URL in bot .env:
```env
AI_SERVICE_URL=http://ai-service:8000  # Use service name, not localhost
```

#### 6. Volume Mount Issues (Windows WSL2)

**Problem**: Warehouse directory not accessible

**Solutions**:

1. Verify WSL2 path:
```bash
# In WSL2
cd /mnt/c/AI_LLM_projects/ai_warehouse
ls -la

# Check permissions
sudo chmod -R 755 /mnt/c/AI_LLM_projects/ai_warehouse
```

2. Update docker-compose.yml with Windows path if needed:
```yaml
volumes:
  - C:\AI_LLM_projects\ai_warehouse:/mnt/ai_warehouse
```

#### 7. PyTorch CUDA Version Mismatch

**Problem**: CUDA version incompatibility

**Solution**:

Verify requirements.txt has correct versions:
```
--extra-index-url https://download.pytorch.org/whl/cu128
torch==2.7.1+cu128
torchvision==0.22.1+cu128
torchaudio==2.7.1+cu128
```

Rebuild:
```bash
docker compose build --no-cache ai-service
```

---

## Maintenance

### Daily Operations

#### View Logs

```bash
# All services
docker compose logs -f

# Specific service with tail
docker compose logs -f --tail=100 ai-service

# Save logs to file
docker compose logs > deployment-logs-$(date +%Y%m%d).log
```

#### Restart Services

```bash
# Restart all
docker compose restart

# Restart specific service
docker compose restart ai-service
docker compose restart bot
```

#### Update Services

```bash
# Pull latest code
git pull

# Rebuild and restart
docker compose build --no-cache
docker compose up -d
```

### Resource Monitoring

#### Check GPU Usage

```bash
# From host
nvidia-smi

# From ai-service container
docker compose exec ai-service nvidia-smi

# Watch GPU usage (updates every 1s)
watch -n 1 nvidia-smi
```

#### Check Container Resource Usage

```bash
# All containers
docker stats

# Specific container
docker stats elioverse-bot-ai-service-1
```

#### Check Disk Usage

```bash
# Warehouse directory
du -sh /mnt/c/AI_LLM_projects/ai_warehouse/*

# Docker volumes
docker system df

# Container logs size
docker compose ps -q | xargs docker inspect --format='{{.LogPath}}' | xargs du -h
```

### Backup and Restore

#### Backup MongoDB

```bash
# Create backup
docker compose exec mongo mongodump --username dev --password devpass --authenticationDatabase admin --out /data/backup

# Copy backup to host
docker cp elioverse-bot-mongo-1:/data/backup ./mongodb-backup-$(date +%Y%m%d)
```

#### Backup Models and Data

```bash
# Backup warehouse (WARNING: Large size)
tar -czf ai_warehouse_backup_$(date +%Y%m%d).tar.gz /mnt/c/AI_LLM_projects/ai_warehouse/

# Or rsync to backup location
rsync -av --progress /mnt/c/AI_LLM_projects/ai_warehouse/ /backup/location/
```

#### Restore MongoDB

```bash
# Copy backup to container
docker cp ./mongodb-backup-20250116 elioverse-bot-mongo-1:/data/restore

# Restore
docker compose exec mongo mongorestore --username dev --password devpass --authenticationDatabase admin /data/restore
```

### Cleaning Up

#### Remove Stopped Containers

```bash
docker compose down
```

#### Remove All Data (CAUTION)

```bash
# Stop and remove containers, networks, volumes
docker compose down -v

# Remove warehouse data (CAUTION: This deletes all models!)
# rm -rf /mnt/c/AI_LLM_projects/ai_warehouse/*
```

#### Clean Docker System

```bash
# Remove unused images
docker image prune -a

# Remove build cache
docker builder prune

# Complete cleanup
docker system prune -a --volumes
```

---

## Performance Optimization

### 1. Model Preloading

Enable model preloading in ai-service/.env:
```env
PRELOAD_LLM=true
PRELOAD_VLM=false  # Set true if you use VLM frequently
PRELOAD_EMBEDDINGS=true
```

### 2. Quantization

Use 8-bit quantization to reduce memory:
```env
USE_8BIT=true
USE_4BIT=false  # Even more memory savings, slight quality trade-off
```

### 3. Batch Processing

Optimize batch sizes:
```env
MAX_BATCH_SIZE=8  # Adjust based on GPU memory
BATCH_TIMEOUT_SECONDS=5
```

### 4. Flash Attention

Enable Flash Attention if supported:
```env
MODEL_USE_FLASH_ATTENTION=true
```

---

## Security Considerations

### 1. Environment Variables

- ✅ Never commit `.env` files to git
- ✅ Use strong MongoDB passwords in production
- ✅ Rotate Discord bot token regularly
- ✅ Keep Brave API key secure

### 2. Network Security

```yaml
# Limit MongoDB port exposure in docker-compose.yml
mongo:
  ports:
    - "127.0.0.1:27017:27017"  # Only localhost access
```

### 3. Update Dependencies

```bash
# Check for security updates
docker compose pull
docker compose build --no-cache
```

---

## Production Deployment Checklist

Before deploying to production:

- [ ] Update all placeholder values in `.env` files
- [ ] Set strong MongoDB credentials
- [ ] Configure proper logging (`LOG_LEVEL=info` or `warn`)
- [ ] Enable HTTPS/TLS for external connections
- [ ] Set up monitoring and alerting
- [ ] Configure backup schedules
- [ ] Test failure scenarios
- [ ] Document recovery procedures
- [ ] Set resource limits in docker-compose.yml
- [ ] Enable rate limiting
- [ ] Configure log rotation
- [ ] Set up health check monitoring
- [ ] Test GPU failover scenarios

---

## Additional Resources

### Documentation

- **AI Services Guide**: `AI_SERVICES_GUIDE.md`
- **Quick Start Guide**: `QUICKSTART_AI.md`
- **Integration Report**: `INTEGRATION_COMPLETE.md`
- **Main README**: `README.md`

### External Resources

- **Docker Documentation**: https://docs.docker.com/
- **NVIDIA Container Toolkit**: https://github.com/NVIDIA/nvidia-docker
- **PyTorch CUDA**: https://pytorch.org/get-started/locally/
- **Discord.js Guide**: https://discordjs.guide/

### Support

- Check logs first: `docker compose logs -f`
- Review troubleshooting section above
- Check GitHub issues
- Consult documentation files

---

## Conclusion

You should now have a fully functional Elioverse Bot deployment with:
- ✅ GPU-accelerated AI service (RTX 5080, CUDA 12.8)
- ✅ Discord Bot with all commands
- ✅ MongoDB database
- ✅ Shared model warehouse
- ✅ Complete monitoring and logging
- ✅ Production-ready configuration

**Next Steps**:
1. Test all Discord commands
2. Run integration test suite: `node test-ai-services.js`
3. Monitor GPU usage and performance
4. Fine-tune configuration based on usage patterns

Happy deploying! 🚀
