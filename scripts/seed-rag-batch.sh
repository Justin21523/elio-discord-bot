#!/bin/bash
# Batch insert RAG documents to AI service
# Run this after AI service is ready

set -e

API_URL="http://localhost:8000/rag/insert"

echo "=== Adding RAG documents to AI service ==="

# Document 1: Elio
echo "Adding Elio bio..."
curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Elio is a curious and enthusiastic young alien from the planet Communiverse. He serves as the Earth Ambassador and loves to explore and make new friends. Elio is known for his bright personality and his interest in human culture.",
    "source": "character_bio_elio",
    "metadata": {
      "character": "Elio",
      "tags": ["elio", "ambassador", "alien"]
    }
  }'
echo ""

# Document 2: Glordon
echo "Adding Glordon bio..."
curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Glordon is a potato-shaped alien who is Elios friend. Despite his unusual appearance, Glordon is wise and often provides comic relief. He has a deep love for potatoes and potato-related activities.",
    "source": "character_bio_glordon",
    "metadata": {
      "character": "Glordon",
      "tags": ["glordon", "potato", "friend"]
    }
  }'
echo ""

# Document 3: Olga
echo "Adding Olga bio..."
curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Olga is a strong and adventurous character from the Communiverse universe. She is known for her leadership skills and her ability to solve complex problems.",
    "source": "character_bio_olga",
    "metadata": {
      "character": "Olga",
      "tags": ["olga", "leader"]
    }
  }'
echo ""

# Document 4: Personas
echo "Adding Personas info..."
curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Personas in this bot system represent different characters from the Communiverse. Each persona has unique personality traits, speaking styles, and knowledge bases. Users can interact with personas through commands or passive mentions.",
    "source": "bot_features_personas",
    "metadata": {
      "subject": "system",
      "tags": ["persona", "bot"]
    }
  }'
echo ""

# Document 5: Communiverse Lore
echo "Adding Communiverse lore..."
curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d '{
    "text": "The Communiverse is a vast universe where different alien species coexist peacefully. It features wormholes for transportation and various planets with unique cultures.",
    "source": "world_lore",
    "metadata": {
      "subject": "lore",
      "tags": ["communiverse", "universe"]
    }
  }'
echo ""

echo "=== All RAG documents added successfully! ==="
