#!/bin/bash
# ============================================================================
# Elioverse Bot - Deployment Verification Script
# Verifies all prerequisites and configurations before deployment
# ============================================================================

set -e

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

# Functions
print_header() {
    echo -e "\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
    ((PASSED++))
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
    ((FAILED++))
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
    ((WARNINGS++))
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

check_command() {
    if command -v $1 &> /dev/null; then
        print_success "$1 is installed"
        return 0
    else
        print_error "$1 is not installed"
        return 1
    fi
}

# Start verification
clear
echo -e "${BLUE}"
cat << "EOF"
╔═══════════════════════════════════════════════════════════════════════╗
║                                                                       ║
║              Elioverse Bot - Deployment Verification                 ║
║                                                                       ║
╚═══════════════════════════════════════════════════════════════════════╝
EOF
echo -e "${NC}"

# ============================================================================
# 1. System Requirements
# ============================================================================
print_header "1. Checking System Requirements"

# Check OS
print_info "Operating System: $(uname -s)"
print_info "Kernel: $(uname -r)"

# Check Docker
if check_command docker; then
    DOCKER_VERSION=$(docker --version | awk '{print $3}' | sed 's/,//')
    print_info "Docker version: $DOCKER_VERSION"
else
    print_error "Docker is required. Install from: https://docs.docker.com/get-docker/"
fi

# Check Docker Compose
if check_command "docker compose"; then
    COMPOSE_VERSION=$(docker compose version --short 2>/dev/null || echo "unknown")
    print_info "Docker Compose version: $COMPOSE_VERSION"
elif check_command docker-compose; then
    print_warning "Using legacy docker-compose. Consider upgrading to 'docker compose' plugin"
    COMPOSE_VERSION=$(docker-compose --version | awk '{print $3}' | sed 's/,//')
    print_info "Docker Compose version: $COMPOSE_VERSION"
else
    print_error "Docker Compose is required"
fi

# ============================================================================
# 2. GPU and CUDA
# ============================================================================
print_header "2. Checking GPU and CUDA"

# Check NVIDIA driver
if command -v nvidia-smi &> /dev/null; then
    print_success "NVIDIA driver is installed"

    # Get driver version
    DRIVER_VERSION=$(nvidia-smi --query-gpu=driver_version --format=csv,noheader | head -n1)
    print_info "Driver version: $DRIVER_VERSION"

    # Get GPU name
    GPU_NAME=$(nvidia-smi --query-gpu=name --format=csv,noheader | head -n1)
    print_info "GPU: $GPU_NAME"

    # Check if RTX 5080
    if [[ "$GPU_NAME" == *"5080"* ]]; then
        print_success "RTX 5080 detected"
    else
        print_warning "GPU is not RTX 5080. Configuration may need adjustment"
    fi

    # Get CUDA version
    CUDA_VERSION=$(nvidia-smi --query-gpu=compute_cap --format=csv,noheader | head -n1)
    print_info "Compute Capability: $CUDA_VERSION"

else
    print_error "NVIDIA driver not found. Install from: https://www.nvidia.com/drivers"
fi

# Check NVIDIA Container Toolkit
if docker run --rm --gpus all nvidia/cuda:12.8.0-base-ubuntu22.04 nvidia-smi &> /dev/null; then
    print_success "NVIDIA Container Toolkit is working"
else
    print_error "NVIDIA Container Toolkit not working or not installed"
    print_info "Install guide: https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html"
fi

# ============================================================================
# 3. Directory Structure
# ============================================================================
print_header "3. Checking Directory Structure"

# Check warehouse directory
WAREHOUSE_DIR="/mnt/c/AI_LLM_projects/ai_warehouse"

if [ -d "$WAREHOUSE_DIR" ]; then
    print_success "Warehouse directory exists: $WAREHOUSE_DIR"

    # Check subdirectories
    SUBDIRS=("models" "datasets" "vector_db" "bm25_index" "stories" "fine_tuned_models" "training_data" "checkpoints" "logs")

    for subdir in "${SUBDIRS[@]}"; do
        if [ -d "$WAREHOUSE_DIR/$subdir" ]; then
            print_success "  $subdir/ exists"
        else
            print_warning "  $subdir/ missing (will be created automatically)"
            mkdir -p "$WAREHOUSE_DIR/$subdir" 2>/dev/null || print_error "  Cannot create $subdir/"
        fi
    done

    # Check permissions
    if [ -w "$WAREHOUSE_DIR" ]; then
        print_success "Warehouse directory is writable"
    else
        print_error "Warehouse directory is not writable. Run: chmod -R 755 $WAREHOUSE_DIR"
    fi

else
    print_error "Warehouse directory not found: $WAREHOUSE_DIR"
    print_info "Create it with: mkdir -p $WAREHOUSE_DIR/{models,datasets,vector_db,bm25_index,stories,fine_tuned_models,training_data,checkpoints,logs}"
fi

# Check project structure
print_info "Checking project files..."

if [ -f "docker-compose.yml" ]; then
    print_success "docker-compose.yml exists"
else
    print_error "docker-compose.yml not found"
fi

if [ -f "ai-service/Dockerfile" ]; then
    print_success "ai-service/Dockerfile exists"
else
    print_error "ai-service/Dockerfile not found"
fi

if [ -f "ai-service/requirements.txt" ]; then
    print_success "ai-service/requirements.txt exists"

    # Check PyTorch version
    if grep -q "torch==2.7.1+cu128" ai-service/requirements.txt; then
        print_success "PyTorch 2.7.1+cu128 configured correctly"
    else
        print_warning "PyTorch version may not match CUDA 12.8 requirements"
    fi
else
    print_error "ai-service/requirements.txt not found"
fi

# ============================================================================
# 4. Environment Configuration
# ============================================================================
print_header "4. Checking Environment Configuration"

# Check .env files
if [ -f ".env" ]; then
    print_success "Bot .env exists"

    # Check critical variables
    if grep -q "DISCORD_TOKEN=your_" .env; then
        print_warning "DISCORD_TOKEN not configured (contains placeholder)"
    else
        print_success "DISCORD_TOKEN configured"
    fi

    if grep -q "AI_WAREHOUSE_ROOT=/mnt/c/AI_LLM_projects/ai_warehouse" .env; then
        print_success "Warehouse path configured in bot .env"
    else
        print_warning "Warehouse path may not be configured in bot .env"
    fi

else
    print_error "Bot .env not found. Copy from .env.example"
fi

if [ -f "ai-service/.env" ]; then
    print_success "AI Service .env exists"

    # Check warehouse paths in ai-service .env
    if grep -q "MODEL_CACHE_DIR=/mnt/c/AI_LLM_projects/ai_warehouse/models" ai-service/.env; then
        print_success "Warehouse paths configured in AI service .env"
    else
        print_warning "Warehouse paths may not be configured in AI service .env"
    fi

else
    print_error "AI Service .env not found. Copy from ai-service/.env.example"
fi

# ============================================================================
# 5. Docker Configuration
# ============================================================================
print_header "5. Checking Docker Configuration"

# Check if docker daemon is running
if docker info &> /dev/null; then
    print_success "Docker daemon is running"
else
    print_error "Docker daemon is not running. Start Docker Desktop or run: sudo systemctl start docker"
fi

# Check docker-compose.yml syntax
if docker compose config &> /dev/null; then
    print_success "docker-compose.yml syntax is valid"
else
    print_error "docker-compose.yml has syntax errors"
fi

# Check for GPU support in docker-compose
if grep -q "capabilities: \[gpu\]" docker-compose.yml; then
    print_success "GPU support configured in docker-compose.yml"
else
    print_warning "GPU support may not be configured in docker-compose.yml"
fi

# Check volume mounts
if grep -q "/mnt/c/AI_LLM_projects/ai_warehouse:/mnt/ai_warehouse" docker-compose.yml; then
    print_success "Warehouse volume mount configured"
else
    print_warning "Warehouse volume mount may not be configured correctly"
fi

# ============================================================================
# 6. Network Connectivity
# ============================================================================
print_header "6. Checking Network Connectivity"

# Check internet connection
if ping -c 1 google.com &> /dev/null; then
    print_success "Internet connection available"
else
    print_warning "Internet connection may be limited"
fi

# Check Docker Hub access
if docker pull hello-world &> /dev/null; then
    print_success "Docker Hub accessible"
    docker rmi hello-world &> /dev/null
else
    print_warning "Docker Hub access may be limited"
fi

# Check HuggingFace access (for model downloads)
if curl -s https://huggingface.co &> /dev/null; then
    print_success "HuggingFace accessible"
else
    print_warning "HuggingFace may not be accessible (needed for model downloads)"
fi

# ============================================================================
# 7. Disk Space
# ============================================================================
print_header "7. Checking Disk Space"

# Check available space in warehouse directory
if [ -d "$WAREHOUSE_DIR" ]; then
    AVAILABLE_SPACE=$(df -h "$WAREHOUSE_DIR" | awk 'NR==2 {print $4}')
    AVAILABLE_SPACE_GB=$(df -BG "$WAREHOUSE_DIR" | awk 'NR==2 {print $4}' | sed 's/G//')

    print_info "Available space: $AVAILABLE_SPACE"

    if [ "$AVAILABLE_SPACE_GB" -gt 100 ]; then
        print_success "Sufficient disk space available (>100GB)"
    elif [ "$AVAILABLE_SPACE_GB" -gt 50 ]; then
        print_warning "Low disk space (50-100GB). May not be enough for all models"
    else
        print_error "Insufficient disk space (<50GB). Need at least 100GB"
    fi
fi

# Check Docker disk usage
print_info "Docker disk usage:"
docker system df

# ============================================================================
# Summary
# ============================================================================
print_header "Verification Summary"

echo -e "${GREEN}Passed:   $PASSED${NC}"
echo -e "${YELLOW}Warnings: $WARNINGS${NC}"
echo -e "${RED}Failed:   $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    if [ $WARNINGS -eq 0 ]; then
        echo -e "${GREEN}╔═══════════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${GREEN}║  ✅ All checks passed! Ready for deployment.                     ║${NC}"
        echo -e "${GREEN}╚═══════════════════════════════════════════════════════════════════╝${NC}"
        echo ""
        echo -e "${BLUE}Next steps:${NC}"
        echo "  1. Review any warnings above"
        echo "  2. Build images: ${YELLOW}docker compose build${NC}"
        echo "  3. Start services: ${YELLOW}docker compose up -d${NC}"
        echo "  4. Check logs: ${YELLOW}docker compose logs -f${NC}"
        echo "  5. Run tests: ${YELLOW}node test-ai-services.js${NC}"
    else
        echo -e "${YELLOW}╔═══════════════════════════════════════════════════════════════════╗${NC}"
        echo -e "${YELLOW}║  ⚠️  All critical checks passed, but there are warnings.         ║${NC}"
        echo -e "${YELLOW}╚═══════════════════════════════════════════════════════════════════╝${NC}"
        echo ""
        echo -e "${BLUE}Recommended:${NC}"
        echo "  1. Review and fix warnings above"
        echo "  2. Then proceed with deployment"
    fi
else
    echo -e "${RED}╔═══════════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${RED}║  ❌ Some checks failed. Fix errors before deployment.             ║${NC}"
    echo -e "${RED}╚═══════════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    echo -e "${BLUE}Required actions:${NC}"
    echo "  1. Fix all errors marked with ❌ above"
    echo "  2. Run this script again: ${YELLOW}./verify-deployment.sh${NC}"
    echo "  3. Once all checks pass, proceed with deployment"
fi

echo ""
echo -e "${BLUE}For detailed deployment instructions, see: ${YELLOW}DEPLOYMENT.md${NC}"
echo ""
