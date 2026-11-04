using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.Json;

namespace RiftAssist.ControlCenter.Core;

public sealed record ProcessLease(string Id,string JobName,int OwnerPid,long OwnerStart,int RootPid,long RootStart,string ExecutableHash,string DirectoryHash);
public sealed record ProcessObservation(string Id,string State);
// Kill-on-last-handle-close. No inherited handle and no PID-based recovery termination.
public sealed class WindowsOwnedProcess:IDisposable
{
    private IntPtr handle;
    private readonly string? receipt;
    private WindowsOwnedProcess(IntPtr h,string? file){handle=h;receipt=file;}
    public static string DefaultRoot=>Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"RiftAssist","ControlCenter-Development-v030","ProcessLeases");
    private static byte[] Entropy=>ProtocolJson.Utf8.GetBytes("RiftAssist/owned-child/v1");
    public static WindowsOwnedProcess? Attach(Process process,string executable,string directory,string? root=null)
    {
        try{return AttachCore(process,executable,directory,root);}catch{ChildProcess.Stop(process);throw new ControlException("client-process-guard");}
    }
    private static WindowsOwnedProcess? AttachCore(Process process,string executable,string directory,string? root)
    {
        if(!OperatingSystem.IsWindows())return null;
        root=Path.GetFullPath(root??DefaultRoot);SafePath.NoLinks(root);Directory.CreateDirectory(root);DpapiAdminCredentialVault.ProtectDirectory(root);
        var id=Guid.NewGuid().ToString("D");var name="Local\\RiftAssist.Owned."+id;var job=CreateJobObject(IntPtr.Zero,name);
        if(job==IntPtr.Zero){ChildProcess.Stop(process);throw new ControlException("client-process-guard");}
        var pointer=Marshal.AllocHGlobal(Marshal.SizeOf<Extended>());string? file=null;
        try{
            var info=new Extended{Basic=new Basic{LimitFlags=0x2000}};Marshal.StructureToPtr(info,pointer,false);
            if(!SetInformationJobObject(job,9,pointer,(uint)Marshal.SizeOf<Extended>()))throw new IOException();
            if(!AssignProcessToJobObject(job,process.Handle)){
                // A completed read-only tool needs no surviving process ownership.
                if(process.HasExited){CloseHandle(job);return null;}throw new IOException();
            }
            using var owner=Process.GetCurrentProcess();var value=new ProcessLease(id,name,owner.Id,owner.StartTime.ToUniversalTime().Ticks,process.Id,process.StartTime.ToUniversalTime().Ticks,WindowsCodexAdapter.ToolHash(executable),PrivacyPacket.Hash(Path.GetFullPath(directory)));
            file=Path.Combine(root,id+".dpapi");var clear=JsonSerializer.SerializeToUtf8Bytes(value,ProtocolJson.Options);try{File.WriteAllBytes(file,DpapiAdminCredentialVault.Transform(clear,Entropy,true,16384));}finally{CryptographicOperations.ZeroMemory(clear);}
            return new(job,file);
        }catch{TerminateJobObject(job,1);ChildProcess.Stop(process);CloseHandle(job);if(file is not null&&File.Exists(file))File.Delete(file);throw new ControlException("client-process-guard");}
        finally{Marshal.FreeHGlobal(pointer);}
    }
    private static bool OwnerAlive(ProcessLease value)
    {try{using var p=Process.GetProcessById(value.OwnerPid);return !p.HasExited&&p.StartTime.ToUniversalTime().Ticks==value.OwnerStart;}catch(ArgumentException){return false;}catch{throw new ControlException("client-process-guard");}}
    public static IReadOnlyList<ProcessObservation> Inspect(bool cleanup=false,string? root=null)
    {
        if(!OperatingSystem.IsWindows())return[];root=Path.GetFullPath(root??DefaultRoot);SafePath.NoLinks(root);if(!Directory.Exists(root))return[];var files=Directory.EnumerateFiles(root,"*.dpapi").Take(501).ToArray();if(files.Length>500)throw new ControlException("client-process-guard");var result=new List<ProcessObservation>();
        foreach(var file in files){SafePath.NoLinks(file);if(new FileInfo(file).Length>16384)throw new ControlException("client-process-guard");var clear=DpapiAdminCredentialVault.Transform(File.ReadAllBytes(file),Entropy,false,16384);ProcessLease v;try{v=JsonSerializer.Deserialize<ProcessLease>(clear,ProtocolJson.Options)??throw new IOException();}finally{CryptographicOperations.ZeroMemory(clear);}
            if(!Guid.TryParseExact(v.Id,"D",out _)||Path.GetFileName(file)!=v.Id+".dpapi"||v.JobName!="Local\\RiftAssist.Owned."+v.Id)throw new ControlException("client-process-guard");
            if(OwnerAlive(v)){result.Add(new(v.Id,"active-owner · 보존"));continue;}
            var owned=OpenJobObject(0x0004|0x0008,false,v.JobName);
            try{
                if(owned==IntPtr.Zero){if(Marshal.GetLastWin32Error()!=2)throw new ControlException("client-process-guard");if(cleanup)File.Delete(file);result.Add(new(v.Id,"exited · 실행 재개 없음"));}
                else{if(cleanup){if(!TerminateJobObject(owned,1))throw new ControlException("client-process-guard");File.Delete(file);}result.Add(new(v.Id,cleanup?"owned-job-terminated":"orphan-owned-job · 명시적 정리 가능"));}
            }finally{if(owned!=IntPtr.Zero)CloseHandle(owned);}
        }return result;
    }
    public void Dispose(){var h=Interlocked.Exchange(ref handle,IntPtr.Zero);if(h!=IntPtr.Zero){CloseHandle(h);if(receipt is not null&&File.Exists(receipt))try{File.Delete(receipt);}catch{/* encrypted receipt may be reconciled later */}}}
    [StructLayout(LayoutKind.Sequential)] private struct Basic{public long PerProcessUserTimeLimit,PerJobUserTimeLimit;public uint LimitFlags;public UIntPtr MinimumWorkingSetSize,MaximumWorkingSetSize;public uint ActiveProcessLimit;public UIntPtr Affinity;public uint PriorityClass,SchedulingClass;}
    [StructLayout(LayoutKind.Sequential)] private struct Io{public ulong ReadOperationCount,WriteOperationCount,OtherOperationCount,ReadTransferCount,WriteTransferCount,OtherTransferCount;}
    [StructLayout(LayoutKind.Sequential)] private struct Extended{public Basic Basic;public Io Io;public UIntPtr ProcessMemoryLimit,JobMemoryLimit,PeakProcessMemoryUsed,PeakJobMemoryUsed;}
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]private static extern IntPtr CreateJobObject(IntPtr attributes,string name);
    [DllImport("kernel32.dll",SetLastError=true)]private static extern bool SetInformationJobObject(IntPtr job,int info,IntPtr data,uint length);
    [DllImport("kernel32.dll",SetLastError=true)]private static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
    [DllImport("kernel32.dll",SetLastError=true)]private static extern bool TerminateJobObject(IntPtr job,uint code);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]private static extern IntPtr OpenJobObject(uint access,bool inherit,string name);
    [DllImport("kernel32.dll")]private static extern bool CloseHandle(IntPtr handle);
}
