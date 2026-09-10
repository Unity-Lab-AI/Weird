#!/usr/bin/env bash
cd "$(dirname "$0")/.."
if ! ls models/*.safetensors >/dev/null 2>&1; then
  echo "  [!] no image model yet - run scripts/install_image_gen.sh first"
  exit 1
fi
echo "  starting local image generation on 127.0.0.1:7860 ..."
exec python3 local-services/image-server/sd_server.py
