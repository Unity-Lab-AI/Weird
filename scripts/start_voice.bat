@echo off
cd /d "%~dp0.."
title DUNGEON MASTER: THE HUNT - local voice-in (STT)
if not exist "models\whisper-small\model.bin" (
  echo   [!] no listener model yet - run scripts\install_voice.bat first
  pause
  exit /b 1
)
echo   starting local speech-to-text on 127.0.0.1:7861 ...
python local-services\voice-server\voice_server.py
