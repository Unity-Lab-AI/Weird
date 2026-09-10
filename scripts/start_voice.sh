#!/usr/bin/env bash
cd "$(dirname "$0")/.."
if [ ! -f "models/whisper-small/model.bin" ]; then
  echo "  [!] no listener model yet - run scripts/install_voice.sh first"
  exit 1
fi
echo "  starting local speech-to-text on 127.0.0.1:7861 ..."
exec python3 local-services/voice-server/voice_server.py
