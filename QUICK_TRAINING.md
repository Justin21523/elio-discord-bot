# 🚀 Quick Start: Train Your Elio Bot Now!

## ✅ You're Ready!

Everything is prepared:
- ✅ 1,185 training examples generated
- ✅ Training script ready
- ✅ Best strategy decided (Chat model + character data)

---

## ⚡ 3-Step Training Process

### Step 1: Copy Files (1 minute)

```bash
# Copy dataset to AI container
docker cp data/training-datasets/complete_elio_film_dataset.jsonl \
  elioverse-bot-ai-service-1:/app/data/training-datasets/

# Copy training script
docker cp ai-service/scripts/train_all_characters_chat.sh \
  elioverse-bot-ai-service-1:/app/scripts/

# Make script executable
docker exec elioverse-bot-ai-service-1 chmod +x /app/scripts/train_all_characters_chat.sh
```

### Step 2: Verify GPU (30 seconds)

```bash
# Check GPU is available
docker exec elioverse-bot-ai-service-1 nvidia-smi

# Should show your GPU model and memory
```

If GPU not found:
```bash
# Restart AI service with GPU
docker compose down ai-service
docker compose up -d ai-service
```

### Step 3: Start Training (2-3 hours)

```bash
# Start training (interactive mode)
docker exec -it elioverse-bot-ai-service-1 bash /app/scripts/train_all_characters_chat.sh

# Or background mode (can close terminal)
docker exec elioverse-bot-ai-service-1 bash /app/scripts/train_all_characters_chat.sh > training.log 2>&1 &

# Check progress
docker exec elioverse-bot-ai-service-1 tail -f /app/models/elio_all_characters_chat/training.log
```

---

## 📊 What to Expect

### Training Progress
```
Epoch 1/3 (45 min)
├── Step 1/445   | Loss: 2.45 | GPU: 14.2GB
├── Step 50/445  | Loss: 2.12 | GPU: 14.2GB
├── Step 100/445 | Loss: 1.95 | GPU: 14.2GB
└── ...
✓ Epoch 1 complete | Train Loss: 1.87 | Eval Loss: 1.92

Epoch 2/3 (45 min)
├── ...
✓ Epoch 2 complete | Train Loss: 1.65 | Eval Loss: 1.68

Epoch 3/3 (45 min)
├── ...
✓ Epoch 3 complete | Train Loss: 1.52 | Eval Loss: 1.58

✅ Training Complete! Model saved to /app/models/elio_all_characters_chat
```

### Success Indicators
- ✅ Training loss decreases each epoch
- ✅ Eval loss stays close to train loss (< 0.1 difference)
- ✅ Final train loss < 1.6
- ✅ No OOM (out of memory) errors

---

## 🧪 Test After Training

### Quick Test

```bash
# Test Glordon personality
docker exec elioverse-bot-ai-service-1 python3 << 'EOF'
from transformers import AutoTokenizer, AutoModelForCausalLM
from peft import PeftModel

# Load model
base = AutoModelForCausalLM.from_pretrained("deepseek-ai/deepseek-llm-7b-chat")
model = PeftModel.from_pretrained(base, "/app/models/elio_all_characters_chat")
tokenizer = AutoTokenizer.from_pretrained("deepseek-ai/deepseek-llm-7b-chat")

# Test
prompt = "Respond as Glordon: Tell me about Elio"
inputs = tokenizer(prompt, return_tensors="pt")
outputs = model.generate(**inputs, max_length=150)
print(tokenizer.decode(outputs[0]))
EOF
```

Expected output style:
```
*wiggles happily* Elio is my best friend! He's the first person who
understood me and didn't expect me to be a warrior. We're both different,
and that's what makes us special!
```

---

## 🎯 Deploy to Discord Bot

### Option A: Update Config (Recommended)

```javascript
// src/config.js
export const config = {
  ai: {
    fineTunedModel: "/app/models/elio_all_characters_chat",
    useFineTuned: true  // ← Enable fine-tuned model
  }
};
```

### Option B: Environment Variable

```bash
# .env
AI_FINETUNED_MODEL_PATH=/app/models/elio_all_characters_chat
USE_FINETUNED_MODEL=true
```

### Restart Bot

```bash
docker compose restart bot

# Check logs
docker compose logs -f bot
```

### Test in Discord

```
User: @ElioBot Hey Glordon!
Bot: *wiggles* Hey there! How are you doing today?

User: @ElioBot Lord Grigon, what do you think about peace?
Bot: *crosses arms* Hmm. I once believed only conquest mattered.
     But my son taught me that true strength includes knowing when
     not to fight. *nods* Hylurgian honor demands both courage and wisdom.
```

---

## ❓ Troubleshooting

### Problem: Out of Memory

**Solution**: Reduce batch size
```bash
# Edit the script
docker exec elioverse-bot-ai-service-1 sed -i 's/--batch_size 2/--batch_size 1/' /app/scripts/train_all_characters_chat.sh

# Restart training
docker exec -it elioverse-bot-ai-service-1 bash /app/scripts/train_all_characters_chat.sh
```

### Problem: Training Loss Not Decreasing

**Solution**: Check learning rate
```bash
# Current: 2e-4
# If loss stuck, increase to 3e-4:
docker exec elioverse-bot-ai-service-1 sed -i 's/--learning_rate 2e-4/--learning_rate 3e-4/' /app/scripts/train_all_characters_chat.sh
```

### Problem: Characters Sound Generic

**Solution**: More character-specific data
```bash
# Generate 50% more examples
node scripts/generate-multi-character-data.js

# Then re-merge and re-train
cat data/training-datasets/elio_synthetic.jsonl \
    data/training-datasets/all_characters_synthetic.jsonl \
    > data/training-datasets/complete_elio_film_dataset.jsonl
```

---

## 📚 Need More Info?

- **Training strategy**: `FINETUNING_STRATEGY.md`
- **Detailed training guide**: `TRAINING_EXECUTION_GUIDE.md`
- **Data generation**: `MULTI_CHARACTER_TRAINING_GUIDE.md`
- **Complete summary**: `PROJECT_COMPLETE_SUMMARY.md`

---

## 🎉 You're All Set!

Training will take 2-3 hours. Once complete, your bot will have:

✅ **15 distinct character personalities**
✅ **Film-accurate responses**
✅ **Natural conversation ability**
✅ **Character-specific knowledge**

Start training now and come back in 2-3 hours! 🚀

---

**Questions?** Check the troubleshooting section or detailed guides above.

**Ready?** Run Step 1 now! ⬆️
