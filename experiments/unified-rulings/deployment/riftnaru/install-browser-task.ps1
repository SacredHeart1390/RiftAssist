param(
  [Parameter(Mandatory=$true)][string]$ProgramRoot,
  [Parameter(Mandatory=$true)][string]$Node,
  [Parameter(Mandatory=$true)][string]$Playwright,
  [Parameter(Mandatory=$true)][string]$Identity,
  [Parameter(Mandatory=$true)][string]$KnownHosts,
  [string]$Browser='C:\Program Files\Google\Chrome\Application\chrome.exe',
  [string]$StateDirectory="$env:LOCALAPPDATA\RiftAssistCardSync\state"
)
$ErrorActionPreference='Stop'
$script=Join-Path $ProgramRoot 'scripts\collect-riftnaru.cjs'
foreach($item in @($script,$Node,$Playwright,$Identity,$KnownHosts,$Browser)) {
  if(-not (Test-Path -LiteralPath $item) -or $item -match '["\r\n]'){throw 'Invalid collector installation path'}
}
$arguments=@($script,'--state',$StateDirectory,'--playwright',$Playwright,'--host','azureuser@20.222.152.195','--identity',$Identity,'--known-hosts',$KnownHosts,'--browser',$Browser)
$argumentsText=($arguments|ForEach-Object {'"'+$_+'"'}) -join ' '
$action=New-ScheduledTaskAction -Execute $Node -Argument $argumentsText -WorkingDirectory $ProgramRoot
$triggers=@((New-ScheduledTaskTrigger -Daily -At '19:00'),(New-ScheduledTaskTrigger -AtLogOn -User ([Security.Principal.WindowsIdentity]::GetCurrent().Name)))
$settings=New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1)
$principal=New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
$name='RiftAssist Public Card Browser Sync'
if(Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue){throw 'Existing task must be inspected before replacement'}
Register-ScheduledTask -TaskName $name -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Description 'Public RiftNaru DOM collection; SSH export; no AI, GitHub or code deployment.' | Select-Object TaskName,State
