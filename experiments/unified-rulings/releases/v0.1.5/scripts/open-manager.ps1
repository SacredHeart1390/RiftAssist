param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$appRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCommand) { $nodeExe = $nodeCommand.Source }
else { $nodeExe = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
if (-not (Test-Path -LiteralPath $nodeExe)) { throw 'Node.js 24 LTS is required.' }
$managerScript = Join-Path $appRoot 'src\manager.js'
$recordFile = Join-Path $appRoot 'tmp\manager.json'
$alreadyRunning = $false
if (Test-Path -LiteralPath $recordFile) {
  try {
    $record = Get-Content -LiteralPath $recordFile -Raw | ConvertFrom-Json
    $processInfo = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$record.pid)"
    $alreadyRunning = $processInfo -and $processInfo.CommandLine -and $processInfo.CommandLine.Contains($managerScript) -and ($record.script -eq $managerScript)
  } catch { $alreadyRunning = $false }
}
if (-not $alreadyRunning) {
  # Stop only the recorded legacy process for this exact unified checkout.
  $legacyRecordFile = Join-Path $appRoot 'tmp\local-server.json'
  $expectedServer = Join-Path $appRoot 'src\server.js'
  if (Test-Path -LiteralPath $legacyRecordFile) {
    $legacyRecord = Get-Content -LiteralPath $legacyRecordFile -Raw | ConvertFrom-Json
    if ($legacyRecord.script -eq $expectedServer) {
      $legacyProcess = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$legacyRecord.pid)"
      if ($legacyProcess -and $legacyProcess.CommandLine -and $legacyProcess.CommandLine.Contains($expectedServer)) {
        $ownedProcess = [System.Diagnostics.Process]::GetProcessById([int]$legacyRecord.pid)
        $ownedProcess.Kill()
        $ownedProcess.WaitForExit(8000) | Out-Null
      }
    }
  }
  $tempFolder = Join-Path $appRoot 'tmp'
  New-Item -ItemType Directory -Path $tempFolder -Force | Out-Null
  $managerProcess = Start-Process -FilePath $nodeExe -ArgumentList @(('"' + $managerScript + '"')) -WorkingDirectory $appRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $tempFolder 'manager.stdout.log') -RedirectStandardError (Join-Path $tempFolder 'manager.stderr.log')
  $managerReady = $false
  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 300
    $managerProcess.Refresh()
    if ($managerProcess.HasExited) { throw 'Manager could not start. Check tmp/manager.stderr.log.' }
    if ((Test-Path -LiteralPath $recordFile) -and ((Get-Content -LiteralPath $recordFile -Raw | ConvertFrom-Json).pid -eq $managerProcess.Id)) { $managerReady = $true; break }
  }
  if (-not $managerReady) { throw 'Manager did not become ready. Check tmp/manager.stderr.log.' }
}
$secretFile = Join-Path $appRoot 'private\manager.key'
if (-not (Test-Path -LiteralPath $secretFile)) { throw 'Manager authentication file is not ready.' }
$managerSecret = [System.IO.File]::ReadAllText($secretFile).Trim()
if ($managerSecret -notmatch '^[a-f0-9]{64}$') { throw 'Invalid manager key.' }
# The fragment is consumed in the browser and never sent in an HTTP URL.
if (-not $NoBrowser) { Start-Process ('http://127.0.0.1:3100/#key=' + $managerSecret) }
