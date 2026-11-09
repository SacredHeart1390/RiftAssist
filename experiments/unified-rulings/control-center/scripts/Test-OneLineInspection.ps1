param([string]$PackageDirectory=(Split-Path $PSScriptRoot -Parent))
$ErrorActionPreference='Stop'
$root=(Resolve-Path -LiteralPath $PackageDirectory).Path
$lines=@([IO.File]::ReadAllLines((Join-Path $root 'ONE-LINE-INSPECTION.txt'))|Where-Object {$_ -like '& {*'})
if($lines.Count -ne 2){throw 'Two independent physical command lines are required.'}
foreach($line in $lines){if($line -match '(?i)Set-ExecutionPolicy|ExecutionPolicy\s+Bypass|Invoke-Expression|ScriptBlock\]::Create|[\r\n]'){throw 'Unsafe or multiline inspection.'}}
$exe=Join-Path $env:WINDIR 'System32/WindowsPowerShell/v1.0/powershell.exe'
Push-Location $root
try{
  $report=((& $exe -NoLogo -NoProfile -NonInteractive -Command $lines[0])-join "`n")|ConvertFrom-Json
  if($LASTEXITCODE -ne 0 -or $report.sshCommands -ne 0){throw 'PowerShell 5.1 local-only verification failed.'}
  # The exact Inspect body uses a function stub solely in this test process. No Azure connection.
  $binding='$ssh=Join-Path $env:WINDIR ''System32/OpenSSH/ssh.exe'''
  if(!$lines[1].Contains($binding)){throw 'Fixed SSH binding is missing.'}
  $mock=@'
$global:MockSshCalls=0
function Mock-FixedSsh { process { $global:MockSshCalls++; $global:LASTEXITCODE=0; [pscustomobject]@{protocol='riftassist-launch-details-1';readOnly=$true;authorizedToDeploy=$false;privateFilesOpened=0;extraFileContentsRead=$false;referencedScriptContentsRead=$false}|ConvertTo-Json -Compress } }
'@
  $body=$mock+"`n"+$lines[1].Replace($binding,'$ssh=''Mock-FixedSsh''')+"`n"+'if($global:MockSshCalls -ne 1){throw ''Expected one mock SSH call.''}'
  $output=& $exe -NoLogo -NoProfile -NonInteractive -Command $body
  if($LASTEXITCODE -ne 0 -or (($output-join "`n")|ConvertFrom-Json).privateFilesOpened -ne 0){throw 'PowerShell 5.1 mock inspect failed.'}
  $bad=$lines[1].Replace($report.sourceSha256,('0'*64)).Replace($binding,'$ssh=''Mock-FixedSsh''')
  $body=$mock+"`n"+'$blocked=$false;try{'+$bad+'}catch{$blocked=$true};if(!$blocked -or $global:MockSshCalls -ne 0){throw ''Hash mismatch must block before SSH.''}'
  & $exe -NoLogo -NoProfile -NonInteractive -Command $body
  if($LASTEXITCODE -ne 0){throw 'PowerShell 5.1 hash failure guard test failed.'}
}finally{Pop-Location}
Write-Output 'PowerShell 5.1 independent one-line Verify and mock Inspect passed; Azure calls 0.'
