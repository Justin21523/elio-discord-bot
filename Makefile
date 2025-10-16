.PHONY: up down logs build dev seed warm

up:
\tdocker compose up -d --build

down:
\tdocker compose down

logs:
\tdocker compose logs -f --tail=200

build:
\tdocker compose build --no-cache

dev:
\t# Run services in attached mode for interactive debugging
\tdocker compose up --build

warm:
\t# Trigger sidecar warmup after containers are healthy
\tcurl -s -X POST http://localhost:8000/admin/warmup | jq
