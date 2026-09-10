@echo off
REM ============================================================
REM  _auto_setup_image_gen.bat — internal wrapper called by start.bat
REM
REM  Launched in its own cmd window. Runs the install if deps or
REM  the checkpoint are missing, then starts sd_server.py in the
REM  same window so the user can see the server's log output.
REM
REM  Not intended for direct user invocation — use install_image_gen.bat
REM  + start_image_gen.bat manually if you want the two split up.
REM ============================================================
setlocal
cd /d "%~dp0.."
title DUNGEON MASTER: THE HUNT - local SD image gen

REM Prefer `python`, fall back to `py` (Windows launcher). Persist the winner
REM into PY_CMD so both the deps check and the server launch use the same one.
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
echo       Install from https://python.org/downloads/ ^(tick "Add python.exe to PATH"^) and re-launch start.bat.
pause
exit /b 1

:have_py
echo Using %PY_CMD%.
echo.

REM Check deps (diffusers + torch).
%PY_CMD% -c "import diffusers, torch" >nul 2>&1
if errorlevel 1 (
    echo Python deps not installed - running install_image_gen.bat...
    call "%~dp0install_image_gen.bat"
    if errorlevel 1 (
        echo   [!] Install failed. See errors above.
        pause
        exit /b 1
    )
)

REM Check for a checkpoint. install_image_gen.bat downloads Realistic Vision V5.1
REM if none is present, so if deps installed but the checkpoint didn't land,
REM re-invoke install_image_gen.bat to fetch it.
dir /b models\*.safetensors >nul 2>&1
if errorlevel 1 (
    echo No .safetensors in models/ - re-running install_image_gen.bat to download...
    call "%~dp0install_image_gen.bat"
    if errorlevel 1 (
        echo   [!] Checkpoint download failed. Drop any .safetensors into models/ manually.
        pause
        exit /b 1
    )
)

echo.
echo ============================================================
echo   Launching SD server on 127.0.0.1:7860
echo   Close this window or hit Ctrl+C to stop image generation.
echo ============================================================
echo.

%PY_CMD% local-services\image-server\sd_server.py
endlocal
