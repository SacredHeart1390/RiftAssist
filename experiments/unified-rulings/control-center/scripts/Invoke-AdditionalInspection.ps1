# New scope: separate approval required. No installation or deployment commands.
[CmdletBinding()]
param([ValidateSet('Verify','Inspect')][string]$Mode='Verify',[switch]$Approved,[string]$PackageDirectory='')
$ErrorActionPreference='Stop'
if($Mode -eq 'Inspect' -and !$Approved){throw 'Separate approval required for the new release-blockers inspection. SSH not run.'}
if(!$PackageDirectory){$PackageDirectory=if(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'staging')){$PSScriptRoot}else{Split-Path $PSScriptRoot -Parent}}
$file=Join-Path (Resolve-Path -LiteralPath $PackageDirectory).Path 'staging/inspect-release-blockers.py'
if((Get-Item -LiteralPath $file).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Probe link rejected. SSH not run.'}
$bytes=[IO.File]::ReadAllBytes($file);$sha=[Security.Cryptography.SHA256]::Create()
try{$actual=[BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
if($actual -cne '3fce265ce5d45dec329f79f31a4b08122b84bd37bc32240a25f2ce2dfc7c328a'){throw 'New probe SHA256 mismatch. SSH not run.'}
if($Mode -eq 'Verify'){
  [pscustomobject]@{protocol='riftassist-release-blockers-1';sha256=$actual;verifiedProbes=1;sshCommands=0;separateApprovalRequired=$true;authorizedToDeploy=$false}
  return
}
$ssh=Join-Path $env:WINDIR 'System32/OpenSSH/ssh.exe'
if(!(Test-Path -LiteralPath $ssh -PathType Leaf)){throw 'Windows OpenSSH client is missing.'}
$source=[Text.Encoding]::ASCII.GetString($bytes)
try{
  $output=@($source | & $ssh -F NUL -T -o BatchMode=yes -o StrictHostKeyChecking=yes -o UpdateHostKeys=no -o ConnectionAttempts=1 -o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=1 -o ForwardAgent=no -o ForwardX11=no -o ClearAllForwardings=yes -o PermitLocalCommand=no -o LogLevel=ERROR -o UserKnownHostsFile="$env:USERPROFILE/.ssh/known_hosts" -i "$env:USERPROFILE/.ssh/riftassistant-key.pem" azureuser@20.222.152.195 'python3 -B -' 2>$null)
}catch{throw 'SSH inspection failed. Raw stderr suppressed. No retry.'}
if($LASTEXITCODE -ne 0){throw 'SSH inspection failed. Raw stderr suppressed. No retry.'}
$json=$output -join "`n"
if($json.Length -gt 65536){throw 'Inspection response too large; suppressed.'}
try{$report=$json|ConvertFrom-Json -ErrorAction Stop}catch{throw 'Invalid inspection JSON; raw output suppressed.'}
if($report.protocol -cne 'riftassist-release-blockers-1' -or $report.readOnly -ne $true -or $report.authorizedToDeploy -ne $false){throw 'Inspection protocol mismatch; raw output suppressed.'}
$report|ConvertTo-Json -Depth 14
