#!/bin/bash
# Seed RAG from all markdown files in data/rag-resources/
set -e

API_URL="http://localhost:8000/rag/insert"
DATA_DIR="./data/rag-resources"

echo "=== Batch RAG Import from $DATA_DIR ==="

# Counter
count=0
success=0
failed=0

# Find all .md files recursively
while IFS= read -r file; do
    count=$((count + 1))

    # Get relative path for source
    rel_path="${file#$DATA_DIR/}"
    source_name=$(echo "$rel_path" | sed 's/\.md$//' | sed 's/\//_/g')

    # Extract category from path
    category=$(dirname "$rel_path" | cut -d'/' -f1)
    if [ "$category" = "." ]; then
        category="general"
    fi

    echo "[$count] Processing: $rel_path"

    # Read file content
    content=$(cat "$file")

    # Escape content for JSON
    content_escaped=$(echo "$content" | jq -Rs .)

    # Build JSON payload
    json_payload=$(cat <<EOF
{
  "text": $content_escaped,
  "source": "$source_name",
  "metadata": {
    "category": "$category",
    "file_path": "$rel_path",
    "tags": ["$category", "doc"]
  }
}
EOF
)

    # Send to RAG API
    response=$(curl -s -X POST "$API_URL" \
      -H "Content-Type: application/json" \
      -d "$json_payload")

    # Check if successful
    if echo "$response" | grep -q '"ok":true'; then
        doc_id=$(echo "$response" | jq -r '.data.doc_id')
        echo "  ✓ Success: $doc_id"
        success=$((success + 1))
    else
        echo "  ✗ Failed: $response"
        failed=$((failed + 1))
    fi

    # Small delay to avoid overwhelming the API
    sleep 0.1

done < <(find "$DATA_DIR" -type f -name "*.md")

echo ""
echo "=== RAG Import Complete ==="
echo "Total files: $count"
echo "Success: $success"
echo "Failed: $failed"
