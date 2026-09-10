#!/usr/bin/env bash
# _auto_setup_image_gen.sh — internal wrapper called by start.sh.
# Runs install_image_gen.sh if deps/checkpoint are missing, then launches
# sd_server.py. Runs in its own process (backgrounded from start.sh) so the
# user sees no terminal — logs go to /tmp/dmth-sd-server.log.
set -u

HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/.."
PROJECT_DIR="$(pwd)"

PY_CMD=""
if command -v python3 >/dev/null 2>&1; then PY_CMD="python3"; fi
if [ -z "$PY_CMD" ] && command -v python >/dev/null 2>&1; then PY_CMD="python"; fi
if [ -z "$PY_CMD" ]; then
  echo "  [!] Python 3 not found on PATH."
  exit 1
fi

if ! "$PY_CMD" -c "import diffusers, torch" >/dev/null 2>&1; then
  echo "SD Python deps not installed — running install_image_gen.sh..."
  bash "$HERE/install_image_gen.sh" || { echo "  [!] Install failed."; exit 1; }
fi

if ! ls "$PROJECT_DIR/models"/*.safetensors >/dev/null 2>&1; then
  echo "No .safetensors in models/ — re-running install_image_gen.sh to download..."
  bash "$HERE/install_image_gen.sh" || { echo "  [!] Checkpoint download failed."; exit 1; }
fi

echo "Launching SD server on 127.0.0.1:7860..."
exec "$PY_CMD" "$PROJECT_DIR/local-services/image-server/sd_server.py"
