param(
    [Parameter(Mandatory = $true)][string]$NodePath,
    [Parameter(Mandatory = $true)][string]$OutputDirectory,
    [string]$NodeLicensePath,
    [switch]$RequireTrustedNodeSignature
)
$ErrorActionPreference = 'Stop'
$project = Split-Path $PSScriptRoot -Parent
$node = (Resolve-Path -LiteralPath $NodePath).Path
if (Test-Path -LiteralPath $OutputDirectory) { throw 'Choose a new output directory. Existing files are not replaced.' }
if ((Get-Item -LiteralPath $node).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Node executable links are not allowed.' }
$version = (& $node --version).Trim()
if ($LASTEXITCODE -ne 0 -or $version -notmatch '^v24\.\d+\.\d+$') { throw 'A trusted Node.js 24 x64 distribution is required.' }
$architecture = (& $node -p 'process.arch').Trim()
if ($LASTEXITCODE -ne 0 -or $architecture -ne 'x64') { throw 'Only the x64 Node distribution can be packaged.' }
if ($RequireTrustedNodeSignature -and (Get-AuthenticodeSignature -LiteralPath $node).Status -ne 'Valid') { throw 'Node Authenticode validation failed.' }
if (!$NodeLicensePath) { $NodeLicensePath = Join-Path (Split-Path $node -Parent) 'LICENSE' }
if (!(Test-Path -LiteralPath $NodeLicensePath -PathType Leaf)) { throw 'Supply the LICENSE from the same official Node distribution using -NodeLicensePath.' }
& $node (Join-Path $PSScriptRoot 'staging-manifest.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Staging source manifest check failed.' }
& $node (Join-Path $PSScriptRoot 'backend-manifest.cjs')
if ($LASTEXITCODE -ne 0) { throw 'Backend source manifest check failed.' }
Push-Location $project
try {
    & dotnet publish 'src/RiftAssist.ControlCenter/RiftAssist.ControlCenter.csproj' --configuration Release --runtime win-x64 --self-contained true --output $OutputDirectory
    if ($LASTEXITCODE -ne 0) { throw 'Publish failed.' }
} finally { Pop-Location }
$runtime = Join-Path $OutputDirectory 'runtime'
New-Item -ItemType Directory -Path $runtime | Out-Null
Copy-Item -LiteralPath $node -Destination (Join-Path $runtime 'node.exe')
Copy-Item -LiteralPath $NodeLicensePath -Destination (Join-Path $runtime 'NODE-LICENSE.txt')
$runtimeMetadata = @{ major = 24; version = $version; sha256 = (Get-FileHash -LiteralPath (Join-Path $runtime 'node.exe') -Algorithm SHA256).Hash.ToLowerInvariant() } | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $runtime 'runtime.json'), $runtimeMetadata, (New-Object Text.UTF8Encoding $false))
Copy-Item -LiteralPath (Join-Path $project 'README.md') -Destination (Join-Path $OutputDirectory 'CONTROL-CENTER-README.md')
Copy-Item -LiteralPath (Join-Path $project 'WINDOWS-VALIDATION.md') -Destination (Join-Path $OutputDirectory 'WINDOWS-VALIDATION.md')
Copy-Item -LiteralPath (Join-Path $project 'PHASE2.md') -Destination (Join-Path $OutputDirectory 'PHASE2.md')
Copy-Item -LiteralPath (Join-Path $project 'PHASE3.md') -Destination (Join-Path $OutputDirectory 'PHASE3.md')
Copy-Item -LiteralPath (Join-Path $project 'SSH-TROUBLESHOOTING.md') -Destination (Join-Path $OutputDirectory 'SSH-TROUBLESHOOTING.md')
Copy-Item -LiteralPath (Join-Path $project 'PHASE4.md') -Destination (Join-Path $OutputDirectory 'PHASE4.md')
Copy-Item -LiteralPath (Join-Path $project 'src/RiftAssist.ControlCenter/Assets/icon-origin.json') -Destination (Join-Path $OutputDirectory 'ICON-ORIGIN.json')
Copy-Item -LiteralPath (Join-Path $project 'AUTOLOGIN.md') -Destination (Join-Path $OutputDirectory 'AUTOLOGIN.md')
Copy-Item -LiteralPath (Join-Path $project 'ZERO-INPUT.md') -Destination (Join-Path $OutputDirectory 'ZERO-INPUT.md')
Copy-Item -LiteralPath (Join-Path $project 'PHASE5.md') -Destination (Join-Path $OutputDirectory 'PHASE5.md')
Copy-Item -LiteralPath (Join-Path $project 'PHASE6.md') -Destination (Join-Path $OutputDirectory 'PHASE6.md')
Copy-Item -LiteralPath (Join-Path $project 'PHASE7.md') -Destination (Join-Path $OutputDirectory 'PHASE7.md')
Copy-Item -LiteralPath (Join-Path $project 'PHASE8.md') -Destination (Join-Path $OutputDirectory 'PHASE8.md')
Copy-Item -LiteralPath (Join-Path $project 'STAGING.md') -Destination (Join-Path $OutputDirectory 'STAGING.md')
Copy-Item -LiteralPath (Join-Path $project 'AZURE-INSPECTION.md') -Destination (Join-Path $OutputDirectory 'AZURE-INSPECTION.md')
Write-Output 'Portable local-development package created. No installation, remote connection or live deployment was performed.'
