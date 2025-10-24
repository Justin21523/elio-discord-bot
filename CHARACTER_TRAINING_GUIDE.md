# 🎬 Multi-Character Training Data Guide (Pixar “Elio”)

End-to-end instructions to generate **film-accurate** training data for **all characters** using OpenAI’s API and your RAG sources — plus the actual results, costs, QA steps, and how to train with the dataset.

> Source of truth: `data/rag-resources/character_*.md` (character bios, traits, relationships, lore)

---

## Why this pipeline?

* ✅ **Film-accurate** — grounded in your character MD files
* ✅ **Tiered coverage** — more examples for important characters
* ✅ **Cost-effective** — uses **GPT-4o-mini**
* ✅ **Scalable** — one command to generate everything
* ✅ **Ready for training** — JSONL per character + combined file

---

## Character Tiers (target counts)

The generator allocates examples by importance:

* **Tier 1 – Main**: 150 each

  * Glordon (tritagonist), Olga Solis (deuteragonist)
* **Tier 2 – Major**: 100 each

  * Lord Grigon (antagonist), Ambassador Questa (ally)
* **Tier 3 – Supporting**: 60 each

  * Gunther Melmac, Bryce Markwell, Ooooo (AI), Ambassador Helix
* **Tier 4 – Minor**: 30 each

  * Caleb, Ambassadors Tegmen, Turais, Naos, Auva, Mira

> Note: **Elio** already existed with 269 examples.

---

## Quick Start

### 1) Set your OpenAI key

```bash
export OPENAI_API_KEY="sk-proj-***"
```

### 2) Run the generator

```bash
# Default output location
node scripts/generate-multi-character-data.js

# Or specify a custom output directory
node scripts/generate-multi-character-data.js data/training-datasets
```

### 3) What the script does

* Reads each MD file in `data/rag-resources/`
* Extracts personality, background, relationships, traits
* Generates character-appropriate scenarios
* Produces JSONL per character + a combined file
* Handles markdown-wrapped JSON & light rate limits

**Typical runtime:** ~45–60 minutes for the entire set.

---

## Output (expected structure)

```
data/training-datasets/
├── elio_synthetic.jsonl                       (269 examples)   # pre-existing
├── glordon_synthetic.jsonl                    (≈150)
├── olga_solis_synthetic.jsonl                 (≈150)
├── lord_grigon_synthetic.jsonl                (≈100)
├── ambassador_questa_synthetic.jsonl          (≈100)
├── gunther_melmac_synthetic.jsonl             (≈60)
├── bryce_markwell_synthetic.jsonl             (≈60)
├── ooooo_synthetic.jsonl                      (≈60)
├── ambassador_helix_synthetic.jsonl           (≈60)
├── caleb_synthetic.jsonl                      (≈30)
├── ambassador_tegmen_synthetic.jsonl          (≈30)
├── ambassador_turais_synthetic.jsonl          (≈30)
├── ambassador_naos_synthetic.jsonl            (≈30)
├── ambassador_auva_synthetic.jsonl            (≈30)
├── ambassador_mira_synthetic.jsonl            (≈30)
└── all_characters_synthetic.jsonl             (combined others)
```

> Slight deviations from targets (e.g., 149 instead of 150) can happen due to filtering.

---

## Example JSONL record

```json
{
  "persona": "Glordon",
  "category": "friendship_elio",
  "instruction": "Respond as Glordon from Pixar's Elio film to the following message.",
  "input": "Tell me about your friendship with Elio.",
  "output": "*wiggles happily* Elio is my best friend! He's the first person who ever understood me and didn't expect me to be a warrior. We're both kind of... different, you know?"
}
```

---

## Merge datasets (Elio + everyone else)

```bash
cat data/training-datasets/elio_synthetic.jsonl \
    data/training-datasets/all_characters_synthetic.jsonl \
    > data/training-datasets/complete_training_set.jsonl

# Sanity check
wc -l data/training-datasets/complete_training_set.jsonl
```

---

## Training with the combined dataset

### Option A — OpenAI Fine-Tuning API (simple)

```bash
openai api fine_tunes.create \
  -t data/training-datasets/complete_training_set.jsonl \
  -m gpt-4o-mini-2024-07-18 \
  --suffix "elio-film-characters"

# Follow progress
openai api fine_tunes.follow -i ft_***
```

> Cost ballpark for ~1.2k examples (3 epochs): **~$15–25**.

### Option B — Local training (advanced)

```bash
# Copy dataset into the AI container
docker cp data/training-datasets/complete_training_set.jsonl \
  elioverse-bot-ai-service-1:/app/data/training-datasets/

# Run your training script
docker exec elioverse-bot-ai-service-1 bash /app/scripts/train_all_personas.sh
```

