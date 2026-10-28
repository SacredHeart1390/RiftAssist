param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$appRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
# Start npm start separately. Never stop or replace a recorded legacy process.
$dataRoot = & node --eval 'const p=require(process.argv[1]);require(require("node:path").join(p.APP_ROOT,"src/environment.js")).assertEnvironment(p.DATA_ROOT);process.stdout.write(p.DATA_ROOT);' (Join-Path $appRoot 'src/paths.js')
if ($LASTEXITCODE -ne 0) { throw 'Prepare a separate v0.2.0 development environment first.' }
$secretFile = Join-Path $dataRoot 'private/manager.key'
if (-not (Test-Path -LiteralPath $secretFile)) { throw 'Run npm start for v0.2.0 first.' }
$managerSecret = [System.IO.File]::ReadAllText($secretFile).Trim()
if ($managerSecret -notmatch '^[a-f0-9]{64}$') { throw 'Invalid development manager authentication.' }
if (-not $NoBrowser) { Start-Process ('http://127.0.0.1:3200/#key=' + $managerSecret) }
