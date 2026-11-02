using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace RiftAssist.ControlCenter.Core;

public sealed class WindowsAnalysisProtection:IUserDataProtection
{
    private static byte[] Entropy=>ProtocolJson.Utf8.GetBytes("RiftAssist.ControlCenter/incident-analysis/v1");
    public byte[] Protect(byte[] data)=>DpapiAdminCredentialVault.Transform(data,Entropy,true,ManualReportStore.MaxFileBytes);
    public byte[] Unprotect(byte[] data)=>DpapiAdminCredentialVault.Transform(data,Entropy,false,ManualReportStore.MaxFileBytes);
    public void SecureDirectory(string path){if(!OperatingSystem.IsWindows())throw new ControlException("client-analysis-storage");DpapiAdminCredentialVault.ProtectDirectory(path);}
}
public sealed record RepairJob(string Id,string Lane,string State,string PacketHash,string[] Events,string Diff,string[] Files,string Tests,string Risks,bool Synthetic,AnalysisCost Cost);
public sealed record AnalysisEntry(string Id,int Revision,string ReportId,string Source,string ReportRevision,string InputHash,DateTimeOffset At,string Preview,IncidentFinding Finding,RepairJob[] Jobs) { public int SchemaVersion { get; init; } = 1; }
public sealed class AnalysisLedger(string directory,IUserDataProtection protection)
{
    public string Root{get;}=Path.GetFullPath(directory);
    private static JsonSerializerOptions Options=>new(ProtocolJson.Options){UnmappedMemberHandling=JsonUnmappedMemberHandling.Disallow};
    public static AnalysisLedger Local()=>new(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"RiftAssist","ControlCenter","IncidentAnalysis"),new WindowsAnalysisProtection());
    private string FileFor(string id){if(!Guid.TryParseExact(id,"D",out var guid)||guid.ToString("D")!=id)throw new ControlException("client-analysis-storage");var file=Path.Combine(Root,id+".dpapi");SafePath.NoLinks(file);return file;}
    public FileStream? TryJobLock(string id)
    {
        _=FileFor(id);var path=Path.Combine(Root,"job-"+id+".lock");SafePath.NoLinks(path);
        try{return new FileStream(path,FileMode.OpenOrCreate,FileAccess.ReadWrite,FileShare.None);}catch(IOException){return null;}
    }
    public IReadOnlyList<AnalysisEntry> List()
    {
        try{SafePath.NoLinks(Root);if(!Directory.Exists(Root))return[];var paths=Directory.EnumerateFiles(Root,"*.dpapi").Take(301).ToArray();if(paths.Length>300)throw new IOException();return paths.Select(p=>Read(Path.GetFileNameWithoutExtension(p))).OrderByDescending(e=>e.At).ToArray();}
        catch{throw new ControlException("client-analysis-storage");}
    }
    public AnalysisEntry Read(string id)
    {
        byte[]? data=null;
        try{var file=FileFor(id);if(new FileInfo(file).Length is <1 or >ManualReportStore.MaxFileBytes)throw new IOException();data=protection.Unprotect(File.ReadAllBytes(file));if(data.Length>ManualReportStore.MaxFileBytes)throw new IOException();var e=JsonSerializer.Deserialize<AnalysisEntry>(data,Options)??throw new IOException();Validate(e);if(e.Id!=id)throw new IOException();return e;}
        catch{throw new ControlException("client-analysis-storage");}finally{if(data is not null)CryptographicOperations.ZeroMemory(data);}
    }
    private static void Validate(AnalysisEntry e)
    {
        if(e.SchemaVersion!=1||e.Revision<1||e.Revision>10000||!Guid.TryParseExact(e.ReportId,"D",out _)||e.Source is not("local-manual" or "azure-api" or "synthetic-development")||e.ReportRevision.Length>100||e.Jobs.Length>20||e.Finding.Cost.ExternalCalls!=0||e.Preview.Length>180000||e.InputHash!=PrivacyPacket.Hash(e.Preview)||e.Jobs.Select(j=>j.Id).Distinct().Count()!=e.Jobs.Length)throw new IOException();
        foreach(var j in e.Jobs)if(!Guid.TryParseExact(j.Id,"D",out _)||j.Lane is not("v017-emergency" or "v020-improvement")||!RepairCoordinator.States.Contains(j.State)||j.Events.Length>50||!j.Synthetic||j.Cost.ExternalCalls!=0||j.PacketHash.Length!=64)throw new IOException();
    }
    public AnalysisEntry Save(AnalysisEntry entry,int expectedRevision)
    {
        byte[]? data=null;string? temporary=null;
        try{
            SafePath.NoLinks(Root);Directory.CreateDirectory(Root);protection.SecureDirectory(Root);var file=FileFor(entry.Id);var lockPath=Path.Combine(Root,"ledger.lock");SafePath.NoLinks(lockPath);
            using var held=new FileStream(lockPath,FileMode.OpenOrCreate,FileAccess.ReadWrite,FileShare.None);
            var exists=File.Exists(file);if((exists?Read(entry.Id).Revision:0)!=expectedRevision)throw new ControlException("client-analysis-conflict");
            if(!exists){var duplicate=List().FirstOrDefault(e=>e.ReportId==entry.ReportId&&e.Source==entry.Source&&e.ReportRevision==entry.ReportRevision&&e.InputHash==entry.InputHash);if(duplicate is not null)return duplicate;}
            if(!exists&&Directory.EnumerateFiles(Root,"*.dpapi").Take(300).Count()>=300)throw new IOException();
            var next=entry with{Revision=expectedRevision+1};Validate(next);data=JsonSerializer.SerializeToUtf8Bytes(next,Options);if(data.Length>ManualReportStore.MaxFileBytes-1024)throw new IOException();
            var cipher=protection.Protect(data);if(cipher.Length>ManualReportStore.MaxFileBytes)throw new IOException();temporary=Path.Combine(Root,Guid.NewGuid().ToString("N")+".tmp");SafePath.NoLinks(temporary);
            using(var f=new FileStream(temporary,FileMode.CreateNew,FileAccess.Write,FileShare.None)){f.Write(cipher);f.Flush(true);}File.Move(temporary,file,exists);return next;
        }catch(ControlException){throw;}catch{throw new ControlException("client-analysis-storage");}
        finally{if(data is not null)CryptographicOperations.ZeroMemory(data);if(temporary is not null&&File.Exists(temporary))try{File.Delete(temporary);}catch{}}
    }
    public AnalysisEntry Create(IncidentInput input,PrivacyPacket packet,IncidentFinding finding,AnalysisConsent approval)
    {
        approval.Require("local-analysis",packet);
        if(PrivacyPacket.Create(packet.Text).Text!=packet.Text||PrivacyPacket.Hash(packet.Text)!=packet.Digest)throw new ControlException("client-analysis-consent");
        var old=List().FirstOrDefault(e=>e.ReportId==input.ReportId&&e.Source==input.Source&&e.ReportRevision==input.Revision&&e.InputHash==packet.Digest);if(old is not null)return old;
        return Save(new(Guid.NewGuid().ToString("D"),0,input.ReportId,input.Source,input.Revision,packet.Digest,DateTimeOffset.UtcNow,packet.Text,finding.Redacted(),[]),0);
    }
}
