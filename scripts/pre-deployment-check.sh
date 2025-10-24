#!/bin/bash
# ============================================================================
# Pre-Deployment Check Script
# Validates all systems before production deployment
# ============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
PASSED=0
FAILED=0
WARNINGS=0

# Helper functions
print_header() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED++))
}

fail() {
    echo -e "${RED}✗${NC} $1"
    ((FAILED++))
}

warn() {
    echo -e "${YELLOW}⚠${NC} $1"
    ((WARNINGS++))
}

info() {
    echo -e "${BLUE}ℹ${NC} $1"
}

# ============================================================================
# 1. Environment Check
# ============================================================================
print_header "1. Environment Check"

# Check if Docker is running
if docker info > /dev/null 2>&1; then
    pass "Docker is running"
else
    fail "Docker is not running"
fi

# Check if docker-compose is available
if command -v docker-compose &> /dev/null; then
    pass "docker-compose is installed"
else
    fail "docker-compose is not installed"
fi

# Check NVIDIA GPU availability
if command -v nvidia-smi &> /dev/null; then
    GPU_INFO=$(nvidia-smi --query-gpu=name,memory.total --format=csv,noheader | head -1)
    pass "NVIDIA GPU detected: $GPU_INFO"
else
    warn "NVIDIA GPU not detected or nvidia-smi not available"
fi

# Check .env file
if [ -f .env ]; then
    pass ".env file exists"

    # Check critical env vars
    if grep -q "DISCORD_TOKEN=" .env && [ -n "$(grep DISCORD_TOKEN= .env | cut -d'=' -f2)" ]; then
        pass "DISCORD_TOKEN is set"
    else
        fail "DISCORD_TOKEN is not set in .env"
    fi

    if grep -q "APP_ID=" .env && [ -n "$(grep APP_ID= .env | cut -d'=' -f2)" ]; then
        pass "APP_ID is set"
    else
        fail "APP_ID is not set in .env"
    fi
else
    fail ".env file not found"
fi

# ============================================================================
# 2. Data Integrity Check
# ============================================================================
print_header "2. Data Integrity Check"

# Check data files exist
if [ -f data/personas.json ]; then
    PERSONA_COUNT=$(node -e "console.log(JSON.parse(require('fs').readFileSync('data/personas.json')).personas.length)")
    pass "Personas file exists ($PERSONA_COUNT personas)"
else
    fail "data/personas.json not found"
fi

if [ -f data/scenarios.json ]; then
    SCENARIO_COUNT=$(node -e "console.log(JSON.parse(require('fs').readFileSync('data/scenarios.json')).scenarios.length)")
    pass "Scenarios file exists ($SCENARIO_COUNT scenarios)"
else
    fail "data/scenarios.json not found"
fi

if [ -f data/greetings.json ]; then
    GREETING_COUNT=$(node -e "console.log(JSON.parse(require('fs').readFileSync('data/greetings.json')).greetings.length)")
    pass "Greetings file exists ($GREETING_COUNT greetings)"
else
    fail "data/greetings.json not found"
fi

# Validate JSON structure
info "Validating JSON structure..."
if node -e "JSON.parse(require('fs').readFileSync('data/personas.json'))" 2>/dev/null; then
    pass "personas.json is valid JSON"
else
    fail "personas.json has invalid JSON"
fi

if node -e "JSON.parse(require('fs').readFileSync('data/scenarios.json'))" 2>/dev/null; then
    pass "scenarios.json is valid JSON"
else
    fail "scenarios.json has invalid JSON"
fi

if node -e "JSON.parse(require('fs').readFileSync('data/greetings.json'))" 2>/dev/null; then
    pass "greetings.json is valid JSON"
else
    fail "greetings.json has invalid JSON"
fi

# ============================================================================
# 3. Docker Services Check
# ============================================================================
print_header "3. Docker Services Status"

# Check if services are running
if docker-compose ps | grep -q "mongo.*Up"; then
    pass "MongoDB service is running"
else
    warn "MongoDB service is not running (will start with deployment)"
fi

if docker-compose ps | grep -q "ai-service.*Up"; then
    pass "AI Service is running"
else
    warn "AI Service is not running (will start with deployment)"
fi

if docker-compose ps | grep -q "bot.*Up"; then
    pass "Bot service is running"
else
    warn "Bot service is not running (will start with deployment)"
fi

# ============================================================================
# 4. MongoDB Check
# ============================================================================
print_header "4. MongoDB Check"

if docker exec elioverse-bot-mongo-1 mongosh -u dev -p devpass --authenticationDatabase admin --eval "db.adminCommand('ping')" --quiet 2>/dev/null | grep -q "ok"; then
    pass "MongoDB is accessible"

    # Check collections
    PERSONA_DB_COUNT=$(docker exec elioverse-bot-mongo-1 mongosh -u dev -p devpass --authenticationDatabase admin communiverse_bot --eval "db.personas.countDocuments()" --quiet 2>/dev/null)
    if [ -n "$PERSONA_DB_COUNT" ] && [ "$PERSONA_DB_COUNT" -gt 0 ]; then
        pass "Personas collection: $PERSONA_DB_COUNT documents"
    else
        warn "Personas collection is empty or not found"
    fi

    SCENARIO_DB_COUNT=$(docker exec elioverse-bot-mongo-1 mongosh -u dev -p devpass --authenticationDatabase admin communiverse_bot --eval "db.scenarios.countDocuments()" --quiet 2>/dev/null)
    if [ -n "$SCENARIO_DB_COUNT" ] && [ "$SCENARIO_DB_COUNT" -gt 0 ]; then
        pass "Scenarios collection: $SCENARIO_DB_COUNT documents"
    else
        warn "Scenarios collection is empty or not found"
    fi
