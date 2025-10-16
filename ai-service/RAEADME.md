# Communiverse AI Service 🧠

Production-ready AI microservice for the Communiverse Discord bot, providing LLM, VLM, and embedding capabilities using open-source models.

## Features

- 🤖 **LLM Support**: DeepSeek, Llama-3.x, Qwen-2.5, Mistral
- 👁️ **Vision Models**: Qwen-VL, LLaVA-Next for image understanding
- 📊 **Embeddings**: bge-m3, gte-large-zh-en, e5-large-v2 for RAG
- 🚀 **Optimized Performance**: 8-bit/4-bit quantization, GPU acceleration
- 📈 **Observability**: Prometheus metrics, structured logging
- 🐳 **Docker Ready**: Containerized with GPU support

## Quick Start

### Prerequisites

- Python 3.10+
- CUDA 12.1+ (for GPU acceleration)
- Docker & Docker Compose (optional)
- 16GB+ RAM, 8GB+ VRAM recommended

### Installation
```bash
# Clone and setup
cd ai-service
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your settings

# Run the service
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### Docker Deployment
```bash
# Build and run with Docker Compose
docker-compose up -d --build

# View logs
docker-compose logs -f ai-service

# Stop service
docker-compose down
```

## API Documentation

Once running, visit:
- **Swagger UI**: http://localhost:8000/docs
- **ReDoc**: http://localhost:8000/redoc
- **Metrics**: http://localhost:8000/metrics

### Example Requests

#### Text Generation
```bash
curl -X POST http://localhost:8000/v1/generate \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek",
    "prompt": "Explain quantum computing in simple terms",
    "max_tokens": 512,
    "temperature": 0.7
  }'
```

#### Image Description
```bash
curl -X POST http://localhost:8000/v1/vision/describe \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen-vl",
    "image_url": "https://example.com/image.jpg",
    "prompt": "Describe this image"
  }'
```

#### Embeddings
```bash
curl -X POST http://localhost:8000/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{
    "model": "bge-m3",
    "texts": ["Hello world", "Machine learning"]
  }'
```

## Model Configuration

### Supported Models

| Type  | Model               | Alias        | Size |
| ----- | ------------------- | ------------ | ---- |
| LLM   | DeepSeek-7B-Chat    | `deepseek`   | 7B   |
| LLM   | Llama-3-8B-Instruct | `llama3`     | 8B   |
| LLM   | Qwen2.5-7B-Instruct | `qwen25`     | 7B   |
| LLM   | Mistral-7B-Instruct | `mistral`    | 7B   |
| VLM   | Qwen-VL-Chat        | `qwen-vl`    | ~10B |
| VLM   | LLaVA-Next          | `llava-next` | 7B   |
| Embed | BGE-M3              | `bge-m3`     | 567M |

### Memory Requirements

- **8-bit quantization**: ~4-5GB VRAM per 7B model
- **4-bit quantization**: ~2-3GB VRAM per 7B model
- **FP16**: ~14GB VRAM per 7B model

## Performance Optimization

### GPU Acceleration
```python
# In .env
DEVICE=cuda
USE_8BIT=true  # Recommended for 8GB VRAM
USE_4BIT=false # Use for 4-6GB VRAM
```

### Model Caching

Models are cached in `MODEL_CACHE_DIR` after first load:
```bash
# Pre-download models
python -c "from transformers import AutoModel; AutoModel.from_pretrained('deepseek-ai/deepseek-llm-7b-chat')"
```

## Monitoring

### Health Check
```bash
curl http://localhost:8000/health
```

### Prometheus Metrics
```bash
curl http://localhost:8000/metrics
```

Key metrics:
- `ai_requests_total` - Total requests
- `ai_request_duration_seconds` - Request latency
- `ai_tokens_generated_total` - Tokens generated
- `ai_model_load_duration_seconds` - Model load time
- `ai_errors_total` - Error count

## Troubleshooting

### Out of Memory
- Enable 8-bit quantization: `USE_8BIT=true`
- Enable 4-bit quantization: `USE_4BIT=true`
- Reduce `MAX_TOKENS` and `MAX_BATCH_SIZE`

### Slow Generation
- Ensure CUDA is properly configured
- Check GPU utilization: `nvidia-smi`
- Consider smaller models or quantization

### Model Download Issues
- Set `HF_ENDPOINT=https://hf-mirror.com` for Chinese users
- Pre-download models manually

## Development
```bash
# Install dev dependencies
pip install -r requirements.txt

# Run with auto-reload
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# Run tests (TODO)
pytest tests/
```

## License

MIT License - See LICENSE file for details