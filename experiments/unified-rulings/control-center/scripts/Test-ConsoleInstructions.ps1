param([string]$PackageDirectory=(Split-Path $PSScriptRoot -Parent))
$ErrorActionPreference='Stop'
$root=(Resolve-Path -LiteralPath $PackageDirectory).Path
$text=[IO.File]::ReadAllText((Join-Path $root 'INSPECT-CONSOLE.txt'))
if($text -match '(?i)Set-ExecutionPolicy|ExecutionPolicy\s+Bypass|Invoke-Expression|ScriptBlock\]::Create'){throw 'Policy-changing or dynamic script-file execution is not permitted.'}
# Native Windows PowerShell 5.1 interprets the literal console body; no script file is executed.
$exe=Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
Push-Location $root
try{
  $output=& $exe -NoLogo -NoProfile -NonInteractive -Command $text
  if($LASTEXITCODE -ne 0){throw 'PowerShell 5.1 console verification failed.'}
  $report=($output -join "`n")|ConvertFrom-Json
  if($report.verifiedProbes -ne 2 -or $report.sshCommands -ne 0 -or $report.separateApprovalRequired -ne $true){throw 'Console defaults must not connect to Azure.'}
}finally{Pop-Location}
Write-Output 'PowerShell 5.1 literal console verified; SSH calls 0.'

$maintenance=[IO.File]::ReadAllText((Join-Path $root 'MAINTENANCE-CONSOLE.txt'))
if($maintenance -match '(?i)Set-ExecutionPolicy|ExecutionPolicy\s+Bypass|Invoke-Expression|ScriptBlock\]::Create'){throw 'Unsafe console policy.'}
$proof=$maintenance+@'
$denied=$false
try { Invoke-RiftAssistMaintenance -Method status -SiteId '11111111-1111-1111-1111-111111111111' -InventoryHash ('0'*64) } catch { $denied=$_.Exception.Message -like 'Actual SSH connection approval required*' }
if(!$denied){throw 'Unapproved connection was not blocked.'}
$denied=$false
try { Invoke-RiftAssistMaintenance -Method replace -SiteId '11111111-1111-1111-1111-111111111111' -InventoryHash ('0'*64) -ConnectionApproved } catch { $denied=$_.Exception.Message -like 'Separate exact maintenance*' }
if(!$denied){throw 'Unapproved write was not blocked.'}
'@
& $exe -NoLogo -NoProfile -NonInteractive -Command $proof
if($LASTEXITCODE -ne 0){throw 'PowerShell 5.1 maintenance guard test failed.'}
Write-Output 'PowerShell 5.1 maintenance function verified; SSH calls 0.'