else
    warn "MongoDB is not accessible (will be initialized on deployment)"
fi

# ============================================================================
# 5. AI Service Health Check
# ============================================================================
print_header "5. AI Service Health Check"

if curl -f -s http://localhost:8000/health > /dev/null 2>&1; then
    pass "AI Service health endpoint is responding"

    # Get detailed health status
    HEALTH_STATUS=$(curl -s http://localhost:8000/health | node -e "const data = JSON.parse(require('fs').readFileSync(0)); console.log(data.status || 'unknown')")
    if [ "$HEALTH_STATUS" = "healthy" ]; then
        pass "AI Service status: healthy"
    else
        warn "AI Service status: $HEALTH_STATUS"
    fi
else
    warn "AI Service is not responding (will start with deployment)"
fi

# ============================================================================
# 6. GPU Memory Check
# ============================================================================
print_header "6. GPU Memory Check"

if command -v nvidia-smi &> /dev/null; then
    GPU_MEM_USED=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits | head -1)
    GPU_MEM_TOTAL=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | head -1)
    GPU_MEM_PERCENT=$((GPU_MEM_USED * 100 / GPU_MEM_TOTAL))

    info "GPU Memory: ${GPU_MEM_USED}MB / ${GPU_MEM_TOTAL}MB (${GPU_MEM_PERCENT}% used)"

    if [ "$GPU_MEM_PERCENT" -lt 80 ]; then
        pass "GPU memory usage is healthy (<80%)"
    else
        warn "GPU memory usage is high (${GPU_MEM_PERCENT}%)"
    fi

    # Check GPU processes
    GPU_PROCESSES=$(nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv,noheader 2>/dev/null | wc -l)
    info "Active GPU processes: $GPU_PROCESSES"
else
    warn "Cannot check GPU memory (nvidia-smi not available)"
fi

# ============================================================================
# 7. Node Modules Check
# ============================================================================
print_header "7. Node Modules Check"

if [ -d node_modules ]; then
    pass "node_modules directory exists"
else
    warn "node_modules directory not found (run npm install)"
fi

# Check critical dependencies
if [ -d node_modules/discord.js ]; then
    pass "discord.js is installed"
else
    fail "discord.js is not installed"
fi

# ============================================================================
# 8. File Permissions Check
# ============================================================================
print_header "8. File Permissions Check"

# Check if logs directory is writable
if [ -w logs ] || mkdir -p logs 2>/dev/null; then
    pass "logs directory is writable"
else
    fail "logs directory is not writable"
fi

# Check if data directory is readable
if [ -r data ]; then
    pass "data directory is readable"
else
    fail "data directory is not readable"
fi

# ============================================================================
# 9. Port Availability Check
# ============================================================================
print_header "9. Port Availability Check"

check_port() {
    PORT=$1
    SERVICE=$2
    if nc -z localhost $PORT 2>/dev/null; then
        info "$SERVICE port $PORT is in use (service running)"
    else
        pass "$SERVICE port $PORT is available"
    fi
}

check_port 27017 "MongoDB"
check_port 8000 "AI Service"
check_port 9091 "Metrics"

# ============================================================================
# 10. Configuration Validation
# ============================================================================
print_header "10. Configuration Validation"

# Check docker-compose.yml
if docker-compose config > /dev/null 2>&1; then
    pass "docker-compose.yml is valid"
else
    fail "docker-compose.yml has errors"
fi

# Check if all command files exist
COMMAND_FILES=(
    "src/commands/ai.js"
    "src/commands/persona.js"
    "src/commands/scenario.js"
    "src/commands/admin-data.js"
)

for cmd_file in "${COMMAND_FILES[@]}"; do
    if [ -f "$cmd_file" ]; then
        pass "Command file exists: $cmd_file"
    else
        fail "Command file missing: $cmd_file"
    fi
done

# ============================================================================
# Summary
# ============================================================================
print_header "Deployment Check Summary"

echo ""
echo -e "${GREEN}Passed:${NC}   $PASSED"
echo -e "${YELLOW}Warnings:${NC} $WARNINGS"
echo -e "${RED}Failed:${NC}   $FAILED"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${GREEN}✓ All critical checks passed!${NC}"
    echo -e "${GREEN}✓ System is ready for deployment${NC}"
    if [ $WARNINGS -gt 0 ]; then
        echo -e "${YELLOW}⚠ Please review $WARNINGS warning(s) above${NC}"
    fi
    echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    exit 0
else
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${RED}✗ $FAILED critical check(s) failed!${NC}"
    echo -e "${RED}✗ Please fix errors before deployment${NC}"
    echo -e "${RED}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    exit 1
fi
