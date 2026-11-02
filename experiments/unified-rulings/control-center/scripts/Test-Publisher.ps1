param([Parameter(Mandatory)][string]$Executable,[Parameter(Mandatory)][string]$ReportPath)
$ErrorActionPreference = 'Stop'
$exe = (Resolve-Path -LiteralPath $Executable).Path
$signature = Get-AuthenticodeSignature -LiteralPath $exe
if ($signature.Status -notin @('NotSigned','Valid')) { throw 'Executable signature is invalid or cannot be verified.' }
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class ExeManifest {
 [DllImport("kernel32.dll", CharSet=CharSet.Unicode, SetLastError=true)] public static extern IntPtr LoadLibraryEx(string file, IntPtr reserved, uint flags);
 [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr FindResource(IntPtr module, IntPtr name, IntPtr type);
 [DllImport("kernel32.dll")] public static extern uint SizeofResource(IntPtr module, IntPtr resource);
 [DllImport("kernel32.dll")] public static extern IntPtr LoadResource(IntPtr module, IntPtr resource);
 [DllImport("kernel32.dll")] public static extern IntPtr LockResource(IntPtr resource);
 [DllImport("kernel32.dll")] public static extern bool FreeLibrary(IntPtr module);
}
'@
$module = [ExeManifest]::LoadLibraryEx($exe,[IntPtr]::Zero,2)
if ($module -eq [IntPtr]::Zero) { throw 'Cannot load EXE resources as data.' }
try {
 $resource = [ExeManifest]::FindResource($module,[IntPtr]1,[IntPtr]24)
 $length = [ExeManifest]::SizeofResource($module,$resource)
 if ($resource -eq [IntPtr]::Zero -or $length -lt 1 -or $length -gt 1048576) { throw 'Embedded manifest is missing or invalid.' }
 $pointer = [ExeManifest]::LockResource([ExeManifest]::LoadResource($module,$resource))
 if ($pointer -eq [IntPtr]::Zero) { throw 'Cannot read manifest resource.' }
 $bytes = New-Object byte[] $length
 [Runtime.InteropServices.Marshal]::Copy($pointer,$bytes,0,$length)
 [xml]$manifest = [Text.Encoding]::UTF8.GetString($bytes).Trim([char]0,[char]0xFEFF)
 $levels = @($manifest.SelectNodes("//*[local-name()='requestedExecutionLevel']"))
 if ($levels.Count -ne 1 -or $levels[0].level -ne 'asInvoker' -or $levels[0].uiAccess -ne 'false') { throw 'Unexpected elevation request.' }
 $result = @{ authenticodeStatus = $signature.Status.ToString(); requestedExecutionLevel = 'asInvoker'; uiAccess = $false; signingPerformed = $false; globalSecurityChanges = $false } | ConvertTo-Json
 [IO.File]::WriteAllText($ReportPath,$result)
 Write-Output $result
} finally { [void][ExeManifest]::FreeLibrary($module) }
