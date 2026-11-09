'use strict';
// Emits independent literal console commands, never invokes PowerShell or SSH.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),name='inspect-final-launch.py';
// Changing the probe requires a deliberate source review and a new approval pin.
// --write must never silently authorize a modified remote program.
const reviewSha='b5ad2101ddcec04cbd9a1502efdba5b401edaea68a1cd594cc15277242262326';
const sha=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'staging',name))).digest('hex');
if(sha!==reviewSha)throw Error('Inspection source differs from the fixed review pin; no instructions generated.');
function command(mode){return `& {
$ErrorActionPreference='Stop';
try {
$p=Join-Path (Get-Location).Path 'staging/${name}';
if((Get-Item -LiteralPath $p).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'link'};
$b=[IO.File]::ReadAllBytes($p);
$h=[Security.Cryptography.SHA256]::Create(); try{$actual=[BitConverter]::ToString($h.ComputeHash($b)).Replace('-','').ToLowerInvariant()}finally{$h.Dispose()};
if($actual -cne '${sha}'){throw 'hash'};
if('${mode}' -eq 'Verify'){[pscustomobject]@{protocol='riftassist-final-launch-local-1';sourceSha256=$actual;sshCommands=0;authorizedToDeploy=$false}|ConvertTo-Json -Compress;return};
$ssh=Join-Path $env:WINDIR 'System32/OpenSSH/ssh.exe';
$source=[Text.Encoding]::ASCII.GetString($b);
$raw=@($source|& $ssh -F NUL -T -o BatchMode=yes -o StrictHostKeyChecking=yes -o UpdateHostKeys=no -o ConnectionAttempts=1 -o ConnectTimeout=10 -o ServerAliveInterval=5 -o ServerAliveCountMax=1 -o ForwardAgent=no -o ForwardX11=no -o ClearAllForwardings=yes -o PermitLocalCommand=no -o LogLevel=ERROR -o UserKnownHostsFile="$env:USERPROFILE/.ssh/known_hosts" -i "$env:USERPROFILE/.ssh/riftassistant-key.pem" azureuser@20.222.152.195 'python3 -I -S -B -' 2>$null);
if($LASTEXITCODE -ne 0){throw 'ssh'};
$json=$raw -join "\u0060n";if($json.Length -gt 65536){throw 'size'};
$r=$json|ConvertFrom-Json -ErrorAction Stop;
$allowed=@('protocol','readOnly','main','helper','unitSource','caddySource','privateFilesOpened','sensitiveFileContentsRead','helperCodeExecuted','environmentValuesEmitted','authorizedToDeploy');
if(@($r.PSObject.Properties.Name|Where-Object {$_ -cnotin $allowed}).Count -ne 0){throw 'unexpected-field'};
if($r.protocol -cne 'riftassist-final-launch-1' -or $r.readOnly -isnot [bool] -or $r.readOnly -ne $true -or $r.authorizedToDeploy -isnot [bool] -or $r.authorizedToDeploy -ne $false -or ($r.privateFilesOpened -isnot [int] -and $r.privateFilesOpened -isnot [long]) -or $r.privateFilesOpened -ne 0 -or $r.sensitiveFileContentsRead -isnot [bool] -or $r.sensitiveFileContentsRead -ne $false -or $r.helperCodeExecuted -isnot [bool] -or $r.helperCodeExecuted -ne $false -or $r.environmentValuesEmitted -isnot [bool] -or $r.environmentValuesEmitted -ne $false){throw 'protocol'};
$r|ConvertTo-Json -Depth 12;
}catch{throw 'Fixed inspection rejected or SSH response unconfirmed. Raw diagnostics suppressed; no retry.'}
}`.split('\n').map(l=>l.trim()).filter(Boolean).join(' ');}
const text='# Local SHA verification only. Paste ONE entire following physical line at the extracted package root.\n'+command('Verify')+'\n'+
'# Proposed SSH inspection. Paste ONE entire following line ONLY AFTER separate approval of this source and SHA.\n'+command('Inspect')+'\n';
const file=path.join(root,'FINAL-INSPECTION.txt');
if(process.argv[2]==='--write')fs.writeFileSync(file,text);else if(fs.readFileSync(file,'utf8')!==text)throw Error('One-line inspection instructions differ.');
console.log(JSON.stringify({oneLineCommandsVerified:2,sourceSha256:sha,sshExecuted:false}));
