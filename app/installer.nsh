; NSIS hooks for the Dungeon Master: The Hunt setup (electron-builder `nsis.include`).
;
; One folder. The app is installed where the wizard is pointed; the Python runtime, Ollama and the models go into
; <that folder>\data on first launch. An update replaces the app files but spares data. A plain uninstall asks
; whether data goes too. Running the setup over an existing install asks: update, uninstall everything, or cancel.

; The app, the Python image/voice servers and Ollama all run from this folder, and any of them holding a file makes
; electron-builder's own "cannot be closed" check fail. installer-stop.ps1 kills the whole lot, waits until the app's
; files can be written, and logs to <folder>\data\logs\setup.log. 64-bit PowerShell (sysnative) sees every process.
!macro dmthStop DIR
  !insertmacro dmthStopScript "${DIR}" ""
!macroend

!macro dmthStopScript DIR FLAGS
  InitPluginsDir
  File "/oname=$PLUGINSDIR\dmth-stop.ps1" "${PROJECT_DIR}\installer-stop.ps1"
  StrCpy $R8 "$WINDIR\sysnative\WindowsPowerShell\v1.0\powershell.exe"
  IfFileExists "$R8" +2 0
    StrCpy $R8 "$SYSDIR\WindowsPowerShell\v1.0\powershell.exe"
  nsExec::Exec '"$R8" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "$PLUGINSDIR\dmth-stop.ps1" -Dir "${DIR}" ${FLAGS}'
  Pop $R9
!macroend

; runs after the old version's uninstaller and before the new files are copied in. The old uninstaller's result is
; logged, never fatal: whatever it left behind is removed and waited out here so the copy lands in a clean folder.
!macro customUnInstallCheck
  ${If} ${Errors}
    DetailPrint "The previous version's uninstaller could not be started; its files are cleared here."
  ${ElseIf} $R0 != 0
    DetailPrint "The previous version's uninstaller returned $R0; its files are cleared here."
  ${EndIf}
  ClearErrors
  !insertmacro dmthStopScript "$INSTDIR" "-Clean"
!macroend

!macro customCheckAppRunning
  !insertmacro dmthStop "$INSTDIR"
!macroend

!macro customInit
  ; an existing per-user install registers its uninstaller and its folder (silent /S = update)
  ReadRegStr $R0 HKCU "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
  ${If} $R0 != ""
    ReadRegStr $R1 HKCU "${INSTALL_REGISTRY_KEY}" "InstallLocation"
    MessageBox MB_YESNOCANCEL|MB_ICONQUESTION "Dungeon Master: The Hunt is already installed in$\r$\n$R1$\r$\n$\r$\nYES    update it (the app is replaced; the models, runtimes and settings in $R1\data stay)$\r$\nNO     uninstall everything, the app and everything it downloaded$\r$\nCANCEL leave it alone" /SD IDYES IDYES dmthUpdate IDNO dmthRemoveAll
    Quit
  dmthRemoveAll:
    ${If} $R1 != ""
      !insertmacro dmthStop "$R1"
      ExecWait '$R0 /S _?=$R1'
      RMDir /r "$R1"
    ${Else}
      ExecWait '$R0 /S'
    ${EndIf}
    MessageBox MB_OK|MB_ICONINFORMATION "Dungeon Master: The Hunt and everything it installed for itself have been removed."
    Quit
  dmthUpdate:
  ${EndIf}
!macroend

; replaces electron-builder's "RMDir /r $INSTDIR": everything in the install folder goes except the data subfolder
!macro customRemoveFiles
  SetOutPath $TEMP
  FindFirst $0 $1 "$INSTDIR\*"
  dmthRmLoop:
    StrCmp $1 "" dmthRmDone
    StrCmp $1 "." dmthRmNext
    StrCmp $1 ".." dmthRmNext
    StrCmp $1 "data" dmthRmNext
    IfFileExists "$INSTDIR\$1\*.*" 0 +3
      RMDir /r "$INSTDIR\$1"
      Goto dmthRmNext
    Delete "$INSTDIR\$1"
  dmthRmNext:
    FindNext $0 $1
    Goto dmthRmLoop
  dmthRmDone:
  FindClose $0
  RMDir "$INSTDIR"
!macroend

; a real uninstall (not the update's internal one) offers to take the downloaded data with it
!macro customUnInit
  !insertmacro dmthStop "$INSTDIR"
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    MessageBox MB_YESNO|MB_ICONQUESTION "Also remove everything Dungeon Master: The Hunt downloaded for itself?$\r$\n$\r$\n$INSTDIR\data$\r$\n(Python runtime, image model, chat model, speech model, logs, generated images; about 20 GB. Cannot be undone.)" /SD IDNO IDNO dmthKeepData
      RMDir /r "$INSTDIR\data"
      RMDir "$INSTDIR"
    dmthKeepData:
  ${endIf}
!macroend

; the wizard copies the app (a few hundred MB); the honest total is what the first-run screen downloads into <folder>\data
!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Dungeon Master: The Hunt"
  !define MUI_WELCOMEPAGE_TEXT "Minimum:$\r$\n  - Windows 10, 64-bit$\r$\n  - NVIDIA GPU, 8 GB VRAM$\r$\n  - 16 GB RAM$\r$\n  - 30 GB free storage$\r$\n$\r$\nRecommended:$\r$\n  - Windows 11, 64-bit$\r$\n  - NVIDIA RTX 30/40/50, 16 GB VRAM$\r$\n  - 32 GB RAM$\r$\n  - 50 GB free storage$\r$\n$\r$\nThis copies the app into the folder you pick next. On first launch it installs what the game runs on into that same folder: a Python runtime, PyTorch, the image model, the chat model and the speech model, about 20 GB. Everything stays on this machine. No NVIDIA GPU: the game still plays as text, without images."
  ; the folder page's own "Space required" only counts the app; this says what the folder really needs
  !define MUI_DIRECTORYPAGE_TEXT_TOP "Pick a folder on a drive with at least 30 GB free (50 GB recommended). The app is a few hundred MB, but on first launch it downloads about 20 GB of runtimes and models into this same folder.$\r$\n$\r$\nMinimum: Windows 10 64-bit, NVIDIA GPU with 8 GB VRAM, 16 GB RAM. Recommended: Windows 11, RTX 30/40/50 with 16 GB VRAM, 32 GB RAM."
  !insertmacro MUI_PAGE_WELCOME
!macroend

; "Space required" on the folder page counts what the folder will really hold (about 30 GB with the first-run
; download), not just the app files, so Windows' own free-space check warns on a drive that is too small
!macro customInstall
  AddSize 31457280
!macroend
