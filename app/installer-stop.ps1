# Setup, updater and uninstaller: stop everything the game runs before any file in the install folder is touched.
# Kills the app, anything whose exe lives under the folder (the Python runtime and Ollama in <folder>\data\runtime),
# python/ollama started with the folder on their command line, and everything those started; then waits until the
# app's files can be written. Never touches the setup or uninstaller running this, and never touches an Ollama that
# runs from somewhere else (the visitor's own). Log: <folder>\data\logs\setup.log
param([Parameter(Mandatory = $true)][string]$Dir, [switch]$Clean)
$ErrorActionPreference = 'SilentlyContinue'
$Dir = $Dir.TrimEnd('\')
$root = $Dir + '\'
$appExe = 'DungeonMasterTheHunt.exe'
$logDir = Join-Path $Dir 'data\logs'
$log = if (Test-Path $logDir) { Join-Path $logDir 'setup.log' } else { Join-Path $env:TEMP 'dmth-setup.log' }
function L($m) { ('{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss.fff'), $m) | Out-File -Append -Encoding utf8 $log }
$me = $PID
$caller = (Get-CimInstance Win32_Process -Filter "ProcessId=$PID").ParentProcessId
function Spared($p) {
  $p.ProcessId -eq $me -or $p.ProcessId -eq $caller -or $p.Name -like 'Uninstall*' -or $p.Name -like 'Au_*' -or
  $p.Name -like 'Un_*' -or $p.Name -like 'old-uninstaller*' -or $p.Name -like 'DungeonMasterTheHunt-Setup*'
}
function Targets {
  $all = @(Get-CimInstance Win32_Process)
  $hit = @{}
  foreach ($p in $all) {
    if (Spared $p) { continue }
    if ($p.Name -eq $appExe -or
        ($p.ExecutablePath -and $p.ExecutablePath.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) -or
        (($p.Name -in 'python.exe', 'pythonw.exe', 'ollama.exe', 'ollama_llama_server.exe') -and $p.CommandLine -and
          $p.CommandLine.IndexOf($root, [StringComparison]::OrdinalIgnoreCase) -ge 0)) { $hit[$p.ProcessId] = $p }
  }
  # a model runner whose server was killed keeps running on its own and can pin the folder; runners of a live
  # server (the visitor's own Ollama) are left alone
  $live = @{}; foreach ($p in $all) { $live[$p.ProcessId] = $p }
  foreach ($p in $all) {
    if ($p.Name -in 'llama-server.exe', 'ollama_llama_server.exe' -and -not (Spared $p)) {
      $par = $live[$p.ParentProcessId]
      if (-not $par -or $par.CreationDate -gt $p.CreationDate) { $hit[$p.ProcessId] = $p }
    }
  }
  # and everything they started, never a setup or uninstaller
  do {
    $grew = $false
    foreach ($p in $all) {
      if (-not $hit.ContainsKey($p.ProcessId) -and $hit.ContainsKey($p.ParentProcessId) -and -not (Spared $p) -and
          $p.CreationDate -ge $hit[$p.ParentProcessId].CreationDate) { $hit[$p.ProcessId] = $p; $grew = $true }
    }
  } while ($grew)
  $hit.Values
}
# a File Explorer window open on the folder holds it open and makes the copy fail: close those windows first
function CloseExplorer {
  try {
    foreach ($w in @((New-Object -ComObject Shell.Application).Windows())) {
      $path = $null
      try { $path = $w.Document.Folder.Self.Path } catch {}
      if ($path -and ($path -eq $Dir -or $path.StartsWith($root, [StringComparison]::OrdinalIgnoreCase))) {
        L "close explorer window: $path"; $w.Quit()
      }
    }
  } catch { L "explorer windows: $($_.Exception.Message)" }
}
L "stop: $Dir"
CloseExplorer
for ($i = 0; $i -lt 60; $i++) {
  $t = @(Targets)
  if ($t.Count -eq 0) { break }
  foreach ($p in $t) {
    if ($i % 10 -eq 0) { L ('kill {0} {1} {2}' -f $p.ProcessId, $p.Name, $p.ExecutablePath) }
    Stop-Process -Id $p.ProcessId -Force
  }
  Start-Sleep -Milliseconds 500
}
foreach ($p in @(Targets)) { L ('STILL RUNNING {0} {1} {2}' -f $p.ProcessId, $p.Name, $p.ExecutablePath) }
# a killed process can hold its files for a moment while the GPU driver lets go: wait until they open for writing
foreach ($f in @((Join-Path $Dir $appExe), (Join-Path $Dir 'resources\app.asar'))) {
  if (-not (Test-Path $f)) { continue }
  for ($i = 0; $i -lt 60; $i++) {
    try { $h = [IO.File]::Open($f, 'Open', 'ReadWrite', 'None'); $h.Close(); break }
    catch { if ($i -eq 0) { L "busy: $f" }; Start-Sleep -Milliseconds 500 }
  }
}
L 'stop: done'
if (-not $Clean) { exit 0 }
# After the old version's uninstaller: a folder it deleted while something still had it open stays "delete pending"
# until that handle closes, and the setup's copy then fails. Remove what is left of the old app and wait until it is
# really gone. Only the app's own names are touched; data and anything else in the folder are never touched.
$names = @($appExe, 'Uninstall Dungeon Master The Hunt.exe', 'uninstallerIcon.ico', 'resources', 'locales', 'resources.pak',
  'chrome_100_percent.pak', 'chrome_200_percent.pak', 'icudtl.dat', 'snapshot_blob.bin', 'v8_context_snapshot.bin',
  'LICENSE.electron.txt', 'LICENSES.chromium.html', 'd3dcompiler_47.dll', 'ffmpeg.dll', 'libEGL.dll', 'libGLESv2.dll',
  'vk_swiftshader.dll', 'vk_swiftshader_icd.json', 'vulkan-1.dll')
# an empty folder that still accepts new files counts as clean; a "delete pending" folder refuses them and is waited out
function Usable($p) {
  if (-not (Test-Path -LiteralPath $p -PathType Container)) { return $false }
  if (@(Get-ChildItem -LiteralPath $p -Force).Count -gt 0) { return $false }
  $probe = Join-Path $p ('.dmth-probe-' + $PID)
  try { [IO.File]::WriteAllText($probe, ''); Remove-Item -LiteralPath $probe -Force; return $true } catch { return $false }
}
function Left { @($names | Where-Object { $p = Join-Path $Dir $_; (Test-Path -LiteralPath $p) -and -not (Usable $p) }) }
L "clean: $Dir"
CloseExplorer
for ($i = 0; $i -lt 120; $i++) {
  $left = @(Left)
  if ($left.Count -eq 0) { break }
  foreach ($n in $left) {
    $p = Join-Path $Dir $n
    if ($i % 10 -eq 0) { L "remove $p" }
    Remove-Item -LiteralPath $p -Recurse -Force
  }
  Start-Sleep -Milliseconds 500
}
foreach ($n in @(Left)) { L "STILL THERE $(Join-Path $Dir $n)" }
L ('clean: done after {0:N1} s' -f ($i * 0.5))
