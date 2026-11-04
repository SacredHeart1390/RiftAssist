using System.Security.Cryptography;
using System.Text.Json;

namespace RiftAssist.ControlCenter.Core;

public sealed record SourceBlob(string Path,byte[] Bytes);
public sealed record RepositorySource(string Commit,string Tree,string Actor,long ActorId,SourceBlob[] Files);
public sealed record ChangedSource(string Path,string? Content,string BeforeHash,string AfterHash);
public sealed record RealRepairJob(string Id,int Revision,string ReportId,string ReportRevision,string Packet,string PacketHash,string State,DateTimeOffset Created,string BaseCommit,string BaseTree,string Actor,long ActorId,Dictionary<string,string> Baseline,ChangedSource[] Changes,string Diff,string Tests,string ReviewHash,string? CommitSha,string? PrUrl,string[] Events)
{
    public string Branch=>"codex/incident-"+Id.Replace("-","");
    public string ModelSummary{get;init;}="";
    public long? InputTokens{get;init;}
    public long? OutputTokens{get;init;}
}
public sealed class RealRepairStore(string root,IUserDataProtection protection)
{
    public string Root{get;}=Path.GetFullPath(root);
    public static RealRepairStore Local()=>new(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"RiftAssist","ControlCenter","RealRepairs"),new WindowsRealRepairProtection());
    public string JobDirectory(string id){if(!Guid.TryParseExact(id,"D",out _))throw new ControlException("client-real-store");var p=Path.Combine(Root,"Jobs",id);SafePath.NoLinks(p);return p;}
    private string FileFor(string id){_=JobDirectory(id);return Path.Combine(Root,id+".dpapi");}
    public FileStream? Activity(string id){var path=Path.Combine(Root,"job-"+id+".lock");_=JobDirectory(id);SafePath.NoLinks(path);try{return new(path,FileMode.OpenOrCreate,FileAccess.ReadWrite,FileShare.None);}catch(IOException){return null;}}
    public RealRepairJob Read(string id)
    {
        byte[]? clear=null;
        try{var p=FileFor(id);SafePath.NoLinks(p);if(new FileInfo(p).Length is <1 or >4194304)throw new IOException();clear=protection.Unprotect(File.ReadAllBytes(p));if(clear.Length>4194304)throw new IOException();var j=JsonSerializer.Deserialize<RealRepairJob>(clear,ProtocolJson.Options)??throw new IOException();Validate(j);if(j.Id!=id)throw new IOException();return j;}
        catch{throw new ControlException("client-real-store");}finally{if(clear is not null)CryptographicOperations.ZeroMemory(clear);}
    }
    private static void Validate(RealRepairJob j)
    {
        if(!Guid.TryParseExact(j.Id,"D",out _)||!Guid.TryParseExact(j.ReportId,"D",out _)||j.Revision<1||j.PacketHash!=PrivacyPacket.Hash(j.Packet)||j.Baseline.Count>1200||j.Changes.Length>80||j.Events.Length>150||!RealRepairCoordinator.States.Contains(j.State))throw new IOException();
        foreach(var p in j.Baseline.Keys)RepairScope.PathValid(p);
        foreach(var p in j.Changes)if(!RepairScope.Editable(p.Path)&&!RepairScope.Derived.Contains(p.Path))throw new IOException();
        if(j.PrUrl is not null&&!j.PrUrl.StartsWith("https://github.com/"+RepairScope.Repository+"/pull/",StringComparison.Ordinal))throw new IOException();
    }
    public IReadOnlyList<RealRepairJob> List()
    {try{SafePath.NoLinks(Root);if(!Directory.Exists(Root))return[];var files=Directory.EnumerateFiles(Root,"*.dpapi").Take(201).ToArray();if(files.Length>200)throw new IOException();return files.Select(p=>Read(Path.GetFileNameWithoutExtension(p))).OrderByDescending(j=>j.Created).ToArray();}catch{throw new ControlException("client-real-store");}}
    public RealRepairJob Save(RealRepairJob value,int revision)
    {
        byte[]? clear=null;string? tmp=null;
        try{
            SafePath.NoLinks(Root);Directory.CreateDirectory(Root);protection.SecureDirectory(Root);var file=FileFor(value.Id);SafePath.NoLinks(file);var lockFile=Path.Combine(Root,"store.lock");SafePath.NoLinks(lockFile);
            using var held=new FileStream(lockFile,FileMode.OpenOrCreate,FileAccess.ReadWrite,FileShare.None);var old=File.Exists(file)?Read(value.Id):null;
            if((old?.Revision??0)!=revision)throw new ControlException("client-real-conflict");if(old is null&&Directory.EnumerateFiles(Root,"*.dpapi").Take(200).Count()>=200)throw new IOException();
            if(old is null){var duplicate=List().FirstOrDefault(j=>j.ReportId==value.ReportId&&j.ReportRevision==value.ReportRevision&&j.PacketHash==value.PacketHash);if(duplicate is not null)return duplicate;}
            var next=value with{Revision=revision+1};Validate(next);clear=JsonSerializer.SerializeToUtf8Bytes(next,ProtocolJson.Options);if(clear.Length>4000000)throw new IOException();var bytes=protection.Protect(clear);if(bytes.Length>4194304)throw new IOException();
            tmp=Path.Combine(Root,Guid.NewGuid().ToString("N")+".tmp");using(var f=new FileStream(tmp,FileMode.CreateNew,FileAccess.Write,FileShare.None)){f.Write(bytes);f.Flush(true);}File.Move(tmp,file,old is not null);return next;
        }catch(ControlException){throw;}catch{throw new ControlException("client-real-store");}
        finally{if(clear is not null)CryptographicOperations.ZeroMemory(clear);if(tmp is not null&&File.Exists(tmp))try{File.Delete(tmp);}catch{}}
    }
}
public sealed class WindowsRealRepairProtection:IUserDataProtection
{
    private static byte[] Entropy=>ProtocolJson.Utf8.GetBytes("RiftAssist.ControlCenter/real-repairs/v1");
    public byte[] Protect(byte[] b)=>DpapiAdminCredentialVault.Transform(b,Entropy,true,4194304);
    public byte[] Unprotect(byte[] b)=>DpapiAdminCredentialVault.Transform(b,Entropy,false,4194304);
    public void SecureDirectory(string p){if(!OperatingSystem.IsWindows())throw new ControlException("client-real-store");DpapiAdminCredentialVault.ProtectDirectory(p);}
}
