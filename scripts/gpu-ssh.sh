#!/bin/bash
# =============================================================================
# GPU Server SSH Helper Script
# =============================================================================
# This script connects to the GPU server (live4.dothost.net:2285) for
# llama.cpp model inference.
#
# Usage:
#   ./scripts/gpu-ssh.sh "command to run"
#   ./scripts/gpu-ssh.sh   # Opens interactive SSH session
#
# Server Info:
#   Host: live4.dothost.net
#   Port: 2285
#   User: neojustin
#   GPU:  NVIDIA GeForce GTX 1050 Ti (4GB VRAM)
#   CUDA: 11.5
#   RAM:  16GB
#   Disk: 468GB SSD
#
# llama.cpp Server:
#   URL: http://live4.dothost.net:8080
#   Model: Mistral-7B-Instruct-v0.2 Q4_K_M
#   Config: -ngl 15 (partial GPU offload)
# =============================================================================

GPU_HOST="live4.dothost.net"
GPU_PORT="2285"
GPU_USER="neojustin"
GPU_PASS="NeoJustin007!"

# Create temporary password file (more secure than command line)
PASS_FILE=$(mktemp)
echo "$GPU_PASS" > "$PASS_FILE"
chmod 600 "$PASS_FILE"

# Cleanup function
cleanup() {
    rm -f "$PASS_FILE"
}
trap cleanup EXIT

# Execute SSH command or open interactive session
if [ -n "$1" ]; then
    # Run command
    sshpass -f "$PASS_FILE" ssh -p "$GPU_PORT" \
        -o StrictHostKeyChecking=no \
        -o UserKnownHostsFile=/dev/null \
        "$GPU_USER@$GPU_HOST" "$@"
else
    # Interactive session
    sshpass -f "$PASS_FILE" ssh -p "$GPU_PORT" \
        -o StrictHostKeyChecking=no \
        -o UserKnownHostsFile=/dev/null \
        "$GPU_USER@$GPU_HOST"
fi