---

## Customizing character counts

Edit `scripts/generate-multi-character-data.js`:

```js
const CHARACTER_TIERS = {
  main:       { count: 150, characters: ['Glordon', 'Olga Solis'] },
  major:      { count: 100, characters: ['Lord Grigon', 'Ambassador Questa'] },
  supporting: { count:  60, characters: ['Gunther Melmac','Bryce Markwell','Ooooo','Ambassador Helix'] },
  minor:      { count:  30, characters: ['Caleb','Ambassador Tegmen','Ambassador Turais','Ambassador Naos','Ambassador Auva','Ambassador Mira'] }
};
```

---

## Scenario categories

**Common (all personas):** greeting, introduction, personal questions, feelings, advice.
**Character-specific examples:**

* **Glordon:** friendship with Elio; not wanting to be a warrior; empathy; “tardigrade/potato” humor; bond with Lord Grigon.
* **Olga Solis:** aunt–nephew dynamic with Elio; military career; astronaut dreams; protective parenting.
* **Lord Grigon:** conquest/honor; temper management; relationship with Glordon; redemption arc; Communiverse politics.

(Extend similarly for each ambassador and supporting character.)

---

## Quality assurance

```bash
# Validate JSON structure
head -5 data/training-datasets/glordon_synthetic.jsonl | python -m json.tool

# Distribution by persona
grep -o '"persona":"[^"]*"' data/training-datasets/all_characters_synthetic.jsonl | sort | uniq -c

# Quick spot-check for a persona
grep -A1 '"persona":"Glordon"' data/training-datasets/all_characters_synthetic.jsonl | head -20
```

---

## Troubleshooting

**Rate limits:** The script pauses ~150 ms between calls. Bump if needed:

```js
await new Promise(r => setTimeout(r, 300));
```

**Markdown-wrapped JSON:** The generator strips backticks/markdown fences; if failures spike, lower temperature slightly.

**Memory pressure:** Run by tier — comment out tiers you don’t need yet and re-run.

---

## 📈 Actual Results (from your latest run)

Where plan meets reality:

* **Generated files** in `data/training-datasets/`:

  * `elio_synthetic.jsonl` — **269** examples (pre-existing, ~$0.04)
  * Multi-character totals (examples may vary by 1–2 due to filtering):

    * Glordon **150**, Olga Solis **149**
    * Lord Grigon **100**, Ambassador Questa **100**
    * Gunther Melmac **60**, Bryce Markwell **60**
    * Ooooo **60**, Ambassador Helix **60**
    * Caleb **30**
    * Ambassadors Tegmen **30**, Turais **29**, Naos **30**, Auva **30**, Mira **30**
  * `all_characters_synthetic.jsonl` — **918** examples combined
  * `complete_elio_film_dataset.jsonl` — **1,185** examples total ✅

**Generation cost:** **~$0.19** (local run, GPT-4o-mini prompts only)
**Training cost:** local GPU (2–3h) → **$0** (cloud GPU would add ~$5–10)

> Earlier planning estimates (~920 others / 1,189 total, ~$2.7) were conservative; **the actual run was cheaper and landed at 1,185** after filtering.

---

## Next steps

1. ✅ Review samples & persona voice
2. ✅ Merge with Elio and re-count
3. ✅ Fine-tune:

   * **Preferred:** Chat base model + persona data (single stage)
   * Local LoRA (4-bit) or OpenAI API
4. ✅ Test in Discord (distinct voices per persona)
5. ✅ Deploy & monitor; iterate weak personas with extra data

---

## Success criteria (post-training)

* Distinct voices: Glordon (gentle), Lord Grigon (harsh/honorable), Olga (protective/military)
* No generic “As an AI…” replies
* Film-specific details (Communiverse, Hylurg, relationships) appear naturally
* Training loss < ~1.6, eval loss < ~1.8 (indicative; human eval matters most)

---

## File map (reference)

```
data/
  rag-resources/                # source character MDs (film canon)
  training-datasets/
    complete_elio_film_dataset.jsonl   # MAIN (1,185)
    *_synthetic.jsonl                   # per-persona files
scripts/
  generate-elio-synthetic-data.js       # Elio generator
  generate-multi-character-data.js      # Multi-character generator ★
ai-service/
  scripts/
    train_all_characters_chat.sh        # Local training script ★
docs/
  MULTI_CHARACTER_DATA_GUIDE.md         # this guide
```

---

## Why this approach?

* **Grounded** in film canon (RAG character sheets)
* **Efficient** tiering (more data where it matters)
* **Chat-model + persona data** avoids catastrophic forgetting and cuts training time in half
* **Automation** beats manual authoring by orders of magnitude
