@echo off
title DUNGEON MASTER: THE HUNT - local launcher

echo.
echo ====================================
echo   DUNGEON MASTER: THE HUNT - local launcher
echo ====================================
echo.

pushd "%~dp0"
set "PROJECT_DIR=%CD%"
echo Project: %PROJECT_DIR%
echo.

REM Every backend runs LOCAL: Ollama for chat, local SD for images (this launcher
REM auto-starts it), local faster-whisper for STT (auto-started too), Kokoro in the
REM browser for TTS. No cloud, no API keys, no env sync — the .env->js/env.local.js
REM step that used to sync cloud credentials is gone because nothing needs one.

REM === STEP 1: Ollama check + auto-start ============================
echo [1/4] Checking Ollama...

where ollama >nul 2>&1
if errorlevel 1 (
    echo   X Ollama not found on PATH.
    echo.
    echo   Download from https://ollama.com/download and install,
    echo   OR the landing page will show install instructions.
    echo.
    echo   Continuing without Ollama - the game still runs,
    echo   but girls won't talk until Ollama is running.
    echo.
    goto :step_sd
)

echo   + Ollama found.
echo   + Setting OLLAMA_ORIGINS=* for browser access
setx OLLAMA_ORIGINS "*" >nul 2>&1
set "OLLAMA_ORIGINS=*"

REM Only launch a server if PORT 11434 is actually free. Testing the TCP port (not just an HTTP
REM ping) is what matters: Ollama on Windows auto-starts as a tray/background service that already
REM OWNS the port, so an HTTP /api/tags check can transiently fail (slow start / no CORS) and trick
REM us into starting a SECOND `ollama serve` that then dies with
REM "bind: Only one usage of each socket address". A TcpClient connect succeeds only if something is
REM already listening, so we skip launching when the port is taken.
powershell -NoProfile -Command "try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1',11434); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if errorlevel 1 (
    echo   + Port 11434 is free - launching Ollama in a new window...
    start "Ollama serve" cmd /k "set OLLAMA_ORIGINS=* && ollama serve"
    echo   + Waiting 4 seconds for Ollama to come up...
    powershell -NoProfile -Command "Start-Sleep -Seconds 4" >nul 2>&1
) else (
    echo   + Ollama already running on localhost:11434 - not starting a second instance.
)

echo.

:step_sd
REM === STEP 2: Local SD image server (auto-install + auto-start) ====
echo [2/4] Local Stable Diffusion image server...

REM Skip if port 7860 already has a listener — user or a previous launcher already started it.
powershell -NoProfile -Command "try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1',7860); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 (
    echo   + SD server already running on 127.0.0.1:7860 - reusing.
    goto :step_voice
)

REM Launch the wrapper in a new window. The wrapper checks deps + checkpoint,
REM runs install_image_gen.bat if either is missing, then starts sd_server.py.
REM All output stays in the wrapper's window so the user can watch progress.
if not exist "%PROJECT_DIR%\scripts\_auto_setup_image_gen.bat" (
    echo   ! scripts\_auto_setup_image_gen.bat missing - skipping SD auto-start.
    goto :step_voice
)
echo   + Launching SD auto-setup + server in a new window ^(first run downloads ~2GB^)...
REM `start /D "%PROJECT_DIR%"` opens the new window with the project root as CWD, so the
REM auto-setup script can use a relative path (no cross-shell escape headache with quotes
REM around a Windows path inside a cmd /k arg — the previous `\"...\"` form passed through
REM literally and cmd reported the whole thing as "not recognized as an internal or
REM external command"). The title stays first so start doesn't interpret /D as the title.
start "SD image gen (127.0.0.1:7860)" /D "%PROJECT_DIR%" cmd /k call scripts\_auto_setup_image_gen.bat

echo.

:step_voice
REM === STEP 3: Local voice server (auto-install + auto-start) =======
echo [3/4] Local voice server ^(speech-to-text^)...

powershell -NoProfile -Command "try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('127.0.0.1',7861); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 (
    echo   + Voice server already running on 127.0.0.1:7861 - reusing.
    goto :find_server
)

if not exist "%PROJECT_DIR%\scripts\_auto_setup_voice.bat" (
    echo   ! scripts\_auto_setup_voice.bat missing - skipping voice auto-start.
    goto :find_server
)
echo   + Launching voice auto-setup + server in a new window ^(first run downloads ~480MB^)...
start "Voice STT (127.0.0.1:7861)" /D "%PROJECT_DIR%" cmd /k call scripts\_auto_setup_voice.bat

echo.

:find_server
REM === STEP 4: Find a local static server =============================
echo [4/4] Finding a local web server...

set "SERVER_CMD="
set "SERVER_LABEL="

where python >nul 2>&1
if not errorlevel 1 (
    if exist "%PROJECT_DIR%\scripts\serve.py" (
        set "SERVER_CMD=python scripts\serve.py 9535"
        set "SERVER_LABEL=Python no-cache server"
    ) else (
        set "SERVER_CMD=python -m http.server 9535"
        set "SERVER_LABEL=Python http.server"
    )
    goto :have_server
)

where py >nul 2>&1
if not errorlevel 1 (
    if exist "%PROJECT_DIR%\scripts\serve.py" (
        set "SERVER_CMD=py scripts\serve.py 9535"
        set "SERVER_LABEL=Python launcher (no-cache server)"
    ) else (
        set "SERVER_CMD=py -m http.server 9535"
        set "SERVER_LABEL=Python launcher"
    )
    goto :have_server
)

where npx >nul 2>&1
if not errorlevel 1 (
    set "SERVER_CMD=npx --yes http-server . -p 9535 -c-1 --cors"
    set "SERVER_LABEL=Node npx http-server"
    goto :have_server
)

where php >nul 2>&1
if not errorlevel 1 (
    set "SERVER_CMD=php -S localhost:9535"
    set "SERVER_LABEL=PHP built-in server"
    goto :have_server
)

echo.
echo   X No local web server found.
echo.
echo   Install ONE of these so the game can be served over HTTP:
echo     - Python 3:  https://python.org/downloads/  (recommended, smallest)
echo     - Node.js:   https://nodejs.org/
echo     - PHP:       https://windows.php.net/download/
echo.
echo   (Opening a local .html file directly does NOT work -
echo    browsers block fetch() / modules / etc. on file:// URLs.)
echo.
pause
popd
exit /b 1

:have_server
echo   + Using: %SERVER_LABEL%
echo.

REM === Open browser + start server ==================================
echo Starting web server on http://localhost:9535
echo Opening browser in 2 seconds...
echo.
echo This window runs the game's static server. Close it or hit Ctrl+C to stop.
echo Ollama / SD / voice servers each run in their own windows opened above.
echo.

start "" /min cmd /c "powershell -NoProfile -Command Start-Sleep -Seconds 2 && start http://localhost:9535/index.html"

echo ====================================================
echo   Server running at http://localhost:9535
echo   Landing page: http://localhost:9535/index.html
echo   Game:         http://localhost:9535/game.html
echo ====================================================
echo.

%SERVER_CMD%
set "SERVER_EXIT=%ERRORLEVEL%"

echo.
if not "%SERVER_EXIT%"=="0" (
    echo Server exited with code %SERVER_EXIT%.
) else (
    echo Server stopped.
)
echo.
popd
pause
exit /b %SERVER_EXIT%
