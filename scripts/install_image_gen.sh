#!/usr/bin/env bash
# install_image_gen.sh - one-time local image generation setup.
# Installs the python side and downloads one uncensored checkpoint.
# Everything stays on this machine after this runs.
set -u
cd "$(dirname "$0")/.."

echo
echo "  LOCAL IMAGE GENERATION - one-time setup"
echo "  =========================================================="
echo "  Installs: torch (CUDA), diffusers, and a ~2.1GB uncensored"
echo "  checkpoint. Nothing is downloaded at render time afterwards."
echo

if ! command -v python3 >/dev/null 2>&1; then
  echo "  [!] python3 is not installed or not on PATH."
  exit 1
fi

# Pinned deliberately: diffusers 0.40 demands huggingface-hub<1.0 in its own
# guard while its code imports a hub-1.0 symbol — an internally inconsistent
# release that fails at import. 0.35.1 + hub 0.36 is verified working here.
echo "  [*] python packages..."
python3 -m pip install --upgrade "diffusers==0.35.1" "huggingface-hub>=0.30.0,<1.0" accelerate safetensors transformers || {
  echo "  [!] pip install failed"; exit 1; }

if ! python3 -c "import torch" >/dev/null 2>&1; then
  echo "  [*] torch (CUDA 11.8 build)..."
  python3 -m pip install torch --index-url https://download.pytorch.org/whl/cu118 || {
    echo "  [!] torch install failed - see https://pytorch.org/get-started/locally/"; exit 1; }
fi
python3 - <<'PY'
import torch
print(f"  [ok] torch {torch.__version__} · cuda available: {torch.cuda.is_available()}")
PY

mkdir -p models
if ls models/*.safetensors >/dev/null 2>&1; then
  echo "  [ok] a checkpoint is already in models/"
else
  echo "  [*] downloading Realistic Vision V5.1 (~2.1GB, uncensored, ungated)..."
  curl -L --fail -o models/realistic-vision-v51.safetensors \
    "https://huggingface.co/SG161222/Realistic_Vision_V5.1_noVAE/resolve/main/Realistic_Vision_V5.1_fp16-no-ema.safetensors" || {
      echo "  [!] download failed - drop any .safetensors into models/ by hand"; exit 1; }
fi

echo
echo "  [ok] done. Any other .safetensors dropped into models/ is picked up"
echo "       automatically (first by name). Run scripts/start_image_gen.sh"
echo "       to start the server on 127.0.0.1:7860."
echo
