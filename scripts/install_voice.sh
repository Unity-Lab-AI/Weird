#!/usr/bin/env bash
# install_voice.sh - one-time local speech-to-text setup.
# TTS stays in the browser via Kokoro - only STT (faster-whisper) is installed.
set -u
cd "$(dirname "$0")/.."

echo
echo "  LOCAL SPEECH-TO-TEXT - one-time setup"
echo "  ========================================================="
echo "  Downloads about ~480MB: the whisper-small listener model."
echo "  TTS stays in the browser via Kokoro (no local install)."
echo

if ! command -v python3 >/dev/null 2>&1; then
  echo "  [!] python3 is not installed or not on PATH."
  exit 1
fi

echo "  [*] installing faster-whisper + numpy..."
python3 -m pip install --upgrade faster-whisper numpy || {
  echo "  [!] pip install failed"; exit 1; }

# CTranslate2 needs these; torch's own copies are not visible to it. If the
# visitor has no GPU the server falls back to CPU int8 automatically.
echo "  [*] installing CUDA runtime libraries for the listener..."
python3 -m pip install --upgrade nvidia-cublas-cu12 nvidia-cudnn-cu12 || {
  echo "  [!] CUDA libraries failed (non-fatal - CPU fallback available)."; }

if [ ! -f "models/whisper-small/model.bin" ]; then
  echo "  [*] downloading the listener (~480MB)..."
  # local_dir_use_symlinks=False - see the Windows script header for context.
  python3 -c "from huggingface_hub import snapshot_download; snapshot_download('Systran/faster-whisper-small', local_dir='models/whisper-small', local_dir_use_symlinks=False)" || {
    echo "  [!] listener download failed - run this again."; exit 1; }
else
  echo "  [*] the listener is already here."
fi

echo
echo "  [ok] voice setup complete. Run scripts/start_voice.sh"
echo "       to start the server on 127.0.0.1:7861."
echo
