@echo off
REM ============================================================
REM  _auto_setup_voice.bat — internal wrapper called by start.bat
REM
REM  Launched in its own cmd window. Runs install_voice.bat if
REM  deps or the whisper model are missing, then starts
REM  voice_server.py in the same window so the user can see the
REM  server's log output.
REM ============================================================
setlocal
cd /d "%~dp0.."
title DUNGEON MASTER: THE HUNT - local voice-in ^(STT^)

where python >nul 2>&1
if not errorlevel 1 (
    set "PY_CMD=python"
    goto :have_py
)
where py >nul 2>&1
if not errorlevel 1 (
    set "PY_CMD=py"
    goto :have_py
)
echo   [!] Python not found on PATH.
echo       Install from https://python.org/downloads/ and re-launch start.bat.
pause
exit /b 1

:have_py
echo Using %PY_CMD%.
echo.

REM Check deps (faster-whisper + numpy).
%PY_CMD% -c "import faster_whisper, numpy" >nul 2>&1
if errorlevel 1 (
    echo Python deps not installed - running install_voice.bat...
    call "%~dp0install_voice.bat"
    if errorlevel 1 (
        echo   [!] Install failed. See errors above.
        pause
        exit /b 1
    )
)

REM Check for the whisper-small model.
if not exist "models\whisper-small\model.bin" (
    echo No whisper-small model - re-running install_voice.bat to download...
    call "%~dp0install_voice.bat"
    if errorlevel 1 (
        echo   [!] Model download failed.
        pause
        exit /b 1
    )
)

echo.
echo ============================================================
echo   Launching voice server on 127.0.0.1:7861
echo   Close this window or hit Ctrl+C to stop speech-to-text.
echo ============================================================
echo.

%PY_CMD% local-services\voice-server\voice_server.py
endlocal
