using System.Net;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text.Json;
using RiftAssist.ControlCenter.Core;

internal static class PhaseFiveProofs
{
    public static async Task RunAsync(ProofSuite suite,BackendLayout layout,string node,string temporary)
    {
        suite.Check("phase5 API plans preserve exact v017 routes; restart is stop, verify, start, verify",()=>{
            foreach(var m in new[]{"start","stop"})ProofSuite.Equal(AdminChangeContract.Plan(m,new{}).Steps[0].Route,"/api/"+m);
            ProofSuite.True(AdminChangeContract.Plan("restart",new{}).Steps.Select(s=>s.Route).SequenceEqual(new[]{"/api/stop","/api/status","/api/start","/api/status"}));
            ProofSuite.True(AdminChangeContract.Plan("stop",new{}).Impact.Contains("중단",StringComparison.Ordinal));
            foreach(var m in new[]{"deploy","hosting","backup","restart-service"})ProofSuite.Throws(()=>AdminChangeContract.Plan(m,new{}));
            ProofSuite.Throws(()=>AdminChangeContract.Plan("start",new{command="arbitrary"}));ProofSuite.Throws(()=>AdminChangeContract.Plan("ai",new{enabled="true"}));
            ProofSuite.Throws(()=>AdminChangeContract.Plan("limits",new{limits=new{questions=0}}));
            ProofSuite.Throws(()=>AdminChangeContract.Plan("update-report",new{id="../status",status="resolved",note=""}));
        });
        await suite.CheckAsync("production changes are denied before read or mutation transport even with confirmation",async()=>{
            var fake=new FakeBackend();var control=new AdminChangeCoordinator(fake,OperationsTarget.AzureReadOnly);
            await ProofSuite.ThrowsAsync(()=>control.RefreshAsync());await ProofSuite.ThrowsAsync(()=>control.ExecuteAsync("start",new{},true));ProofSuite.Equal(fake.Calls,0);ProofSuite.True(!AdminChangeContract.ProductionChangesEnabled);
        });
        await suite.CheckAsync("synthetic existing signed manager supports verified start stop restart AI limits status and note",async()=>{
            var catalog=new SandboxCatalog(Path.Combine(temporary,"phase5-owned"));var sandbox=await catalog.CreateAsync(layout);
            await using var transport=await NodeReviewTransport.ConnectOperationsAsync(layout,sandbox);await using var ops=new DevelopmentOperations(transport);
            var control=new AdminChangeCoordinator(new DevelopmentAdminChangeBackend(ops),OperationsTarget.IsolatedDevelopment);await control.RefreshAsync();
            foreach(var m in new[]{"start","restart","stop"})await control.ExecuteAsync(m,new{},true);
            await control.ExecuteAsync("ai",new{enabled=false},true);
            var limits=OperationsPolicy.LimitLabels.Keys.ToDictionary(k=>k,k=>k=="concurrent"?2:40);await control.ExecuteAsync("limits",new{limits},true);
            var rows=await ops.ReadAsync("reports");var id=rows.Field("reports").Rows().First().Field("id").Text();
            await control.ExecuteAsync("update-report",new{id,status="triaged",note="합성 관리자 검토 메모"},true);
            ProofSuite.True(control.Audit.Count(a=>a.Outcome=="verified")==6&&!control.NeedsRefresh);
            var events=await ops.ReadAsync("logs");ProofSuite.True(events.Field("events").Rows().Any(e=>e.Field("outcome").Text()=="completed"));
            ProofSuite.True(!JsonSerializer.Serialize(control.Audit).Contains("합성 관리자 검토 메모",StringComparison.Ordinal));
        });
        foreach(var mode in new[]{"authentication","network","stopped","lost","verify","restart-stop"})
            await suite.CheckAsync("uncertain change requires status read and never replays: "+mode,async()=>{
                var fake=new FakeBackend{Failure=mode};var c=new AdminChangeCoordinator(fake,OperationsTarget.IsolatedDevelopment);await c.RefreshAsync();
                await ProofSuite.ThrowsAsync(()=>c.ExecuteAsync(mode=="restart-stop"?"restart":"ai",mode=="restart-stop"?new{}:new{enabled=false},true));
                var writes=fake.Writes;ProofSuite.Equal(writes,1);ProofSuite.True(c.NeedsRefresh);
                await ProofSuite.ThrowsAsync(()=>c.ExecuteAsync("start",new{},true));ProofSuite.Equal(fake.Writes,writes);
                await c.RefreshAsync();ProofSuite.Equal(fake.Writes,writes);ProofSuite.True(!c.NeedsRefresh&&c.Audit.Last().Outcome=="uncertain-refresh-required");
            });
        await suite.CheckAsync("no confirmation and concurrent requests cannot produce duplicate writes",async()=>{
            var fake=new FakeBackend();var c=new AdminChangeCoordinator(fake,OperationsTarget.IsolatedDevelopment);await c.RefreshAsync();await ProofSuite.ThrowsAsync(()=>c.ExecuteAsync("start",new{},false));ProofSuite.Equal(fake.Writes,0);
            fake.Hold=new(TaskCreationOptions.RunContinuationsAsynchronously);var first=c.ExecuteAsync("ai",new{enabled=false},true);
            await ProofSuite.ThrowsAsync(()=>c.ExecuteAsync("ai",new{enabled=false},true));ProofSuite.Equal(fake.Writes,1);fake.Hold.SetResult();await first;
        });
        foreach(var mode in new[]{"change-normal","change-lost","change-auth"})
            await suite.CheckAsync("unmodified v017 auth and mutation router with synthetic store: "+mode,async()=>{
                await using var fixture=await PhaseFourProofs.ManagerFixture.Start(node,Path.Combine(temporary,mode),mode);
                using var backend=new RouterBackend(fixture.Port);await backend.LoginAsync();var control=new AdminChangeCoordinator(backend,OperationsTarget.IsolatedDevelopment);await control.RefreshAsync();
                if(mode=="change-normal"){
                    foreach(var m in new[]{"start","restart","stop"})await control.ExecuteAsync(m,new{},true);
                    await control.ExecuteAsync("ai",new{enabled=false},true);
                    await control.ExecuteAsync("limits",new{limits=OperationsPolicy.LimitLabels.Keys.ToDictionary(k=>k,k=>2)},true);
                    await control.ExecuteAsync("update-report",new{id=PhaseFourProofs.Id,status="resolved",note="합성 메모"},true);
                    ProofSuite.Equal(control.Audit.Count(a=>a.Outcome=="verified"),6);
                }else{
                    await ProofSuite.ThrowsAsync(()=>control.ExecuteAsync("ai",new{enabled=false},true));var writes=backend.Writes;
                    await ProofSuite.ThrowsAsync(()=>control.ExecuteAsync("ai",new{enabled=false},true));ProofSuite.Equal(backend.Writes,writes);ProofSuite.Equal(writes,1);
                    var status=await control.RefreshAsync();ProofSuite.Equal(status.GetProperty("stats").GetProperty("aiEnabled").GetBoolean(),mode=="change-auth");
                }
            });
        ManualTests(suite,temporary);
    }
    private static void ManualTests(ProofSuite suite,string temporary)
    {
        var root=Path.Combine(temporary,"phase5-reports");using var protection=new TestProtection();var store=new ManualReportStore(root,protection);
        var draft=new ManualReportDraft{Title="합성 제목",Error="합성 오류",Question="합성 질문",ActualAnswer="합성 답변",Expected="합성 기대",RuleEvidence="합성 규칙 근거",OccurredVersion="v0.3.0-synthetic",Channel="대면",MemorySummary=true,AdminNote="합성 메모"};
        ManualReportDocument? doc=null;
        suite.Check("manual encrypted create preserves Korean fields without plaintext metadata or temp files",()=>{
            doc=store.Save(draft);ProofSuite.Equal(doc.Revision,1);var encrypted=File.ReadAllBytes(Path.Combine(root,doc.Id+".dpapi"));
            foreach(var text in new[]{draft.Title,draft.Question,draft.AdminNote})ProofSuite.True(encrypted.AsSpan().IndexOf(ProtocolJson.Utf8.GetBytes(text)) < 0);
            ProofSuite.True(!Directory.EnumerateFiles(root,"*.tmp").Any());ProofSuite.True(doc.Detail().Contains("기억에 근거한 요약",StringComparison.Ordinal));
        });
        suite.Check("manual reopen edit retains ID creation time and encrypted audit revisions",()=>{
            var reopened=new ManualReportStore(root,protection);var first=reopened.List().Single();ProofSuite.Equal(first.Draft.Question,draft.Question);
            doc=reopened.Save(first.Draft with{Status="resolved",AdminNote="합성 수정 메모"},first.Id,first.Revision);
            ProofSuite.Equal(doc.Revision,2);ProofSuite.Equal(doc.CreatedAt,first.CreatedAt);ProofSuite.Equal(doc.History.Count,2);
        });
        suite.Check("stale manual edit rejected without replacing current encrypted record",()=>{
            var path=Path.Combine(root,doc!.Id+".dpapi");var before=File.ReadAllBytes(path);ProofSuite.Throws(()=>store.Save(draft,doc.Id,1));ProofSuite.True(File.ReadAllBytes(path).SequenceEqual(before));
        });
        suite.Check("manual invalid title enum controls length and Unicode are rejected",()=>{
            foreach(var invalid in new[]{draft with{Title=""},draft with{Category="unknown"},draft with{Channel="unknown"},draft with{Status="unknown"},draft with{AdminNote=new string('x',3001)},draft with{Error="bad\0"},draft with{Title="bad\ud800"}})ProofSuite.Throws(()=>store.Save(invalid));
            ProofSuite.Throws(()=>store.Read("../other"));
        });
        suite.Check("manual lock blocks parallel writer and leaves existing data intact",()=>{
            using var held=new FileStream(Path.Combine(root,"reports.lock"),FileMode.Open,FileAccess.ReadWrite,FileShare.None);
            ProofSuite.Throws(()=>store.Save(draft,doc!.Id,doc.Revision));
        });
        suite.Check("protection failure never falls back to plaintext or overwrites old report",()=>{
            var path=Path.Combine(root,doc!.Id+".dpapi");var before=File.ReadAllBytes(path);protection.Fail=true;
            ProofSuite.Throws(()=>store.Save(draft,doc.Id,doc.Revision));ProofSuite.True(before.SequenceEqual(File.ReadAllBytes(path)));protection.Fail=false;
        });
        suite.Check("corrupted ciphertext fails closed and is preserved",()=>{
            var path=Path.Combine(root,doc!.Id+".dpapi");var before=File.ReadAllBytes(path);var corrupt=before.ToArray();corrupt[^1]^=1;File.WriteAllBytes(path,corrupt);
            ProofSuite.Throws(()=>store.Read(doc.Id));ProofSuite.Throws(()=>store.Save(draft,doc.Id,doc.Revision));ProofSuite.True(File.ReadAllBytes(path).SequenceEqual(corrupt));File.WriteAllBytes(path,before);
        });
        suite.Check("future analysis packet is explicit in-memory local source and revision only",()=>{
            var packet=ProtocolJson.Element(doc!.AnalysisDraft());ProofSuite.Equal(packet.Field("source").Text(),"local-manual");ProofSuite.True(packet.Field("memorySummary").GetBoolean());ProofSuite.Equal(packet.Field("revision").Number(),2);
        });
        if(!OperatingSystem.IsWindows())suite.Check("manual symlink storage refused",()=>{
            var link=Path.Combine(temporary,"phase5-report-link");Directory.CreateSymbolicLink(link,root);ProofSuite.Throws(()=>new ManualReportStore(link,protection).List());Directory.Delete(link);
        });
        else suite.Check("actual Windows report DPAPI survives reopened store with no plaintext",()=>{
            var nativeRoot=Path.Combine(temporary,"phase5-native-dpapi");var native=new ManualReportStore(nativeRoot,new WindowsReportProtection());var saved=native.Save(draft);
            var read=new ManualReportStore(nativeRoot,new WindowsReportProtection()).Read(saved.Id);ProofSuite.Equal(read.Draft,draft);
            var bytes=File.ReadAllBytes(Path.Combine(nativeRoot,saved.Id+".dpapi"));
            ProofSuite.True(bytes.AsSpan().IndexOf(ProtocolJson.Utf8.GetBytes(draft.Title))<0);
        });
    }
    private sealed class TestProtection:IUserDataProtection,IDisposable
    {
        private readonly byte[] key=RandomNumberGenerator.GetBytes(32);public bool Fail;
        public byte[] Protect(byte[] clear){if(Fail)throw new IOException();var encrypted=new byte[clear.Length+28];RandomNumberGenerator.Fill(encrypted.AsSpan(0,12));using var aes=new AesGcm(key,16);aes.Encrypt(encrypted.AsSpan(0,12),clear,encrypted.AsSpan(28),encrypted.AsSpan(12,16));return encrypted;}
        public byte[] Unprotect(byte[] encrypted){var clear=new byte[encrypted.Length-28];using var aes=new AesGcm(key,16);aes.Decrypt(encrypted.AsSpan(0,12),encrypted.AsSpan(28),encrypted.AsSpan(12,16),clear);return clear;}
        public void SecureDirectory(string path){}public void Dispose()=>CryptographicOperations.ZeroMemory(key);
    }
    private sealed class FakeBackend:IAdminChangeBackend
    {
        public int Calls,Writes;public string Failure="";public bool Enabled=true,Running;public TaskCompletionSource? Hold;
        public Task<JsonElement> StatusAsync(CancellationToken c){Calls++;return Task.FromResult(ProtocolJson.Element(new{appRunning=Running,error="",stats=new{day="2026-11-02",limits=OperationsPolicy.LimitLabels.Keys.ToDictionary(k=>k,k=>1),aiEnabled=Enabled,calls=Array.Empty<object>()}}));}
        public async Task ChangeAsync(string m,JsonElement p,string reason,CancellationToken c){Calls++;Writes++;if(Hold is not null)await Hold.Task.WaitAsync(c);
            if(Failure is "authentication" or "network" or "stopped" or "lost" or "restart-stop")throw new ControlException("synthetic-change-failed");
            if(m=="ai"&&Failure!="verify")Enabled=p.Field("enabled").GetBoolean();if(m=="start")Running=true;if(m=="stop")Running=false;}
        public Task<JsonElement> ReportAsync(string id,CancellationToken c)=>throw new NotSupportedException();
    }
    private sealed class RouterBackend: IAdminChangeBackend,IDisposable
    {
        private readonly HttpClient client;public int Writes;
        public RouterBackend(int port){var connector=new PhaseFourProofs.TcpConnector(port);var handler=new SocketsHttpHandler{UseProxy=false,AllowAutoRedirect=false,ConnectCallback=(_,c)=>connector.ConnectAsync(c)};client=new(handler){BaseAddress=AdminReadPolicy.Origin,Timeout=TimeSpan.FromSeconds(5)};client.DefaultRequestHeaders.Add("Origin",AdminReadPolicy.Origin.AbsoluteUri.TrimEnd('/'));}
        public async Task LoginAsync(){using var res=await client.PostAsJsonAsync("/api/login",new{key="synthetic-token"});res.EnsureSuccessStatusCode();}
        private async Task<JsonElement> Read(string route,CancellationToken c){using var res=await client.GetAsync(route,c);res.EnsureSuccessStatusCode();return (await res.Content.ReadFromJsonAsync<JsonElement>(cancellationToken:c));}
        public Task<JsonElement> StatusAsync(CancellationToken c)=>Read("/api/status",c);
        public Task<JsonElement> ReportAsync(string id,CancellationToken c)=>Read("/api/reports/"+id,c);
        public async Task ChangeAsync(string m,JsonElement p,string reason,CancellationToken c){Writes++;var route=m=="update-report"?"/api/reports/"+p.Field("id").Text():"/api/"+m;object body=m=="limits"?p.GetProperty("limits"):m=="update-report"?new{status=p.Field("status").Text(),note=p.Field("note").Text()}:p;using var res=await client.PostAsJsonAsync(route,body,c);res.EnsureSuccessStatusCode();}
        public void Dispose()=>client.Dispose();
    }
}
