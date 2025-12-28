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
# Auth:
#   - Recommended: SSH key auth (no passwords in repo)
#   - Optional: set `SSHPASS` to use sshpass non-interactively
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
#   Config: depends on systemd (-ngl tuned for VRAM)
# =============================================================================

GPU_HOST="${GPU_HOST:-live4.dothost.net}"
GPU_PORT="${GPU_PORT:-2285}"
GPU_USER="${GPU_USER:-neojustin}"

# Optional: provide password via environment (DO NOT hardcode it here).
# export SSHPASS='...'

# Execute SSH command or open interactive session
if [ -n "$1" ]; then
    if [ -n "${SSHPASS:-}" ] && command -v sshpass >/dev/null 2>&1; then
        # Run command (password-based)
        sshpass -e ssh -p "$GPU_PORT" "$GPU_USER@$GPU_HOST" "$@"
    else
        # Run command (key-based / interactive)
        ssh -p "$GPU_PORT" "$GPU_USER@$GPU_HOST" "$@"
    fi
else
    if [ -n "${SSHPASS:-}" ] && command -v sshpass >/dev/null 2>&1; then
        # Interactive session (password-based)
        sshpass -e ssh -p "$GPU_PORT" "$GPU_USER@$GPU_HOST"
    else
        # Interactive session (key-based / interactive)
        ssh -p "$GPU_PORT" "$GPU_USER@$GPU_HOST"
    fi
fi
