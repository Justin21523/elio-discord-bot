#!/bin/bash
# ============================================================================
# Production Deployment Script
# Clean deployment with resource optimization
# ============================================================================

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Helper functions
print_header() {
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Confirmation prompt
confirm() {
    read -p "$(echo -e ${YELLOW}$1${NC}) [y/N]: " -n 1 -r
    echo
    [[ $REPLY =~ ^[Yy]$ ]]
}

# ============================================================================
# Banner
# ============================================================================
clear
echo -e "${CYAN}"
cat << "EOF"
╔══════════════════════════════════════════════════════════════╗
║                                                              ║
║   ███████╗██╗     ██╗ ██████╗ ██╗   ██╗███████╗██████╗      ║
║   ██╔════╝██║     ██║██╔═══██╗██║   ██║██╔════╝██╔══██╗     ║
║   █████╗  ██║     ██║██║   ██║██║   ██║█████╗  ██████╔╝     ║
║   ██╔══╝  ██║     ██║██║   ██║╚██╗ ██╔╝██╔══╝  ██╔══██╗     ║
║   ███████╗███████╗██║╚██████╔╝ ╚████╔╝ ███████╗██║  ██║     ║
║   ╚══════╝╚══════╝╚═╝ ╚═════╝   ╚═══╝  ╚══════╝╚═╝  ╚═╝     ║
║                                                              ║
║              Production Deployment System                   ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

# ============================================================================
# Pre-flight checks
# ============================================================================
print_header "Pre-flight Checks"

# Check if running pre-deployment check
if [ -f scripts/pre-deployment-check.sh ]; then
    info "Running pre-deployment checks..."
    chmod +x scripts/pre-deployment-check.sh
    if bash scripts/pre-deployment-check.sh; then
        success "Pre-deployment checks passed"
    else
        error "Pre-deployment checks failed"
        if ! confirm "Continue deployment anyway?"; then
            exit 1
        fi
    fi
else
    warn "Pre-deployment check script not found, skipping..."
fi

# Final confirmation
echo ""
if ! confirm "Ready to deploy to production?"; then
    info "Deployment cancelled"
    exit 0
fi

# ============================================================================
# Step 1: GPU Memory Cleanup
# ============================================================================
print_header "Step 1: GPU Memory Cleanup"

if command -v nvidia-smi &> /dev/null; then
    info "Checking GPU memory..."
    GPU_MEM_BEFORE=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits | head -1)
    info "GPU memory used: ${GPU_MEM_BEFORE}MB"

    # Find and kill any Python processes using GPU
    info "Cleaning up GPU processes..."
    nvidia-smi --query-compute-apps=pid --format=csv,noheader 2>/dev/null | while read pid; do
        if [ -n "$pid" ]; then
            warn "Killing GPU process: $pid"
            kill -9 $pid 2>/dev/null || true
        fi
    done

    sleep 2
    success "GPU memory cleanup complete"
else
    warn "nvidia-smi not available, skipping GPU cleanup"
fi

# ============================================================================
# Step 2: Stop All Services
# ============================================================================
print_header "Step 2: Stopping All Services"

info "Stopping Docker containers..."
docker-compose down --remove-orphans || warn "Some containers may not exist"

# Wait for containers to fully stop
info "Waiting for containers to stop..."
sleep 3

success "All services stopped"

# ============================================================================
# Step 3: Clean Docker System
# ============================================================================
print_header "Step 3: Docker System Cleanup"

info "Removing orphaned containers..."
docker container prune -f || true

info "Removing unused networks..."
docker network prune -f || true

info "Cleaning build cache (keeping recent layers)..."
docker builder prune -f --filter="until=24h" || true

success "Docker system cleaned"

# ============================================================================
# Step 4: Verify Data Integrity
# ============================================================================
print_header "Step 4: Data Integrity Check"

# Verify JSON files
info "Validating data files..."

FILES=("data/personas.json" "data/scenarios.json" "data/greetings.json")
for file in "${FILES[@]}"; do
    if [ -f "$file" ]; then
        if node -e "JSON.parse(require('fs').readFileSync('$file'))" 2>/dev/null; then
            success "✓ $file is valid"
        else
            error "✗ $file has invalid JSON"
            exit 1
        fi
    else
        error "✗ $file not found"
        exit 1
    fi
done

success "All data files validated"

# ============================================================================
# Step 5: Build Services (with cache)
# ============================================================================
print_header "Step 5: Building Services"

info "Building Docker images (this may take a few minutes)..."
docker-compose build --parallel

success "Docker images built successfully"

# ============================================================================
# Step 6: Start MongoDB First
# ============================================================================
print_header "Step 6: Starting MongoDB"

info "Starting MongoDB service..."
docker-compose up -d mongo

# Wait for MongoDB to be healthy
info "Waiting for MongoDB to be ready..."
MONGO_READY=false
for i in {1..30}; do
    if docker exec elioverse-bot-mongo-1 mongosh -u dev -p devpass --authenticationDatabase admin --eval "db.adminCommand('ping')" --quiet 2>/dev/null | grep -q "ok"; then
        MONGO_READY=true
        break
    fi
    sleep 2
    echo -n "."
