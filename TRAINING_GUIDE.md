# 🚀 Complete Training Execution Guide

## 📋 Status Summary

✅ **Data Generation Complete**
- 1,185 training examples generated
- 15 characters from Elio film
- All based on actual film content from RAG resources
- Cost: $0.19 total

✅ **Training Strategy Decided**
- Using Chat model + character data (best approach)
- Base model: `deepseek-llm-7b-chat`
- Avoids catastrophic forgetting
- Estimated training time: 2-3 hours

---

## 🎯 Quick Start (Recommended)

### Step 1: Copy Dataset to Container

```bash
# Copy the complete merged dataset
docker cp data/training-datasets/complete_elio_film_dataset.jsonl \
  elioverse-bot-ai-service-1:/app/data/training-datasets/

# Verify copy
docker exec elioverse-bot-ai-service-1 wc -l /app/data/training-datasets/complete_elio_film_dataset.jsonl
# Should show: 1185
```

### Step 2: Copy Training Script

```bash
# Copy the training script
docker cp ai-service/scripts/train_all_characters_chat.sh \
  elioverse-bot-ai-service-1:/app/scripts/

# Make executable
docker exec elioverse-bot-ai-service-1 chmod +x /app/scripts/train_all_characters_chat.sh
```

### Step 3: Check GPU Availability

```bash
# Check if GPU is accessible
docker exec elioverse-bot-ai-service-1 nvidia-smi

# Check CUDA in Python
docker exec elioverse-bot-ai-service-1 python3 -c "import torch; print('CUDA available:', torch.cuda.is_available()); print('GPU count:', torch.cuda.device_count())"
```

Expected output:
```
CUDA available: True
GPU count: 1
```

### Step 4: Start Training

```bash
# Interactive mode (recommended for first time)
docker exec -it elioverse-bot-ai-service-1 bash /app/scripts/train_all_characters_chat.sh

# Or background mode (can check logs later)
docker exec elioverse-bot-ai-service-1 bash /app/scripts/train_all_characters_chat.sh > training.log 2>&1 &

# Monitor progress (if running in background)
docker exec elioverse-bot-ai-service-1 tail -f /app/scripts/training.log
```

### Step 5: Monitor Training

Training will show progress like:
```
Epoch 1/3
Step 10/445 | Loss: 2.456 | LR: 1.8e-4
Step 20/445 | Loss: 2.123 | LR: 1.6e-4
...
Epoch 1 completed | Train Loss: 1.89 | Eval Loss: 1.92

Epoch 2/3
...
```

Expected timeline:
- **Epoch 1**: 40-50 minutes
- **Epoch 2**: 40-50 minutes
- **Epoch 3**: 40-50 minutes
- **Total**: 2-3 hours

---

## 📊 Dataset Breakdown

```
Total Examples: 1,185

Character Distribution:
├── Elio Solis: 268 (23%)
├── Glordon: 150 (13%)
├── Olga Solis: 149 (13%)
├── Lord Grigon: 100 (8%)
├── Ambassador Questa: 100 (8%)
├── Gunther Melmac: 60 (5%)
├── Bryce Markwell: 60 (5%)
├── Ooooo: 60 (5%)
├── Ambassador Helix: 60 (5%)
├── Caleb: 30 (3%)
├── Ambassador Tegmen: 30 (3%)
├── Ambassador Turais: 29 (2%)
├── Ambassador Naos: 30 (3%)
├── Ambassador Auva: 30 (3%)
└── Ambassador Mira: 30 (3%)
```

---

## ⚙️ Training Configuration Explained

```python
{
  "base_model": "deepseek-ai/deepseek-llm-7b-chat",
  # ↑ Chat model already knows how to converse

  "lora_r": 16,
  "lora_alpha": 32,
  # ↑ LoRA parameters for efficient fine-tuning

  "batch_size": 2,
  "gradient_accumulation": 8,
  # ↑ Effective batch size = 2 × 8 = 16

  "learning_rate": 2e-4,
  # ↑ Moderate LR for adapting to characters

  "num_epochs": 3,
  # ↑ 3 passes through all 1,185 examples

  "max_length": 1024,
  # ↑ Maximum conversation length

  "use_4bit": true
  # ↑ 4-bit quantization saves GPU memory
}
```

