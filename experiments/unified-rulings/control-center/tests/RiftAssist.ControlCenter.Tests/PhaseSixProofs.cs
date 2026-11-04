using System.Security.Cryptography;
using System.Text.Json;
using RiftAssist.ControlCenter.Core;

internal static class PhaseSixProofs
{
    private const string Report="12345678-1234-1234-1234-123456789abc";
    private static IncidentInput Input(string revision="manual:1")=>new(Report,"local-manual",revision,true,"합성 질문 · damage timing","합성 답변","합성 오류","합성 기대","합성 메모","합성 근거 · 검증 전","mock:practice","synthetic-version");
    public static async Task RunAsync(ProofSuite s,BackendLayout backend,string temporary)
    {
        var raw=Input();var packet=raw.Preview();var finding=IncidentAnalysisPolicy.Conservative(packet,"synthetic-metadata");
        s.Check("analysis manual revision and memory summary remain explicit",()=>{
            var d=new ManualReportDocument(1,Report,7,DateTimeOffset.UtcNow,DateTimeOffset.UtcNow,new(){Title="합성",Error="합성",MemorySummary=true},[]);
            var p=IncidentInput.Manual(d);ProofSuite.Equal(p.Revision,"manual:7");ProofSuite.True(p.MemorySummary&&p.Preview().Text.Contains("memorySummary",StringComparison.Ordinal));
        });
        s.Check("API projection excludes trace session identifiers and uses content revision",()=>{
            JsonElement Row(string error,string ignored)=>ProtocolJson.Element(new{id=Report,content=new{description=error,expected="합성 기대",tags=Array.Empty<string>()},category="ruling",status="received",snapshot=new{question=new{text="합성 질문"},response=new{recommendation="합성 답변",evidence=Array.Empty<object>(),cards=Array.Empty<object>()},trace=new{token=ignored}},history=Array.Empty<object>(),request_id=ignored});
            var first=IncidentInput.Api(Row("합성 오류","synthetic-token"),"azure-api");var second=IncidentInput.Api(Row("합성 오류","other-ignored"),"azure-api");
            ProofSuite.Equal(first.Revision,second.Revision);ProofSuite.True(first.Revision!=IncidentInput.Api(Row("수정 오류","ignored"),"azure-api").Revision);
            ProofSuite.True(!first.Preview().Text.Contains("synthetic-token",StringComparison.Ordinal)&&first.AppVersion.Contains("미기록",StringComparison.Ordinal));
        });
        s.Check("privacy redacts known key cookie UUID email phone address path and PEM canaries",()=>{
            var secret=new string('b',64);var value=$"합성 내용 manager_key={secret} session_id=synthetic-session-123 email=person@example.invalid 010-1234-5678 192.0.2.99 {Report} https://example.invalid/?token=hidden C:\\Users\\synthetic\\private.key /home/synthetic/operations.sqlite\n"+"-----BEGIN "+"OPENSSH PRIVATE KEY-----\nsynthetic-private-value\n"+"-----END "+"OPENSSH PRIVATE KEY-----";
            var clean=PrivacyPacket.Create(value);foreach(var canary in new[]{secret,"synthetic-session-123","person@example.invalid","010-1234-5678","192.0.2.99",Report,"hidden","private.key","operations.sqlite","synthetic-private-value"})ProofSuite.True(!clean.Text.Contains(canary,StringComparison.Ordinal));
            ProofSuite.Equal(PrivacyPacket.Create(clean.Text).Text,clean.Text);ProofSuite.True(clean.Redactions>5);
            var headers=PrivacyPacket.Create("Authorization: Bearer synthetic-opaque-value\nCookie: other=sensitive-synthetic; second=another-synthetic\nsecret=synthetic-secret-value");
            foreach(var headerCanary in new[]{"synthetic-opaque-value","sensitive-synthetic","another-synthetic","synthetic-secret-value"})ProofSuite.True(!headers.Text.Contains(headerCanary,StringComparison.Ordinal));
        });
        s.Check("consent binds exact redacted contents and destination; real execution remains denied",()=>{
            var ok=AnalysisConsent.Approve("local-analysis",packet);ok.Require("local-analysis",packet);
            ProofSuite.Throws(()=>ok.Require("external-codex",packet));ProofSuite.Throws(()=>ok.Require("local-analysis",PrivacyPacket.Create("changed")));
            ProofSuite.Throws(()=>CodexBridge.RequireExecution(AnalysisConsent.Approve("external-codex",packet),packet));ProofSuite.True(!IncidentAnalysisPolicy.ExternalAnalysisEnabled&&!IncidentAnalysisPolicy.ExternalCodexEnabled);
            ProofSuite.True(CodexBridge.PlannedArguments.Contains("--ephemeral")&&!CodexBridge.PlannedArguments.Contains("--dangerously-bypass-approvals-and-sandbox"));
        });
        await s.CheckAsync("existing verified retrieval card schema and answer policy run offline without official claims",async()=>{
            var result=await new OfflineIncidentAnalyzer(backend).AnalyzeAsync(packet,default);ProofSuite.True(result.Retrieval.Contains("retrievalPolicy",StringComparison.Ordinal));
            ProofSuite.True(result.CorrectRulingCandidate.Contains("보류",StringComparison.Ordinal)&&result.Reproduction.Contains("미실행",StringComparison.Ordinal)&&result.Cost.ExternalCalls==0);
        });
        using var crypto=new Crypto();var store=new AnalysisLedger(Path.Combine(temporary,"phase6-history"),crypto);AnalysisEntry? entry=null;
        s.Check("analysis encrypted ledger is separate, cached and reopenable with linked revision",()=>{
            entry=store.Create(raw,packet,finding,AnalysisConsent.Approve("local-analysis",packet));var again=new AnalysisLedger(store.Root,crypto).Create(raw,packet,finding,AnalysisConsent.Approve("local-analysis",packet));
            ProofSuite.Equal(entry.Id,again.Id);ProofSuite.Equal(store.List().Count,1);ProofSuite.Equal(again.ReportRevision,"manual:1");
            var bytes=File.ReadAllBytes(Path.Combine(store.Root,entry.Id+".dpapi"));ProofSuite.True(bytes.AsSpan().IndexOf(ProtocolJson.Utf8.GetBytes("합성 질문"))<0&&!Directory.EnumerateFiles(store.Root,"*.tmp").Any());
        });
        s.Check("stored provider output is scrubbed and paid providers cannot silently enter ledger",()=>{
            var canary=new string('c',64);var input=Input("manual:2");var saved=store.Create(input,packet,finding with{Facts=canary},AnalysisConsent.Approve("local-analysis",packet));
            ProofSuite.True(!saved.Finding.Facts.Contains(canary,StringComparison.Ordinal));
            ProofSuite.Throws(()=>store.Create(Input("manual:3"),packet,finding with{Cost=finding.Cost with{ExternalCalls=1}},AnalysisConsent.Approve("local-analysis",packet)));
        });
        s.Check("analysis CAS lock and protection failure preserve existing ciphertext",()=>{
            var first=store.Read(entry!.Id);var path=Path.Combine(store.Root,first.Id+".dpapi");var before=File.ReadAllBytes(path);
            ProofSuite.Throws(()=>store.Save(first,0));crypto.Fail=true;ProofSuite.Throws(()=>store.Save(first,first.Revision));crypto.Fail=false;ProofSuite.True(before.SequenceEqual(File.ReadAllBytes(path)));
            using(var held=new FileStream(Path.Combine(store.Root,"ledger.lock"),FileMode.Open,FileAccess.ReadWrite,FileShare.None))ProofSuite.Throws(()=>store.Save(first,first.Revision));
        });
        s.Check("corrupted analysis ciphertext fails closed without overwrite",()=>{
            var path=Path.Combine(store.Root,entry!.Id+".dpapi");var bytes=File.ReadAllBytes(path);var bad=bytes.ToArray();bad[^1]^=1;File.WriteAllBytes(path,bad);ProofSuite.Throws(()=>store.Read(entry.Id));ProofSuite.True(bad.SequenceEqual(File.ReadAllBytes(path)));File.WriteAllBytes(path,bytes);
        });
        await s.CheckAsync("mock repair runs actual Node before failure and after pass in owned synthetic workspace",async()=>{
            var coordinator=new RepairCoordinator(store,new MockRepairWorker(backend));var p=CodexBridge.Prompt(entry!,"v030-improvement");
            entry=await coordinator.RunMockAsync(entry!.Id,"v030-improvement",AnalysisConsent.Approve("synthetic-repair",p),null,default);
            var job=entry.Jobs.Single();ProofSuite.Equal(job.State,"ready-for-review");ProofSuite.True(job.Tests.Contains("수정 전 실패",StringComparison.Ordinal)&&job.Synthetic&&job.Cost.ExternalCalls==0);
            var work=Path.Combine(store.Root,"Workspaces",job.Id);ProofSuite.Equal(File.ReadAllText(Path.Combine(work,"ruling.cjs")),MockRepairWorker.After);ProofSuite.True(job.Diff.StartsWith("diff --git",StringComparison.Ordinal));
            var again=await coordinator.RunMockAsync(entry.Id,"v030-improvement",AnalysisConsent.Approve("synthetic-repair",p),null,default);ProofSuite.Equal(again.Jobs.Length,1);ProofSuite.Equal(again.Revision,entry.Revision);
            ProofSuite.True(CodexBridge.PrCandidate(job).Contains("모의",StringComparison.Ordinal));ProofSuite.Throws(()=>CodexBridge.Publish(job,AnalysisConsent.Approve("github-candidate",CodexBridge.PublicationPreview(job))));ProofSuite.Throws(()=>CodexBridge.Publish(job,AnalysisConsent.Approve("other",packet)));
        });
        await s.CheckAsync("v017 emergency and v030 improvement jobs have separate IDs and never touch release code",async()=>{
            var coordinator=new RepairCoordinator(store,new Worker());var p=CodexBridge.Prompt(entry!,"v017-emergency");entry=await coordinator.RunMockAsync(entry!.Id,"v017-emergency",AnalysisConsent.Approve("synthetic-repair",p),null,default);
            ProofSuite.Equal(entry.Jobs.Length,2);ProofSuite.True(entry.Jobs[0].Id!=entry.Jobs[1].Id&&entry.Jobs.Select(j=>j.Lane).Distinct().Count()==2);ProofSuite.True(p.Text.Contains("v0.1.7 운영 소스는 수정하지",StringComparison.Ordinal));
        });
        foreach(var mode in new[]{"cancelled","disconnected","failed","unsafe-result"})await s.CheckAsync("repair terminal status blocks duplicate execution: "+mode,async()=>{
            var r=store.Create(Input("manual:"+mode),packet,finding,AnalysisConsent.Approve("local-analysis",packet));var worker=new Worker{Mode=mode};var coordinator=new RepairCoordinator(store,worker);var p=CodexBridge.Prompt(r,"v030-improvement");
            r=await coordinator.RunMockAsync(r.Id,"v030-improvement",AnalysisConsent.Approve("synthetic-repair",p),null,default);
            ProofSuite.Equal(r.Jobs.Single().State,mode=="disconnected"?"uncertain":mode=="unsafe-result"?"failed":mode);
            await coordinator.RunMockAsync(r.Id,"v030-improvement",AnalysisConsent.Approve("synthetic-repair",p),null,default);ProofSuite.Equal(worker.Calls,1);ProofSuite.Throws(()=>CodexBridge.PrCandidate(r.Jobs.Single()));
        });
        s.Check("restart recovery marks pending jobs uncertain without executing them",()=>{
            var current=store.Read(entry!.Id);var pending=current.Jobs[0] with{Id=Guid.NewGuid().ToString("D"),State="running"};current=store.Save(current with{Jobs=[..current.Jobs,pending]},current.Revision);
            var worker=new Worker();using(var active=store.TryJobLock(pending.Id)){var running=new RepairCoordinator(store,worker).Recover(current);ProofSuite.Equal(running.Jobs.Last().State,"running");}
            var recovered=new RepairCoordinator(store,worker).Recover(current);ProofSuite.Equal(recovered.Jobs.Last().State,"uncertain");ProofSuite.Equal(worker.Calls,0);
        });
        s.Check("copy requests require bound consent and preserve job identity with prepared and complete states",()=>{
            var current=store.Read(entry!.Id);var coordinator=new RepairCoordinator(store,new Worker());var p=CodexBridge.Prompt(current,"v030-improvement");
            ProofSuite.Throws(()=>coordinator.PrepareCopy(current,"v030-improvement",p,AnalysisConsent.Approve("external-codex",p)));
            current=coordinator.PrepareCopy(current,"v030-improvement",p,AnalysisConsent.Approve("clipboard-codex",p));ProofSuite.Equal(current.Jobs.Last().State,"prompt-prepared");
            current=coordinator.CompleteCopy(current,current.Jobs.Last().Id,true);ProofSuite.Equal(current.Jobs.Last().State,"prompt-copied");
            var again=coordinator.PrepareCopy(current,"v030-improvement",p,AnalysisConsent.Approve("clipboard-codex",p));ProofSuite.Equal(again.Revision,current.Revision);ProofSuite.Equal(again.Jobs.Last().Id,current.Jobs.Last().Id);
        });
        s.Check("Codex JSON events are bounded progress only and completion is never verified success",()=>{
            ProofSuite.Equal(CodexBridge.EventState("{\"type\":\"turn.completed\",\"secret\":\"synthetic-token\"}"),"agent-finished-unverified");
            ProofSuite.Equal(CodexBridge.EventState("{\"type\":\"unknown\"}"),"ignored");ProofSuite.Throws(()=>CodexBridge.EventState("{invalid"));ProofSuite.Throws(()=>CodexBridge.EventState(new string('x',65537)));
        });
        if(OperatingSystem.IsWindows())s.Check("actual analysis DPAPI reopens and cannot share manual report purpose entropy",()=>{
            var root=Path.Combine(temporary,"phase6-dpapi");var native=new AnalysisLedger(root,new WindowsAnalysisProtection());var saved=native.Create(raw,packet,finding,AnalysisConsent.Approve("local-analysis",packet));
            ProofSuite.Equal(new AnalysisLedger(root,new WindowsAnalysisProtection()).Read(saved.Id).ReportRevision,"manual:1");
            ProofSuite.Throws(()=>new WindowsReportProtection().Unprotect(File.ReadAllBytes(Path.Combine(root,saved.Id+".dpapi"))));
        });
        else s.Check("analysis symlink root is rejected without following it",()=>{var link=Path.Combine(temporary,"phase6-link");Directory.CreateSymbolicLink(link,store.Root);ProofSuite.Throws(()=>new AnalysisLedger(link,crypto).List());Directory.Delete(link);});
    }
    private sealed class Worker:ISyntheticRepairWorker
    {
        public string Mode="ok";public int Calls;
        public Task<SyntheticRepairResult> RunAsync(string workspace,CancellationToken cancellation){Calls++;return Mode switch{
            "cancelled"=>Task.FromException<SyntheticRepairResult>(new OperationCanceledException()),"disconnected"=>Task.FromException<SyntheticRepairResult>(new ControlException("client-analysis-disconnected")),"failed"=>Task.FromException<SyntheticRepairResult>(new IOException()),
            _=>Task.FromResult(new SyntheticRepairResult("synthetic diff",[Mode=="unsafe-result"?"../outside":"synthetic/ruling.cjs"],"synthetic tests","synthetic risk"))};}
    }
    private sealed class Crypto:IUserDataProtection,IDisposable
    {
        private readonly byte[] key=RandomNumberGenerator.GetBytes(32);public bool Fail;
        public byte[] Protect(byte[] plain){if(Fail)throw new IOException();var bytes=new byte[plain.Length+28];RandomNumberGenerator.Fill(bytes.AsSpan(0,12));using var aes=new AesGcm(key,16);aes.Encrypt(bytes.AsSpan(0,12),plain,bytes.AsSpan(28),bytes.AsSpan(12,16));return bytes;}
        public byte[] Unprotect(byte[] data){var plain=new byte[data.Length-28];using var aes=new AesGcm(key,16);aes.Decrypt(data.AsSpan(0,12),data.AsSpan(28),data.AsSpan(12,16),plain);return plain;}
        public void SecureDirectory(string path){}public void Dispose()=>CryptographicOperations.ZeroMemory(key);
    }
}
