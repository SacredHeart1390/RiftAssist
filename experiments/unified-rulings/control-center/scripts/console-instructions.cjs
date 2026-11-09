'use strict';
// Generate literal console commands; never executes PowerShell or SSH.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),target=path.join(root,'INSPECT-CONSOLE.txt');
const metadataHash=crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'staging/inspect-maintenance-metadata.py'))).digest('hex');
const original=fs.readFileSync(path.join(__dirname,'Invoke-ReleasePreparation.ps1'),'utf8');
const from=original.indexOf('$checks=@('),to=original.indexOf("\nif(!$PackageDirectory)",from);
const checks="$checks=@(\n  @{Name='inspect-release-blockers.py';Sha='3fce265ce5d45dec329f79f31a4b08122b84bd37bc32240a25f2ce2dfc7c328a';Protocol='riftassist-release-blockers-1'},\n  @{Name='inspect-maintenance-metadata.py';Sha='"+metadataHash+"';Protocol='riftassist-maintenance-metadata-1'}\n)";
const body=(original.slice(0,from)+checks+original.slice(to))
 .replace("[string]$PackageDirectory=''","[switch]$Approved,[string]$PackageDirectory=(Get-Location).Path")
 .replace("$ErrorActionPreference='Stop'","$ErrorActionPreference='Stop'\nif($Mode -eq 'Inspect' -and !$Approved){throw 'Separate approval required for both proposed probes. SSH not run.'}")
 .replaceAll('approved a7dbf966 byte sequences','proposed byte sequences').replaceAll('Approved a7dbf966 probe','Proposed probe')
 .replace("approvedCommit='a7dbf966f7361dfa9fba34416caf6409bfcd6047'","separateApprovalRequired=$true");
const text='# Paste this literal block into PowerShell 5.1 at the extracted ZIP root. No .ps1 execution/policy change.\n'+
 'function Invoke-RiftAssistPredeploymentInspection {\n'+body.split('\n').map(line=>line?'  '+line:'').join('\n')+'\n}\n'+
 '# Default is local SHA verification only; no SSH.\nInvoke-RiftAssistPredeploymentInspection -Mode Verify -PackageDirectory (Get-Location).Path | ConvertTo-Json -Depth 5\n'+
 '# Only AFTER separate approval of the exact probe/source/hash, enter this separate command:\n'+
 '# Invoke-RiftAssistPredeploymentInspection -Mode Inspect -Approved -PackageDirectory (Get-Location).Path\n';
if(process.argv[2]==='--write')fs.writeFileSync(target,text);else if(fs.readFileSync(target,'utf8')!==text)throw Error('Console instructions differ from the reviewed wrapper.');
console.log(JSON.stringify({consoleInstructionsVerified:true,scriptFileExecution:false,defaultSshCalls:0}));
