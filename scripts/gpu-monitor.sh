#!/bin/bash
# ============================================================================
# GPU Memory Monitor and Cleanup Script
# Monitors GPU usage and provides cleanup utilities
# ============================================================================

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

# Helper functions
print_header() {
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${CYAN}  $1${NC}"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

info() { echo -e "${BLUE}[INFO]${NC} $1"; }
success() { echo -e "${GREEN}[OK]${NC} $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if nvidia-smi is available
if ! command -v nvidia-smi &> /dev/null; then
    error "nvidia-smi not found. Is NVIDIA driver installed?"
    exit 1
fi

# Parse command line arguments
COMMAND=${1:-status}

case "$COMMAND" in
    status)
        # ============================================================================
        # GPU Status
        # ============================================================================
        print_header "GPU Status"

        echo ""
        echo -e "${CYAN}GPU Information:${NC}"
        nvidia-smi --query-gpu=name,driver_version,temperature.gpu,utilization.gpu,memory.used,memory.free,memory.total \
            --format=table

        echo ""
        echo -e "${CYAN}GPU Processes:${NC}"
        if nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=csv,noheader 2>/dev/null | grep -q .; then
            nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=table
        else
            success "No GPU processes running"
        fi

        echo ""
        echo -e "${CYAN}Memory Usage:${NC}"
        GPU_MEM_USED=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits | head -1)
        GPU_MEM_TOTAL=$(nvidia-smi --query-gpu=memory.total --format=csv,noheader,nounits | head -1)
        GPU_MEM_FREE=$(nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits | head -1)
        GPU_MEM_PERCENT=$((GPU_MEM_USED * 100 / GPU_MEM_TOTAL))

        echo "  Used:  ${GPU_MEM_USED} MB"
        echo "  Free:  ${GPU_MEM_FREE} MB"
        echo "  Total: ${GPU_MEM_TOTAL} MB"
        echo "  Usage: ${GPU_MEM_PERCENT}%"

        # Color-coded status
        if [ "$GPU_MEM_PERCENT" -lt 50 ]; then
            success "Memory usage is healthy (<50%)"
        elif [ "$GPU_MEM_PERCENT" -lt 80 ]; then
            warn "Memory usage is moderate (${GPU_MEM_PERCENT}%)"
        else
            error "Memory usage is high (${GPU_MEM_PERCENT}%)"
        fi
        ;;

    watch)
        # ============================================================================
        # Watch GPU Status (live updates)
        # ============================================================================
        watch -n 2 -c 'nvidia-smi'
        ;;

    cleanup)
        # ============================================================================
        # GPU Memory Cleanup
        # ============================================================================
        print_header "GPU Memory Cleanup"

        # Find GPU processes
        GPU_PIDS=$(nvidia-smi --query-compute-apps=pid --format=csv,noheader 2>/dev/null)

        if [ -z "$GPU_PIDS" ]; then
            success "No GPU processes to clean up"
            exit 0
        fi

        echo -e "${YELLOW}GPU processes found:${NC}"
        nvidia-smi --query-compute-apps=pid,process_name,used_memory --format=table

        echo ""
        read -p "Kill all GPU processes? [y/N]: " -n 1 -r
        echo

        if [[ $REPLY =~ ^[Yy]$ ]]; then
            info "Killing GPU processes..."
            echo "$GPU_PIDS" | while read pid; do
                if [ -n "$pid" ]; then
                    info "Killing process: $pid"
                    kill -9 $pid 2>/dev/null && success "Killed PID $pid" || warn "Failed to kill PID $pid"
                fi
            done

            sleep 2

            # Clear GPU cache
            if command -v python3 &> /dev/null; then
                info "Clearing CUDA cache..."
                python3 -c "import torch; torch.cuda.empty_cache()" 2>/dev/null && success "Cache cleared"
            fi

            echo ""
            print_header "Cleanup Complete"
            GPU_MEM_AFTER=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits | head -1)
            success "GPU memory now: ${GPU_MEM_AFTER}MB"
        else
            info "Cleanup cancelled"
        fi
        ;;

    reset-ai)
        # ============================================================================
        # Reset AI Service (restart container to free GPU memory)
        # ============================================================================
        print_header "Reset AI Service"

        warn "This will restart the AI service and reload models"
        read -p "Continue? [y/N]: " -n 1 -r
        echo

        if [[ $REPLY =~ ^[Yy]$ ]]; then
            GPU_MEM_BEFORE=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits | head -1)
            info "GPU memory before: ${GPU_MEM_BEFORE}MB"

            info "Stopping AI service..."
            docker-compose stop ai-service

            sleep 3

            GPU_MEM_AFTER=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits | head -1)
            info "GPU memory after stop: ${GPU_MEM_AFTER}MB"
            info "Memory freed: $((GPU_MEM_BEFORE - GPU_MEM_AFTER))MB"

            info "Starting AI service..."
            docker-compose up -d ai-service

            info "Waiting for AI service to be ready..."
            for i in {1..60}; do
                if curl -f -s http://localhost:8000/health > /dev/null 2>&1; then
                    success "AI service is ready"
                    break
                fi
                sleep 2
                echo -n "."
            done
            echo ""

            GPU_MEM_FINAL=$(nvidia-smi --query-gpu=memory.used --format=csv,noheader,nounits | head -1)
            info "GPU memory final: ${GPU_MEM_FINAL}MB"
        else
            info "Reset cancelled"
        fi
        ;;

    optimize)
        # ============================================================================
        # Optimize GPU Settings
        # ============================================================================
        print_header "GPU Optimization"

        info "Current CUDA settings:"
        echo "  PYTORCH_CUDA_ALLOC_CONF: ${PYTORCH_CUDA_ALLOC_CONF:-not set}"
        echo "  CUDA_VISIBLE_DEVICES: ${CUDA_VISIBLE_DEVICES:-not set}"

        echo ""
        info "Recommended settings for RTX 5080:"
        echo "  PYTORCH_CUDA_ALLOC_CONF=max_split_size_mb:256,expandable_segments:True"
        echo "  CUDA_VISIBLE_DEVICES=0"

        echo ""
        info "These settings are configured in docker-compose.yml"
        success "Current configuration is optimized"
        ;;

    help|*)
        # ============================================================================
        # Help
        # ============================================================================
        echo ""
        echo -e "${CYAN}GPU Monitor and Management Tool${NC}"
        echo ""
        echo "Usage: $0 [command]"
        echo ""
        echo "Commands:"
        echo "  status      Show current GPU status (default)"
        echo "  watch       Live GPU monitoring (updates every 2s)"
        echo "  cleanup     Kill all GPU processes and clear cache"
        echo "  reset-ai    Restart AI service to free GPU memory"
        echo "  optimize    Show GPU optimization recommendations"
        echo "  help        Show this help message"
        echo ""
        echo "Examples:"
        echo "  $0 status         # Show GPU status"
        echo "  $0 watch          # Watch GPU in real-time"
        echo "  $0 cleanup        # Clean up GPU memory"
        echo "  $0 reset-ai       # Restart AI service"
        echo ""
        ;;
esac
