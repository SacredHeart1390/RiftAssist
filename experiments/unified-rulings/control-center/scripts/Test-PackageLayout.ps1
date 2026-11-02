param([Parameter(Mandatory=$true)][string]$PackageDirectory,[Parameter(Mandatory=$true)][string]$ArchivePath,[Parameter(Mandatory=$true)][string]$ExtractDirectory,[Parameter(Mandatory=$true)][string]$ReportPath)
$ErrorActionPreference='Stop'
if ((Test-Path -LiteralPath $ArchivePath) -or (Test-Path -LiteralPath $ExtractDirectory)) { throw 'Choose fresh disposable archive/extraction paths.' }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($PackageDirectory,$ArchivePath,[IO.Compression.CompressionLevel]::Optimal,$false)
$zip=[IO.Compression.ZipFile]::OpenRead($ArchivePath)
try {
  foreach($entry in $zip.Entries) {
    if ($entry.FullName.StartsWith('/') -or $entry.FullName.Contains('\') -or $entry.FullName.Split('/') -contains '..') { throw 'Unexpected archive path.' }
  }
  foreach($name in @('RiftAssist.ControlCenter.exe','RiftAssist.ControlCenter.Core.dll','backend-manifest.json','runtime/node.exe','runtime/runtime.json','backend/v0.2.0/src/card-review-auth.js')) {
    if (!$zip.GetEntry($name)) { throw 'Required file is missing from the archive root/layout.' }
  }
  if (@($zip.Entries | Where-Object { $_.FullName -like '*/RiftAssist.ControlCenter.exe' }).Count -ne 0) { throw 'Executable must not be nested.' }
} finally { $zip.Dispose() }
[IO.Compression.ZipFile]::ExtractToDirectory($ArchivePath,$ExtractDirectory)
$report=@{ rootExecutable=$true; nestedExecutable=$false; runtimeAndBackendPresent=$true; archiveName=[IO.Path]::GetFileName($ArchivePath); nativeChecksUseExtractedArchive=$true }|ConvertTo-Json
[IO.File]::WriteAllText($ReportPath,$report)
Write-Output $report
