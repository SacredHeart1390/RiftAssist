# Windows PowerShell 5.1 or PowerShell 7. No installation/deployment commands.
[CmdletBinding()]
param([ValidateSet('Verify','Inspect')][string]$Mode='Verify',
      [string]$PackageDirectory='')
$ErrorActionPreference='Stop'
$checks=@(
  @{Name='inspect-replacement-topology.py';Sha='6d0a68ff75eeccc45235d5607b72704ef9079f159d94f1fc52bf74acd36cbfa1';Protocol='riftassist-replacement-topology-1'},
  @{Name='inspect-legacy-source.py';Sha='5d353f19ff44ff1218ddfdc5b09e4fa5a2126f29c6fa24fc9404cb56d2a98166';Protocol='riftassist-legacy-source-1'}
)
if(!$PackageDirectory){$PackageDirectory=if(Test-Path -LiteralPath (Join-Path $PSScriptRoot 'staging')){$PSScriptRoot}else{Split-Path $PSScriptRoot -Parent}}
$root=(Resolve-Path -LiteralPath $PackageDirectory).Path
# Validate BOTH approved a7dbf966 byte sequences before ANY SSH invocation.
$sources=@()
foreach($check in $checks){
  $file=Join-Path $root ('staging/'+$check.Name)
  if((Get-Item -LiteralPath $file).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Probe link rejected; SSH not run.'}
  $bytes=[IO.File]::ReadAllBytes($file);$sha=[Security.Cryptography.SHA256]::Create()
  try{$digest=[BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
  if($digest -cne $check.Sha){throw 'Approved a7dbf966 probe SHA256 mismatch; SSH not run.'}
  $sources+=,[Text.Encoding]::ASCII.GetString($bytes)
}
if($Mode -eq 'Verify'){
  [pscustomobject]@{approvedCommit='a7dbf966f7361dfa9fba34416caf6409bfcd6047';verifiedProbes=2;sshCommands=0;authorizedToInstall=$false;authorizedToDeploy=$false}
  return
}
$ssh=Join-Path $env:WINDIR 'System32/OpenSSH/ssh.exe'
if(!(Test-Path -LiteralPath $ssh -PathType Leaf)){throw 'Windows OpenSSH client is missing.'}
for($i=0;$i -lt $checks.Count;$i++){
  # Only fixed Python stdin execution. Private key contents/values never enter argv.
  $output=@($sources[$i] | & $ssh -F NUL -T -o BatchMode=yes -o StrictHostKeyChecking=yes -o UpdateHostKeys=no -o ConnectionAttempts=1 -o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=1 -o ForwardAgent=no -o ForwardX11=no -o ClearAllForwardings=yes -o PermitLocalCommand=no -o LogLevel=ERROR -o UserKnownHostsFile="$env:USERPROFILE/.ssh/known_hosts" -i "$env:USERPROFILE/.ssh/riftassistant-key.pem" azureuser@20.222.152.195 'python3 -B -' 2>$null)
  if($LASTEXITCODE -ne 0){throw 'SSH inspection failed. Raw stderr and response are suppressed. No retry.'}
  $json=$output -join "`n"
  if($json.Length -gt 65536){throw 'Inspection response too large; suppressed.'}
  try{$report=$json|ConvertFrom-Json -ErrorAction Stop}catch{throw 'Inspection response was not valid JSON; suppressed.'}
  if($report.protocol -cne $checks[$i].Protocol -or $report.readOnly -ne $true){throw 'Inspection protocol mismatch; suppressed.'}
  # The reviewed probes emit metadata/hash results only. No automatic files/transcripts.
  $report|ConvertTo-Json -Depth 12
}
