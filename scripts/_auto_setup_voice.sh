#!/usr/bin/env bash
# _auto_setup_voice.sh — internal wrapper called by start.sh.
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

if ! "$PY_CMD" -c "import faster_whisper, numpy" >/dev/null 2>&1; then
  echo "Voice Python deps not installed — running install_voice.sh..."
  bash "$HERE/install_voice.sh" || { echo "  [!] Install failed."; exit 1; }
fi

if [ ! -f "$PROJECT_DIR/models/whisper-small/model.bin" ]; then
  echo "No whisper-small model — re-running install_voice.sh to download..."
  bash "$HERE/install_voice.sh" || { echo "  [!] Model download failed."; exit 1; }
fi

echo "Launching voice server on 127.0.0.1:7861..."
exec "$PY_CMD" "$PROJECT_DIR/local-services/voice-server/voice_server.py"