done
echo ""

if [ "$MONGO_READY" = true ]; then
    success "MongoDB is ready"
else
    error "MongoDB failed to start"
    docker-compose logs mongo
    exit 1
fi

# ============================================================================
# Step 7: Seed Database (if needed)
# ============================================================================
print_header "Step 7: Database Seeding"

# Check if database is empty
PERSONA_COUNT=$(docker exec elioverse-bot-mongo-1 mongosh -u dev -p devpass --authenticationDatabase admin communiverse_bot --eval "db.personas.countDocuments()" --quiet 2>/dev/null || echo "0")

if [ "$PERSONA_COUNT" -eq 0 ]; then
    warn "Database is empty"
    if confirm "Seed database now?"; then
        info "Seeding personas..."
        node scripts/seed-personas.js || warn "Persona seeding failed"

        info "Seeding scenarios..."
        node scripts/seed-scenarios.js || warn "Scenario seeding failed"

        info "Seeding greetings..."
        node scripts/seed-greetings.js || warn "Greeting seeding failed"

        success "Database seeded"
    fi
else
    info "Database already contains $PERSONA_COUNT personas, skipping seed"
fi

# ============================================================================
# Step 8: Start AI Service
# ============================================================================
print_header "Step 8: Starting AI Service"

info "Starting AI Service (with model preloading)..."
docker-compose up -d ai-service

# Wait for AI service to be healthy (longer timeout for model loading)
info "Waiting for AI Service to load models (this may take 1-2 minutes)..."
AI_READY=false
for i in {1..90}; do
    if curl -f -s http://localhost:8000/health > /dev/null 2>&1; then
        AI_READY=true
        break
    fi
    sleep 2
    if [ $((i % 15)) -eq 0 ]; then
        echo -n " [${i}s]"
    else
        echo -n "."
    fi
done
echo ""

if [ "$AI_READY" = true ]; then
    success "AI Service is ready"

    # Show GPU memory usage
    if command -v nvidia-smi &> /dev/null; then
        GPU_MEM_AFTER=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits | head -1)
        info "GPU memory used: ${GPU_MEM_AFTER}MB"
        info "GPU memory increase: $((GPU_MEM_AFTER - GPU_MEM_BEFORE))MB"
    fi
else
    error "AI Service failed to start"
    docker-compose logs ai-service --tail 50
    exit 1
fi

# ============================================================================
# Step 9: Start Bot Service
# ============================================================================
print_header "Step 9: Starting Discord Bot"

info "Starting Discord bot..."
docker-compose up -d bot

# Wait for bot to be ready
info "Waiting for bot to connect to Discord..."
BOT_READY=false
for i in {1..45}; do
    if docker-compose logs bot 2>/dev/null | grep -q "Logged in as"; then
        BOT_READY=true
        break
    fi
    sleep 2
    echo -n "."
done
echo ""

if [ "$BOT_READY" = true ]; then
    success "Discord bot is online"
else
    warn "Bot may still be starting, check logs with: docker-compose logs bot"
fi

# ============================================================================
# Step 10: Final Health Checks
# ============================================================================
print_header "Step 10: Final Health Checks"

info "Checking service health..."

# MongoDB
if docker exec elioverse-bot-mongo-1 mongosh -u dev -p devpass --authenticationDatabase admin --eval "db.adminCommand('ping')" --quiet 2>/dev/null | grep -q "ok"; then
    success "✓ MongoDB: healthy"
else
    error "✗ MongoDB: unhealthy"
fi

# AI Service
if curl -f -s http://localhost:8000/health > /dev/null 2>&1; then
    success "✓ AI Service: healthy"
else
    error "✗ AI Service: unhealthy"
fi

# Bot
if docker-compose ps bot | grep -q "Up"; then
    success "✓ Bot: running"
else
    error "✗ Bot: not running"
fi

# ============================================================================
# Step 11: Display Service Status
# ============================================================================
print_header "Service Status"

docker-compose ps

# ============================================================================
# Step 12: Resource Usage Summary
# ============================================================================
print_header "Resource Usage Summary"

if command -v nvidia-smi &> /dev/null; then
    echo -e "${CYAN}GPU Status:${NC}"
    nvidia-smi --query-gpu=name,temperature.gpu,utilization.gpu,memory.used,memory.total --format=table
fi

echo ""
echo -e "${CYAN}Docker Container Stats:${NC}"
docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"

# ============================================================================
# Completion
# ============================================================================
print_header "Deployment Complete"

echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}✓ All services are now running!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${CYAN}Useful Commands:${NC}"
echo "  • View logs:     docker-compose logs -f [service]"
echo "  • Check status:  docker-compose ps"
echo "  • Restart:       docker-compose restart [service]"
echo "  • Stop all:      docker-compose down"
echo "  • GPU stats:     nvidia-smi"
echo ""
echo -e "${CYAN}Service URLs:${NC}"
echo "  • AI Service:    http://localhost:8000"
echo "  • Metrics:       http://localhost:9091/metrics"
echo "  • MongoDB:       mongodb://localhost:27017"
echo ""
echo -e "${GREEN}Happy chatting! 🤖✨${NC}"
echo ""
