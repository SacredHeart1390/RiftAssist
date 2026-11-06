param([Parameter(Mandatory=$true)][string]$PackageDirectory,[Parameter(Mandatory=$true)][string]$ArchivePath,[Parameter(Mandatory=$true)][string]$ExtractDirectory,[Parameter(Mandatory=$true)][string]$ReportPath)
$ErrorActionPreference='Stop'
if (!(Test-Path -LiteralPath (Join-Path $PackageDirectory 'REPLACEMENT.md'))) { throw 'Single-service replacement procedure is missing.' }
if (!(Test-Path -LiteralPath (Join-Path $PackageDirectory 'LEGACY-BASELINE.md'))) { throw 'Trusted legacy reference audit is missing.' }
if ((Test-Path -LiteralPath $ArchivePath) -or (Test-Path -LiteralPath $ExtractDirectory)) { throw 'Choose fresh disposable archive/extraction paths.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($PackageDirectory,$ArchivePath,[IO.Compression.CompressionLevel]::Optimal,$false)
$zip=[IO.Compression.ZipFile]::OpenRead($ArchivePath)
try {
  foreach($entry in $zip.Entries) {
    if ($entry.FullName.StartsWith('/') -or $entry.FullName.Contains('\') -or $entry.FullName.Split('/') -contains '..') { throw 'Unexpected archive path.' }
  }
  foreach($name in @('RiftAssist.ControlCenter.exe','RiftAssist.ControlCenter.Core.dll','backend-manifest.json','runtime/node.exe','runtime/runtime.json','backend/v0.2.0/src/card-review-auth.js','deployment/control.cjs','deployment/lab.cjs','deployment-manifest.json','staging/serve.cjs','staging/inspect-azure.py','staging/mock-services.cjs','staging-manifest.json','STAGING.md','AZURE-INSPECTION.md','PHASE8.md','Invoke-ReleasePreparation.ps1','Invoke-AdditionalInspection.ps1','SOURCE-EXTRAS-AND-AUTOSTART.md','RELEASE-CHECKLIST.md','staging/inspect-replacement-topology.py','staging/inspect-legacy-source.py')) {
    if (!$zip.GetEntry($name)) { throw 'Required file is missing from the archive root/layout.' }
  }
  if (@($zip.Entries | Where-Object { $_.FullName -like '*/RiftAssist.ControlCenter.exe' }).Count -ne 0) { throw 'Executable must not be nested.' }
} finally { $zip.Dispose() }
[IO.Compression.ZipFile]::ExtractToDirectory($ArchivePath,$ExtractDirectory)
$stage = Get-Content -LiteralPath (Join-Path $ExtractDirectory 'staging-manifest.json') -Raw | ConvertFrom-Json
if ($stage.scope -ne 'isolated-staging-not-installed' -or $stage.productionEnabled -ne $false) { throw 'Unexpected staging scope.' }
foreach ($property in $stage.files.PSObject.Properties) {
  if ($property.Name -notmatch '^[A-Za-z0-9._-]+$') { throw 'Unexpected staging manifest path.' }
  $actual = (Get-FileHash -LiteralPath (Join-Path $ExtractDirectory ('staging/' + $property.Name)) -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $property.Value) { throw 'Staging payload integrity mismatch.' }
}
$mock = (Get-FileHash -LiteralPath (Join-Path $ExtractDirectory 'staging/mock-services.cjs') -Algorithm SHA256).Hash
$trustedMock = (Get-FileHash -LiteralPath (Join-Path $ExtractDirectory 'backend/v0.2.0/src/external-services.js') -Algorithm SHA256).Hash
if ($mock -ne $trustedMock) { throw 'Staging mock transport differs from verified backend.' }
$report=@{ rootExecutable=$true; nestedExecutable=$false; runtimeAndBackendPresent=$true; archiveName=[IO.Path]::GetFileName($ArchivePath); nativeChecksUseExtractedArchive=$true }|ConvertTo-Json
[IO.File]::WriteAllText($ReportPath,$report)
Write-Output $report

& (Join-Path $ExtractDirectory 'Invoke-ReleasePreparation.ps1') -Mode Verify -PackageDirectory $ExtractDirectory

& (Join-Path $ExtractDirectory 'Invoke-AdditionalInspection.ps1') -Mode Verify -PackageDirectory $ExtractDirectory
$additionalDenied=$false
try{ & (Join-Path $ExtractDirectory 'Invoke-AdditionalInspection.ps1') -Mode Inspect -PackageDirectory $ExtractDirectory }catch{$additionalDenied=$_.Exception.Message -like 'Separate approval required*'}
if(!$additionalDenied){throw 'New inspection must be blocked without separate approval.'}