**Why these parameters?**
- **Chat base model**: Already has conversation ability
- **LoRA**: Memory-efficient, trains only 0.5% of parameters
- **Learning rate 2e-4**: High enough to learn characters, low enough to preserve base knowledge
- **3 epochs**: Enough to learn patterns, not too many to overfit

---

## 🧪 Testing After Training

### Test Individual Characters

```bash
# Test Glordon
docker exec elioverse-bot-ai-service-1 python3 /app/scripts/test_persona.py \
  --model /app/models/elio_all_characters_chat \
  --persona "Glordon" \
  --prompt "Tell me about your friendship with Elio"

# Test Lord Grigon
docker exec elioverse-bot-ai-service-1 python3 /app/scripts/test_persona.py \
  --model /app/models/elio_all_characters_chat \
  --persona "Lord Grigon" \
  --prompt "What do you think of the Communiverse?"
```

### Expected Outputs

**Glordon** should respond:
```
*wiggles happily* Elio is my best friend! He's the first person who ever
understood me and didn't expect me to be a warrior like my father. We're
both kind of... different, you know? But that's what makes us special!
```

**Lord Grigon** should respond:
```
*growls* The Communiverse denied me membership despite my superior technology!
But I have learned... my son Glordon taught me that strength isn't just about
conquest. Though I still believe in Hylurgian honor!
```

---

## 🔧 Troubleshooting

### Problem 1: Out of Memory (OOM)

```bash
# Reduce batch size to 1
docker exec elioverse-bot-ai-service-1 sed -i 's/--batch_size 2/--batch_size 1/' /app/scripts/train_all_characters_chat.sh

# Increase gradient accumulation to compensate
docker exec elioverse-bot-ai-service-1 sed -i 's/--gradient_accumulation 8/--gradient_accumulation 16/' /app/scripts/train_all_characters_chat.sh

# Retry training
docker exec elioverse-bot-ai-service-1 bash /app/scripts/train_all_characters_chat.sh
```

### Problem 2: CUDA Not Available

```bash
# Check Docker Compose CUDA settings
grep -A 5 "ai-service" docker-compose.yml

# Should see:
# deploy:
#   resources:
#     reservations:
#       devices:
#         - driver: nvidia
```

If missing, add CUDA support:
```yaml
# docker-compose.yml
services:
  ai-service:
    deploy:
      resources:
        reservations:
          devices:
            - driver: nvidia
              count: 1
              capabilities: [gpu]
```

Then restart:
```bash
docker compose down
docker compose up -d ai-service
```

### Problem 3: Training Loss Not Decreasing

**Check after Epoch 1:**
- Loss should drop from ~2.5 to ~1.8-2.0
- If stuck above 2.3, increase learning rate:

```bash
# Edit script
docker exec elioverse-bot-ai-service-1 sed -i 's/--learning_rate 2e-4/--learning_rate 3e-4/' /app/scripts/train_all_characters_chat.sh
```

### Problem 4: bitsandbytes Import Error

```bash
# Check bitsandbytes installation
docker exec elioverse-bot-ai-service-1 python3 -c "import bitsandbytes; print(bitsandbytes.__version__)"

# If error, reinstall
docker exec elioverse-bot-ai-service-1 pip uninstall -y bitsandbytes
docker exec elioverse-bot-ai-service-1 pip install bitsandbytes==0.41.1

# Remove 4-bit quantization if still failing
docker exec elioverse-bot-ai-service-1 sed -i 's/--use_4bit//' /app/scripts/train_all_characters_chat.sh
```

---

## 📈 Interpreting Training Metrics

### Good Training Signs:
```
Epoch 1: Train Loss 2.45 → 1.87 ✅
Epoch 2: Train Loss 1.87 → 1.65 ✅
Epoch 3: Train Loss 1.65 → 1.52 ✅

Eval Loss: 1.58 (close to train loss) ✅
```

### Warning Signs:
```
Epoch 1: Train Loss 2.45 → 2.40 ❌ (not learning)
Epoch 3: Train Loss 0.85, Eval Loss 2.10 ❌ (overfitting)
```

