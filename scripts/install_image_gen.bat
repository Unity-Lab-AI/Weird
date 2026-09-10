@echo off
setlocal
cd /d "%~dp0.."
title DUNGEON MASTER: THE HUNT - install local image generation

echo.
echo   LOCAL IMAGE GENERATION - one-time setup
echo   ==========================================================
echo   Installs the python side and downloads one uncensored
echo   checkpoint. Nothing is downloaded at render time afterwards
echo   and nothing ever leaves this machine.
echo.

where python >nul 2>&1
if errorlevel 1 (
  echo   [!] python is required and must be on PATH.
  echo       https://www.python.org/downloads/   ^(tick "Add python.exe to PATH"^)
  pause
  exit /b 1
)

REM Pinned deliberately: diffusers 0.40 demands huggingface-hub^<1.0 in its own
REM guard while its code imports a hub-1.0 symbol - an internally inconsistent
REM release that fails at import. 0.35.1 + hub 0.36 is verified working here.
echo   [*] python packages...
python -m pip install --upgrade "diffusers==0.35.1" "huggingface-hub>=0.30.0,<1.0" accelerate safetensors transformers
if errorlevel 1 (
  echo   [!] pip install failed
  pause
  exit /b 1
)

python -c "import torch" >nul 2>&1
if errorlevel 1 (
  echo   [*] torch with CUDA ^(~2.5GB^)...
  python -m pip install torch --index-url https://download.pytorch.org/whl/cu118
)
python -c "import torch;print('  [ok] torch',torch.__version__,'| cuda:',torch.cuda.is_available())"

if not exist "models" mkdir models
dir /b models\*.safetensors >nul 2>&1
if errorlevel 1 (
  echo   [*] downloading Realistic Vision V5.1 ^(~2.1GB, uncensored, ungated^)...
  curl -L --fail -o "models\realistic-vision-v51.safetensors" "https://huggingface.co/SG161222/Realistic_Vision_V5.1_noVAE/resolve/main/Realistic_Vision_V5.1_fp16-no-ema.safetensors"
  if errorlevel 1 (
    echo   [!] download failed - drop any .safetensors into models\ by hand
    pause
    exit /b 1
  )
) else (
  echo   [ok] a checkpoint is already in models\
)

echo.
echo   [ok] done. Any other .safetensors dropped into models\ is picked up
echo        automatically ^(first by name^). Run scripts\start_image_gen.bat
echo        to start the server on 127.0.0.1:7860.
echo.
pause
endlocal
