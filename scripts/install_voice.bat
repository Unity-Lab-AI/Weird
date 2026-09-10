@echo off
REM ===========================================================================
REM  install_voice.bat - local speech-to-text (STT), one time.
REM
REM  Installs faster-whisper (speech-to-text). TTS is intentionally NOT here -
REM  Kokoro-js handles voice-out in the browser, no local install needed.
REM
REM  TWO TRAPS ARE HANDLED HERE AND BOTH COST REAL TIME TO FIND:
REM
REM  1. faster-whisper does NOT use torch's CUDA. It runs on CTranslate2, which
REM     resolves cuBLAS and cuDNN by name at first inference - so a machine with
REM     working torch still fails with "cublas64_12.dll is not found". The
REM     nvidia-* wheels below provide those DLLs; voice_server.py puts their bin
REM     folders on PATH at start up.
REM
REM  2. The HuggingFace cache SYMLINKS its blobs, and creating a symlink on
REM     Windows needs a privilege a normal account does not have - it dies with
REM     "WinError 1314". HF_HUB_DISABLE_SYMLINKS is not honoured by every
REM     version, so the model is fetched into a plain folder instead.
REM ===========================================================================
setlocal
cd /d "%~dp0.."
title DUNGEON MASTER: THE HUNT - install local voice-in

echo.
echo   LOCAL SPEECH-TO-TEXT - one-time setup
echo   =========================================================
echo   Downloads about ~480MB: the whisper-small listener model.
echo   TTS stays in the browser via Kokoro (no local install).
echo.

where python >nul 2>&1
if errorlevel 1 (
  echo   [!] python is not installed or not on PATH
  echo       https://www.python.org/downloads/   ^(tick "Add python.exe to PATH"^)
  exit /b 1
)

echo   [*] installing faster-whisper + numpy...
python -m pip install --upgrade faster-whisper numpy
if errorlevel 1 (
  echo   [!] pip install failed - check the connection and run this again.
  exit /b 1
)

REM CTranslate2 needs these; torch's own copies are not visible to it.
REM (No-op if the visitor has no GPU - the server falls back to CPU int8.)
echo   [*] installing CUDA runtime libraries for the listener...
python -m pip install --upgrade nvidia-cublas-cu12 nvidia-cudnn-cu12
if errorlevel 1 (
  echo   [!] CUDA libraries failed to install ^(non-fatal - CPU fallback available^).
)

if not exist "models\whisper-small\model.bin" (
  echo   [*] downloading the listener ^(~480MB^)...
  REM local_dir_use_symlinks=False - see trap 2 in the header.
  python -c "from huggingface_hub import snapshot_download; snapshot_download('Systran/faster-whisper-small', local_dir='models/whisper-small', local_dir_use_symlinks=False)"
  if errorlevel 1 (
    echo   [!] listener download failed - run this again.
    exit /b 1
  )
) else (
  echo   [*] the listener is already here.
)

echo.
echo   [ok] voice setup complete. Run scripts\start_voice.bat
echo        to start the server on 127.0.0.1:7861.
echo.
endlocal
