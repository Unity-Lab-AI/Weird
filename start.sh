#!/usr/bin/env bash
# DUNGEON MASTER: THE HUNT — Mac/Linux local launcher.
# Auto-installs + auto-starts every local backend (Ollama, local SD, local voice
# STT) so the visitor never has to open a second terminal. Kokoro TTS still runs
# in the browser. No cloud, no API keys.
set -e

cd "$(dirname "$0")"
PROJECT_DIR="$(pwd)"

echo
echo "===================================="
echo "  DUNGEON MASTER: THE HUNT - local launcher"
echo "===================================="
echo
echo "Project: $PROJECT_DIR"
echo

# Every backend runs LOCAL: Ollama for chat, local SD for images (this launcher
# auto-starts it), local faster-whisper for STT (auto-started too), Kokoro in the
# browser for TTS. No cloud, no API keys, no env sync — the .env->js/env.local.js
# step that used to sync Pollinations credentials is gone because nothing needs one.

port_in_use() {
  local port="$1"
  (exec 3<>/dev/tcp/127.0.0.1/"$port") >/dev/null 2>&1
}

# --- Ollama check + auto-start ----------------------------------------
echo "[1/4] Checking Ollama..."
if command -v ollama >/dev/null 2>&1; then
  echo "  + Ollama found."
  export OLLAMA_ORIGINS="*"

  # Only launch if PORT 11434 is actually free. Test the TCP port, not just an HTTP ping: Ollama
  # auto-starts as a background service that already OWNS the port, so an HTTP /api/tags check can
  # transiently fail and trick us into starting a SECOND `ollama serve` that dies with
  # "bind: address already in use". A successful connect means something is already listening.
  if port_in_use 11434; then
    echo "  + Ollama already running on localhost:11434 - not starting a second instance."
  else
    echo "  + Port 11434 is free - launching Ollama in the background..."
    ( OLLAMA_ORIGINS="*" nohup ollama serve >/tmp/dmth-ollama.log 2>&1 & )
    sleep 4
  fi
else
  echo "  X Ollama not found on PATH."
  echo "  Download from https://ollama.com/download before girls can talk."
fi
echo

# --- Local SD image server (auto-install + auto-start) ----------------
echo "[2/4] Local Stable Diffusion image server..."
if port_in_use 7860; then
  echo "  + SD server already running on 127.0.0.1:7860 - reusing."
elif [ ! -x "$PROJECT_DIR/scripts/_auto_setup_image_gen.sh" ] && [ ! -f "$PROJECT_DIR/scripts/_auto_setup_image_gen.sh" ]; then
  echo "  ! scripts/_auto_setup_image_gen.sh missing - skipping SD auto-start."
else
  echo "  + Launching SD auto-setup + server in the background (first run downloads ~2GB)..."
  echo "    Progress: tail -f /tmp/dmth-sd-server.log"
  ( nohup bash "$PROJECT_DIR/scripts/_auto_setup_image_gen.sh" >/tmp/dmth-sd-server.log 2>&1 & )
fi
echo

# --- Local voice server (STT) auto-install + auto-start ---------------
echo "[3/4] Local voice server (speech-to-text)..."
if port_in_use 7861; then
  echo "  + Voice server already running on 127.0.0.1:7861 - reusing."
elif [ ! -x "$PROJECT_DIR/scripts/_auto_setup_voice.sh" ] && [ ! -f "$PROJECT_DIR/scripts/_auto_setup_voice.sh" ]; then
  echo "  ! scripts/_auto_setup_voice.sh missing - skipping voice auto-start."
else
  echo "  + Launching voice auto-setup + server in the background (first run downloads ~480MB)..."
  echo "    Progress: tail -f /tmp/dmth-voice-server.log"
  ( nohup bash "$PROJECT_DIR/scripts/_auto_setup_voice.sh" >/tmp/dmth-voice-server.log 2>&1 & )
fi
echo

# --- Find a static server --------------------------------------------
echo "[4/4] Finding a local web server..."
SERVER_CMD=""
SERVER_LABEL=""

if command -v python3 >/dev/null 2>&1; then
  if [ -f "$PROJECT_DIR/scripts/serve.py" ]; then
    SERVER_CMD="python3 scripts/serve.py 9535"
    SERVER_LABEL="Python 3 no-cache server"
  else
    SERVER_CMD="python3 -m http.server 9535"
    SERVER_LABEL="Python 3 http.server"
  fi
elif command -v python >/dev/null 2>&1; then
  if [ -f "$PROJECT_DIR/scripts/serve.py" ]; then
    SERVER_CMD="python scripts/serve.py 9535"
    SERVER_LABEL="Python no-cache server"
  else
    SERVER_CMD="python -m http.server 9535"
    SERVER_LABEL="Python http.server"
  fi
elif command -v npx >/dev/null 2>&1; then
  SERVER_CMD="npx --yes http-server . -p 9535 -c-1 --cors"
  SERVER_LABEL="Node npx http-server"
elif command -v php >/dev/null 2>&1; then
  SERVER_CMD="php -S localhost:9535"
  SERVER_LABEL="PHP built-in server"
else
  echo
  echo "  X No local web server found."
  echo "  Install ONE of these so the game can be served over HTTP:"
  echo "    - Python 3:  https://python.org/downloads/"
  echo "    - Node.js:   https://nodejs.org/"
  echo "    - PHP:       brew install php  (Mac) or apt install php (Linux)"
  echo
  exit 1
fi

echo "  + Using: $SERVER_LABEL"
echo

# --- Open browser + start server -------------------------------------
echo "Starting web server on http://localhost:9535"
echo "Opening browser in 2 seconds..."
echo

( sleep 2
  if command -v xdg-open >/dev/null 2>&1; then
    xdg-open http://localhost:9535/index.html
  elif command -v open >/dev/null 2>&1; then
    open http://localhost:9535/index.html
  fi ) &

echo "===================================================="
echo "  Server running at http://localhost:9535"
echo "  Landing: http://localhost:9535/index.html"
echo "  Game:    http://localhost:9535/game.html"
echo "  Ctrl-C to stop the web server."
echo "  (Ollama / SD / voice servers each run as background"
echo "   processes; logs at /tmp/dmth-*.log.)"
echo "===================================================="
echo

exec $SERVER_CMD
