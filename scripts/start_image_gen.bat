@echo off
cd /d "%~dp0.."
title DUNGEON MASTER: THE HUNT - local image generation
dir /b models\*.safetensors >nul 2>&1
if errorlevel 1 (
  echo   [!] no image model yet - run scripts\install_image_gen.bat first
  pause
  exit /b 1
)
echo   starting local image generation on 127.0.0.1:7860 ...
python local-services\image-server\sd_server.py
