using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace RiftAssist.ControlCenter.Core;

public sealed record ManualReportDraft
{
    public string Title { get; set; } = "";
    public string Category { get; set; } = "룰링";
    public string Question { get; set; } = "";
    public string ActualAnswer { get; set; } = "";
    public string Error { get; set; } = "";
    public string Expected { get; set; } = "";
    public string RuleEvidence { get; set; } = "";
    public string OccurredVersion { get; set; } = "";
    public string Channel { get; set; } = "대면";
    public string Status { get; set; } = "received";
    public string AdminNote { get; set; } = "";
    public bool MemorySummary { get; set; }
    public static readonly string[] Categories = ["룰링", "카드 데이터", "번역", "검색", "UI", "기타"];
    public static readonly string[] Channels = ["웹", "대면", "디스코드", "기타"];
    public void Validate()
    {
        var fields = new (string Value, int Max)[] { (Title,200),(Question,10000),(ActualAnswer,30000),(Error,5000),(Expected,5000),(RuleEvidence,5000),(OccurredVersion,80),(AdminNote,3000) };
        if (fields.Any(f => f.Value is null || f.Value.Length > f.Max || f.Value.Any(c => char.IsControl(c) && c is not ('\n' or '\r' or '\t')))
            || string.IsNullOrWhiteSpace(Title) || string.IsNullOrWhiteSpace(Error) || !Categories.Contains(Category) || !Channels.Contains(Channel) || !OperationsPolicy.ReportStates.Contains(Status)) throw new ControlException("client-manual-validation");
        foreach (var f in fields) try { _ = ProtocolJson.Utf8.GetByteCount(f.Value); } catch { throw new ControlException("client-manual-validation"); }
    }
}
public sealed record ManualReportEvent(int Revision, DateTimeOffset At, string Action, string Status, string AdminNote);
public sealed record ManualReportDocument(int SchemaVersion, string Id, int Revision, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, ManualReportDraft Draft, IReadOnlyList<ManualReportEvent> History)
{
    public string Detail() => $"수동 제보 · 로컬 암호화 저장 · {Id} · revision {Revision}\n{Draft.Title}\n분류: {Draft.Category} · 상태: {Draft.Status} · 경로: {Draft.Channel}\n원문 정확성: {(Draft.MemorySummary ? "기억에 근거한 요약" : "기록된 원문 (정확성은 관리자 확인 필요)")}\n발생 버전: {Draft.OccurredVersion}\n\n질문\n{Draft.Question}\n\n실제 AI 답변\n{Draft.ActualAnswer}\n\n지적한 오류\n{Draft.Error}\n\n기대 판정\n{Draft.Expected}\n\n공식 규칙 근거 (관리자 입력·검증 필요)\n{Draft.RuleEvidence}\n\n관리자 메모\n{Draft.AdminNote}\n\n로컬 감사 기록\n" + string.Join("\n", History.Select(e => $"{e.At:u} · r{e.Revision} · {e.Action} · {e.Status} · {e.AdminNote}"));
    // Explicit in-memory DTO boundary for a future opt-in integration. Never sent or saved automatically.
    public object AnalysisDraft() => new { schemaVersion = 1, source = "local-manual", reportId = Id, revision = Revision, memorySummary = Draft.MemorySummary, report = Draft with { } };
}
public interface IUserDataProtection { byte[] Protect(byte[] clear); byte[] Unprotect(byte[] encrypted); void SecureDirectory(string path); }
public sealed class WindowsReportProtection : IUserDataProtection
{
    private static byte[] Entropy => ProtocolJson.Utf8.GetBytes("RiftAssist.ControlCenter/manual-report/v1");
    public byte[] Protect(byte[] clear) => DpapiAdminCredentialVault.Transform(clear, Entropy, true, ManualReportStore.MaxFileBytes);
    public byte[] Unprotect(byte[] encrypted) => DpapiAdminCredentialVault.Transform(encrypted, Entropy, false, ManualReportStore.MaxFileBytes);
    public void SecureDirectory(string path) { if (!OperatingSystem.IsWindows()) throw new ControlException("client-manual-protection"); DpapiAdminCredentialVault.ProtectDirectory(path); }
}
public interface IManualReportStore
{
    IReadOnlyList<ManualReportDocument> List();
    ManualReportDocument Read(string id);
    ManualReportDocument Save(ManualReportDraft draft, string? id = null, int? expectedRevision = null);
}
public sealed class ManualReportStore(string directory, IUserDataProtection protection) : IManualReportStore
{
    public const int MaxFileBytes = 262144;
    private readonly string root = Path.GetFullPath(directory);
    private static JsonSerializerOptions Options => new(ProtocolJson.Options) { UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow };
    public static ManualReportStore Local() => new(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "RiftAssist", "ControlCenter", "ManualReports"), new WindowsReportProtection());
    private string PathFor(string id) { if (!Guid.TryParseExact(id,"D",out var value) || value.ToString("D") != id) throw new ControlException("client-manual-validation"); var p=Path.Combine(root,id+".dpapi"); SafePath.NoLinks(p); return p; }
    public IReadOnlyList<ManualReportDocument> List()
    {
        try { SafePath.NoLinks(root); if (!Directory.Exists(root)) return [];
            var files=Directory.EnumerateFiles(root,"*.dpapi").Take(501).ToArray(); if(files.Length>500) throw new ControlException("client-manual-limit");
            return files.Select(p=>Read(Path.GetFileNameWithoutExtension(p))).OrderByDescending(d=>d.UpdatedAt).ToArray();
        } catch(ControlException){throw;} catch { throw new ControlException("client-manual-protection"); }
    }
    public ManualReportDocument Read(string id)
    {
        byte[]? clear=null;
        try { var p=PathFor(id); if(new FileInfo(p).Length is <1 or >MaxFileBytes) throw new ControlException("client-manual-protection");
            clear=protection.Unprotect(File.ReadAllBytes(p)); if(clear.Length>MaxFileBytes) throw new ControlException("client-manual-protection");
            var d=JsonSerializer.Deserialize<ManualReportDocument>(clear,Options) ?? throw new JsonException();
            if(d.SchemaVersion!=1||d.Id!=id||d.Revision<1||d.History is null||d.History.Count!=d.Revision||d.Revision>1000||d.Draft is null
                ||d.UpdatedAt<d.CreatedAt||d.History.Where((e,i)=>e.Revision!=i+1||e.Action!=(i==0?"created":"updated")||!OperationsPolicy.ReportStates.Contains(e.Status)||e.AdminNote is null||e.AdminNote.Length>3000).Any()) throw new JsonException();
            d.Draft.Validate(); return d;
        } catch { throw new ControlException("client-manual-protection"); } finally{if(clear is not null)CryptographicOperations.ZeroMemory(clear);}
    }
    public ManualReportDocument Save(ManualReportDraft draft,string? id=null,int? expectedRevision=null)
    {
        draft.Validate(); if(id is null && expectedRevision is not null) throw new ControlException("client-manual-conflict");
        byte[]? clear=null; string? temporary=null;
        try {
            SafePath.NoLinks(root); Directory.CreateDirectory(root); protection.SecureDirectory(root);
            var lockPath=Path.Combine(root,"reports.lock");SafePath.NoLinks(lockPath);
            FileStream held; try{held=new FileStream(lockPath,FileMode.OpenOrCreate,FileAccess.ReadWrite,FileShare.None);}catch(IOException){throw new ControlException("client-manual-busy");}
            using(held){
                ManualReportDocument? old=null;
                if(id is not null){old=Read(id);if(old.Revision!=expectedRevision)throw new ControlException("client-manual-conflict");}
                else{if(Directory.EnumerateFiles(root,"*.dpapi").Take(500).Count()>=500)throw new ControlException("client-manual-limit");id=Guid.NewGuid().ToString("D");}
                var path=PathFor(id);var revision=(old?.Revision??0)+1;if(revision>1000)throw new ControlException("client-manual-limit");var at=DateTimeOffset.UtcNow;
                var history=(old?.History??[]).Append(new ManualReportEvent(revision,at,old is null?"created":"updated",draft.Status,draft.AdminNote)).ToArray();
                var doc=new ManualReportDocument(1,id,revision,old?.CreatedAt??at,at,draft with{},history);
                clear=JsonSerializer.SerializeToUtf8Bytes(doc,Options);if(clear.Length>MaxFileBytes-1024)throw new ControlException("client-manual-limit");
                var encrypted=protection.Protect(clear);if(encrypted.Length is <1 or >MaxFileBytes)throw new ControlException("client-manual-protection");
                temporary=Path.Combine(root,Guid.NewGuid().ToString("N")+".tmp");SafePath.NoLinks(temporary);
                using(var f=new FileStream(temporary,FileMode.CreateNew,FileAccess.Write,FileShare.None)){f.Write(encrypted);f.Flush(true);}
                File.Move(temporary,path,old is not null);return doc;
            }
        } catch(ControlException e) when(e.Code.StartsWith("client-manual-",StringComparison.Ordinal)){throw;}
        catch{throw new ControlException("client-manual-protection");}
        finally{if(clear is not null)CryptographicOperations.ZeroMemory(clear);if(temporary is not null&&File.Exists(temporary))try{File.Delete(temporary);}catch{/* encrypted abandoned file only */}}
    }
}
