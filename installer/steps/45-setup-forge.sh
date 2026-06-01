#!/usr/bin/env bash
# 45-setup-forge.sh — Clone and set up sabbk-forge (the Pi agent workshop)
# Part of the Sabbk installer sequence.
set -euo pipefail
source "$(dirname "$0")/../lib/log.sh"

STEP="45-setup-forge"
STATE_DIR="$(dirname "$0")/../state"
FORGE_DIR="${SABBK_ROOT:-$HOME}/sabbk-forge"

if [ -f "$STATE_DIR/$STEP.done" ]; then
  log_skip "$STEP (already done)"
  exit 0
fi

log_step "$STEP: Setting up sabbk-forge"

# Clone if not present
if [ ! -d "$FORGE_DIR/.git" ]; then
  log_info "Cloning sabbk-forge..."
  git clone https://github.com/Samirius/sabbk-forge.git "$FORGE_DIR" 2>/dev/null || {
    log_warn "Could not clone sabbk-forge (private repo — may need manual clone or SSH access)"
    log_info "To clone manually: git clone git@github.com:Samirius/sabbk-forge.git $FORGE_DIR"
  }
else
  log_info "sabbk-forge already cloned, pulling latest..."
  (cd "$FORGE_DIR" && git pull) 2>/dev/null || true
fi

# Install dependencies if cloned
if [ -f "$FORGE_DIR/package.json" ]; then
  log_info "Installing pi and dependencies..."
  (cd "$FORGE_DIR" && npm ci) 2>/dev/null || log_warn "npm ci failed — run manually in $FORGE_DIR"
fi

# Validate
if [ -d "$FORGE_DIR/jigs" ]; then
  log_info "Running forge jigs..."
  (cd "$FORGE_DIR" && bash jigs/run-all.sh) 2>/dev/null || log_warn "Jigs failed — forge may need pi installed first"
fi

# Done
mkdir -p "$STATE_DIR"
touch "$STATE_DIR/$STEP.done"
log_ok "$STEP: sabbk-forge ready at $FORGE_DIR"