**Solutions**:
- Not learning → Increase learning rate
- Overfitting → Reduce epochs or add dropout
- Both train/eval high → More data or longer training

---

## 🎭 Verifying Character Personalities

After training, test that characters are distinct:

### Test Script

```python
# test_all_personas.py
import requests

PROMPT = "What do you think about friendship?"

personas = ["Glordon", "Lord Grigon", "Olga Solis", "Elio"]

for persona in personas:
    response = requests.post("http://localhost:8000/llm/generate", json={
        "prompt": f"Respond as {persona}: {PROMPT}",
        "max_tokens": 100
    })

    print(f"\n{persona}:")
    print(response.json()["text"])
    print("-" * 60)
```

**Expected**: Each character should have VERY different responses.

---

## 🚀 Deployment to Discord Bot

### Option A: Update Model Path in Config

```javascript
// src/config.js
export const config = {
  ai: {
    modelPath: "/app/models/elio_all_characters_chat", // ← Update this
    baseUrl: process.env.AI_SERVICE_URL || "http://ai-service:8088"
  }
};
```

### Option B: Load Model in AI Service

```python
# ai-service/app/models/manager.py

def load_persona_model(persona_name):
    base_path = "/app/models/elio_all_characters_chat"

    # Load LoRA adapters
    model = PeftModel.from_pretrained(
        base_model,
        base_path,
        device_map="auto"
    )

    return model
```

### Restart Bot

```bash
docker compose restart bot
```

### Test in Discord

```
User: Hey Glordon!
Bot (as Glordon): *wiggles* Hey there! How are you doing?

User: Lord Grigon, what's your opinion on peace?
Bot (as Grigon): *crosses arms* Peace? Hmm. I used to think only
conquest mattered. But my son Glordon taught me that true strength
includes knowing when NOT to fight. Hylurgian honor demands both
courage AND wisdom.
```

---

## 📊 Cost Breakdown

| Item | Cost |
|------|------|
| Elio data generation (269 examples) | $0.04 |
| Multi-character generation (918 examples) | $0.15 |
| **Total Data Generation** | **$0.19** |
| Local training (2-3 hours GPU) | $0.00 * |
| **Grand Total** | **$0.19** |

\* Assuming you have local GPU. Cloud GPU would be ~$5-10.

Compare to:
- OpenAI fine-tuning: ~$20-30
- Two-stage training: ~$10-15 (GPU costs)

---

## ✅ Success Checklist

After training completes:

- [ ] Training loss decreased to < 1.6
- [ ] Eval loss < 1.8 (not overfitting)
- [ ] Test Glordon - sounds friendly and gentle
- [ ] Test Lord Grigon - sounds harsh but honorable
- [ ] Test Olga - sounds protective and military
- [ ] Responses are 2-4 sentences (not too long)
- [ ] Characters mention film-specific details
- [ ] No generic "As an AI" responses
- [ ] Model loaded in Discord bot
- [ ] Bot responds correctly to persona mentions

---

## 🎯 Next Steps After Successful Training

1. **Test extensively** in private Discord channel
2. **Collect user feedback** on character accuracy
3. **Fine-tune further** if needed (more epochs on specific characters)
4. **Deploy to production** when satisfied
5. **Monitor usage** and character consistency
6. **Iterate** - generate more training data for underperforming characters

---

## 📚 Reference Files

- Training script: `ai-service/scripts/train_all_characters_chat.sh`
- Complete dataset: `data/training-datasets/complete_elio_film_dataset.jsonl`
- Individual character files: `data/training-datasets/*_synthetic.jsonl`
- Generation scripts: `scripts/generate-multi-character-data.js`
- Strategy guide: `FINETUNING_STRATEGY.md`

---

## 🆘 Need Help?

Check logs:
```bash
# Training logs
docker exec elioverse-bot-ai-service-1 tail -100 /app/scripts/training.log

# Bot logs
docker compose logs -f bot

# AI service logs
docker compose logs -f ai-service
```

Common issues documented in `FINETUNING_STRATEGY.md` and `IMPROVEMENTS_COMPLETE.md`.

---

**Good luck with training! 🚀**

The model will learn all 15 characters and their unique personalities in just 2-3 hours!
