using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text.Json;
using RiftAssist.ControlCenter.Core;

if(args.Length>0&&args[0]=="--owned-parent-fixture")return await PhaseEightProofs.OwnedParentFixture(args);
if (args.Length < 2) { Console.Error.WriteLine("Usage: tests <v0.2.0-source-root> <node-executable> [report.json]"); return 2; }
var suite = new ProofSuite();
var release = Path.GetFullPath(args[0]); var node = Path.GetFullPath(args[1]);
var manifest = args.Length > 3 ? Path.GetFullPath(args[3]) : Path.GetFullPath(Path.Combine(release, "../../control-center/backend-manifest.json"));
var temporary = Path.Combine(Path.GetTempPath(), "riftassist-cc-proof-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(temporary);
var catalog = new SandboxCatalog(Path.Combine(temporary, "owned"));
BackendLayout? backend = null; OwnedSandbox? sandbox = null; NodeReviewTransport? client = null; ReviewCoordinator? review = null;
string? bundleId = null; ReviewPackage? package = null; byte[]? baseline = null;
try
{
    if(args.Contains("--phase8-only")){backend=new BackendLayout(release,node,manifest);await PhaseEightProofs.RunAsync(suite,backend,temporary);}
    else{
    using var vectors = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "fixtures/protocol-vectors.json")));
    var key = vectors.RootElement.GetProperty("keyText").GetString()!;
    foreach (var vector in vectors.RootElement.GetProperty("vectors").EnumerateArray()) suite.Check("golden: " + vector.GetProperty("name").GetString(), () => {
        var payload = vector.GetProperty("payload");
        ProofSuite.Equal(ProtocolJson.Canonical(payload), vector.GetProperty("canonical").GetString());
        ProofSuite.Equal(Convert.ToHexStringLower(ProtocolJson.CanonicalBytes(payload)), vector.GetProperty("canonicalUtf8Hex").GetString());
        ProofSuite.Equal(ProtocolJson.Sign(payload, key), vector.GetProperty("hmacHex").GetString());
    });
    suite.Check("duplicate JSON keys rejected", () => { using var d = JsonDocument.Parse("{\"a\":1,\"a\":2}"); ProofSuite.Throws(() => ProtocolJson.Canonical(d.RootElement)); });
    suite.Check("fractional and unsafe request numbers rejected", () => {
        foreach (var text in new[] { "0.25", "9007199254740992", "1e100" }) { using var d = JsonDocument.Parse(text); ProofSuite.Throws(() => ProtocolJson.Canonical(d.RootElement)); }
    });
    suite.Check("Unicode is not normalized and invalid surrogates fail", () => {
        ProofSuite.True(ProtocolJson.Canonical(ProtocolJson.Element("é")) != ProtocolJson.Canonical(ProtocolJson.Element("e\u0301")));
        ProofSuite.Throws(() => ReviewCoordinator.ValidateReason("broken \ud800"));
    });
    suite.Check("session credentials are random, ephemeral, and final scopes opt-in", () => {
        using var first = new SessionSigner(false); using var other = new SessionSigner(true);
        using var b = JsonDocument.Parse(first.Bootstrap());
        ProofSuite.Equal(b.RootElement.GetProperty("credentials")[0].GetProperty("secret").GetString()!.Length, 64);
        ProofSuite.True(first.SessionId != other.SessionId); ProofSuite.True(!first.Scopes.Contains("cards:activate")); ProofSuite.True(other.Scopes.Contains("cards:rollback"));
        var request = first.Request("list", new { reason = "사유 🙂" }, Guid.NewGuid().ToString("D"));
        ProofSuite.True(!request.Contains(b.RootElement.GetProperty("credentials")[0].GetProperty("secret").GetString()!, StringComparison.Ordinal));
    });
    suite.Check("typed final phrases, acknowledgement and reason all required", () => {
        ProofSuite.Throws(() => new FinalApproval("", "사유", true).Validate("activate"));
        ProofSuite.Throws(() => new FinalApproval("개발 자료 활성화", "사유", false).Validate("activate"));
        ProofSuite.Throws(() => new FinalApproval("개발 자료 활성화", "", true).Validate("activate"));
        new FinalApproval("개발 자료 활성화", "한글 최종 확인", true).Validate("activate");
        new FinalApproval("개발 자료 되돌리기", "한글 복귀", true).Validate("rollback");
    });
    suite.Check("live integrations remain unavailable while mock operations are explicit", () => {
        ProofSuite.True(FeatureCatalog.Modules.Where(m => m.Id is "github" or "codex").All(m => m.State == "미연결"));
        ProofSuite.True(FeatureCatalog.Modules.Single(m => m.Id == "azure").Description.Contains("운영 제어 차단", StringComparison.Ordinal));
    });
    suite.Check("backend source integrity verified", () => {
        backend = args.Length > 3 ? BackendLayout.Installed(Path.GetFullPath(Path.Combine(release, "../.."))) : new BackendLayout(release, node, manifest);
        ProofSuite.Equal(backend.Node, node);
    });
    suite.Check("empty or traversing backend manifests rejected", () => {
        var file = Path.Combine(temporary, "bad-manifest.json");
        File.WriteAllText(file, "{\"schemaVersion\":1,\"files\":{}}");
        ProofSuite.Throws(() => new BackendLayout(release, node, file));
    });
    suite.Check("arbitrary data folders cannot be opened", () => { ProofSuite.Throws(() => catalog.Open(release)); });
    await suite.CheckAsync("owned mock sandbox prepared with existing Node engine", async () => {
        sandbox = await catalog.CreateAsync(backend!); var seeded = await catalog.SeedAsync(backend!, sandbox);
        ProofSuite.True(seeded.Field("candidateId").Text().StartsWith("sync-", StringComparison.Ordinal));
        ProofSuite.True(!Directory.Exists(Path.Combine(sandbox.Root, "private"))); baseline = File.ReadAllBytes(Path.Combine(sandbox.Root, "knowledge-releases/synthetic-development-1/cards.json"));
        client = await NodeReviewTransport.ConnectAsync(backend!, sandbox, false); review = new ReviewCoordinator(client);
        var registered = await review.RegisterAsync(seeded.Field("candidateId").Text(), seeded.Field("knowledgeReleaseId").Text()); bundleId = registered.Field("bundleId").Text();
    });
    suite.Check("owned sandbox listing and reparse boundaries", () => {
        ProofSuite.Equal(catalog.List().Count, 1); ProofSuite.Equal(catalog.Open(sandbox!.Root).Id, sandbox.Id);
        var link = Path.Combine(catalog.Home, Guid.NewGuid().ToString("D"));
        // Windows non-admin symlink creation can be unavailable; junctions/links are also checked by native path attributes.
        if (!OperatingSystem.IsWindows()) { Directory.CreateSymbolicLink(link, release); ProofSuite.Throws(() => catalog.Open(link)); Directory.Delete(link); }
    });
    await suite.CheckAsync("Node verifies C# HMAC and returns bilingual structured comparisons", async () => {
        var bundles = await review!.ListAsync(); ProofSuite.True(bundles.Count == 1);
        var snapshot = await review.LoadAsync(bundleId!); ProofSuite.True(snapshot.Items.Count >= 5);
        ProofSuite.True(snapshot.Items.Any(i => i.Kinds.Contains("에라타", StringComparison.Ordinal)));
        ProofSuite.True(snapshot.Items.Any(i => i.Kinds.Contains("신규", StringComparison.Ordinal)));
        ProofSuite.True(snapshot.Items.Any(i => i.AfterKorean.Contains("카드", StringComparison.Ordinal)));
        ProofSuite.True(snapshot.Items.Any(i => i.AfterMetadata.Contains("preview-unreleased", StringComparison.Ordinal)));
    });
    await suite.CheckAsync("local validation blocks incomplete warning acknowledgement before writes", async () => {
        var item = review!.Current!.Items.First(i => i.Type == "data");
        await ProofSuite.ThrowsAsync(() => review.DecideAsync([item], "approve", "확인", new HashSet<string>()));
        ProofSuite.True(!review.NeedsRefresh);
        await ProofSuite.ThrowsAsync(() => review.DecideAsync([item, item], "hold", "중복 선택", new HashSet<string>()));
        await ProofSuite.ThrowsAsync(() => review.DecideAsync([item], "hold", "", new HashSet<string>()));
    });
    await suite.CheckAsync("bulk hold/reject decisions and Korean reasons persist", async () => {
        var items = review!.Current!.Items;
        await review.DecideAsync(items, "hold", UserInteraction.AuditReason("hold", bundleId!), new HashSet<string>()); ProofSuite.True(review.NeedsRefresh);
        await review.LoadAsync(bundleId!); ProofSuite.True(review.Current!.Items.All(i => i.Decision == "hold"));
        var reject = review.Current.Items.Where(i => i.CardId == "mock:practice-new").ToArray();
        await review.DecideAsync(reject, "reject", "신규 합성 카드 제외", new HashSet<string>()); await review.LoadAsync(bundleId!);
        ProofSuite.True(review.Current!.Items.Where(i => i.CardId == "mock:practice-new").All(i => i.Decision == "reject"));
    });
    await suite.CheckAsync("individual approval and explicit partial-stage plan", async () => {
        var item = review!.Current!.Items.First(i => i.CardId == "mock:practice-unit" && i.Type == "data");
        await review.DecideAsync([item], "approve", "영문과 에라타를 대조했습니다", item.Warnings.Select(w => w.Code).ToHashSet(StringComparer.Ordinal));
        await review.LoadAsync(bundleId!); var plan = await review.PlanStageAsync(); ProofSuite.Equal(plan.ApprovedCount, 1); ProofSuite.True(plan.ExcludedIds.Count > 0);
        await ProofSuite.ThrowsAsync(() => review.StageAsync(plan, "구성", false));
        var result = await review.StageAsync(plan, "영어 데이터만 구성", true); package = ReviewPackage.From(result);
        await review.LoadAsync(bundleId!);
        using var pointer = JsonDocument.Parse(File.ReadAllBytes(Path.Combine(sandbox!.Root, "knowledge-releases/active.json")));
        ProofSuite.Equal(pointer.RootElement.GetProperty("releaseId").GetString(), "synthetic-development-1");
    });
    await suite.CheckAsync("default session cannot activate and backend scopes independently enforce it", async () => {
        await ProofSuite.ThrowsAsync(() => review!.ActivateAsync(package!, new FinalApproval("개발 자료 활성화", "권한 검사", true)));
        await ProofSuite.ThrowsAsync(() => client!.SendAsync("activate", new { }));
    });
    await suite.CheckAsync("fresh privileged local session activates exact staged package", async () => {
        await client!.DisposeAsync(); client = await NodeReviewTransport.ConnectAsync(backend!, sandbox!, true); review = new ReviewCoordinator(client);
        await review.LoadAsync(bundleId!);
        await ProofSuite.ThrowsAsync(() => review.ActivateAsync(package!, new FinalApproval("", "확인", true)));
        await review.ActivateAsync(package!, new FinalApproval("개발 자료 활성화", "로컬 합성자료 최종 확인", true)); await review.LoadAsync(bundleId!);
        ProofSuite.Equal(review.Current!.Status, "active");
    });
    await suite.CheckAsync("rollback is separate, version-bound and preserves original files", async () => {
        await review!.RollbackAsync(package!, new FinalApproval("개발 자료 되돌리기", "이전 합성 자료 복귀", true)); await review.LoadAsync(bundleId!);
        ProofSuite.Equal(review.Current!.Status, "rolled-back");
        ProofSuite.True(File.ReadAllBytes(Path.Combine(sandbox!.Root, "knowledge-releases/synthetic-development-1/cards.json")).SequenceEqual(baseline!));
    });
    await suite.CheckAsync("audit records show Korean decisions without credentials or raw signed requests", async () => {
        var audit = await review!.AuditAsync(0); ProofSuite.True(audit.Rows.Count > 0);
        ProofSuite.True(audit.Rows.Any(row => row.Reason.Contains("카드/번역 보류", StringComparison.Ordinal) && row.Reason.Contains("자동 기록", StringComparison.Ordinal)));
        var files = Directory.GetFiles(Path.Combine(sandbox!.Root, "card-reviews/events"));
        var bytes = string.Join("", files.Select(File.ReadAllText));
        ProofSuite.True(bytes.Contains("영문과 에라타", StringComparison.Ordinal));
        ProofSuite.True(!bytes.Contains("\"secret\"", StringComparison.Ordinal) && !bytes.Contains("\"signature\"", StringComparison.Ordinal));
    });
    await suite.CheckAsync("reconnect restores review history without re-seeding or reactivating", async () => {
        await client!.DisposeAsync(); client = await NodeReviewTransport.ConnectAsync(backend!, catalog.Open(sandbox!.Root), false); review = new ReviewCoordinator(client);
        await review.LoadAsync(bundleId!); ProofSuite.Equal(review.Current!.Status, "rolled-back");
    });
    foreach (var mode in new[] { "wrong-id", "oversize", "hang", "environment" }) await suite.CheckAsync("pipe boundary: " + mode, async () => {
        var fake = FakeBackend.Create(temporary, node, mode);
        // A nonsecret canary proves inherited variables are actually stripped even on a clean test host.
        Environment.SetEnvironmentVariable("RIFTASSIST_CC_ENV_CANARY", "synthetic-only");
        await using var transport = await NodeReviewTransport.ConnectAsync(fake, sandbox!, false);
        if (mode == "environment")
        {
            var response = await transport.SendAsync("list", new { });
            ProofSuite.True(response.Field("keys").Rows().All(k => !new[] { "RIFTASSIST_CC_ENV_CANARY", "OPENAI_API_KEY", "RIOT_API_KEY", "NODE_OPTIONS", "SSH_AUTH_SOCK", "ADMIN_KEY" }.Contains(k.Text(), StringComparer.Ordinal)));
        }
        else
        {
            using var cancellation = new CancellationTokenSource(mode == "hang" ? TimeSpan.FromMilliseconds(100) : TimeSpan.FromSeconds(5));
            try { await transport.SendAsync("list", new { }, cancellation.Token); throw new InvalidOperationException("Expected a protocol failure."); }
            catch (ControlException e) { ProofSuite.True(e.Uncertain && transport.IsFaulted); ProofSuite.Equal(e.Code, "client-result-uncertain"); }
        }
    });
    await PhaseTwoProofs.RunAsync(suite, backend!, temporary);
    PhaseThreeProofs.Run(suite);
    await SshRegressionProofs.RunAsync(suite, node, temporary);
    await PhaseFourProofs.RunAsync(suite, node, temporary);
    await SavedLoginProofs.RunAsync(suite, temporary);
    await AutomaticAuthProofs.RunAsync(suite, node, temporary);
    await PhaseFiveProofs.RunAsync(suite, backend!, node, temporary);
    await PhaseSixProofs.RunAsync(suite, backend!, temporary);
    await PhaseSevenProofs.RunAsync(suite, backend!, temporary);
    await PhaseEightProofs.RunAsync(suite, backend!, temporary);
    await StagingProofs.RunAsync(suite, temporary);
    }
}
finally
{
    Environment.SetEnvironmentVariable("RIFTASSIST_CC_ENV_CANARY", null);
    if (client is not null) await client.DisposeAsync();
    // Git for Windows marks loose objects read-only. Only this test-owned root is cleaned.
    foreach(var file in Directory.EnumerateFiles(temporary,"*",new EnumerationOptions{RecurseSubdirectories=true,AttributesToSkip=FileAttributes.ReparsePoint}))
        if((File.GetAttributes(file)&FileAttributes.ReadOnly)!=0){SafePath.NoLinks(file);File.SetAttributes(file,File.GetAttributes(file)&~FileAttributes.ReadOnly);}
    Directory.Delete(temporary, recursive: true);
}
var report = new { suite.Tests, passed = suite.Tests.Count(t => t.Passed), failed = suite.Tests.Count(t => !t.Passed),
    os = RuntimeInformation.OSDescription, framework = RuntimeInformation.FrameworkDescription, nativeWpfExecuted = false, realRiotCalls = 0, paidApiCalls = 0 };
var json = JsonSerializer.Serialize(report, new JsonSerializerOptions { WriteIndented = true });
if (args.Length > 2) { Directory.CreateDirectory(Path.GetDirectoryName(Path.GetFullPath(args[2]))!); File.WriteAllText(args[2], json + Environment.NewLine); }
Console.WriteLine($"C# proof suite: {report.passed}/{suite.Tests.Count} passed; native WPF execution: false.");
return report.failed == 0 ? 0 : 1;

sealed class ProofSuite
{
    public List<Outcome> Tests { get; } = [];
    public void Check(string name, Action action) { try { action(); Tests.Add(new(name, true, null)); Console.WriteLine("PASS " + name); } catch (Exception e) { Fail(name, e); } }
    public async Task CheckAsync(string name, Func<Task> action) { try { await action(); Tests.Add(new(name, true, null)); Console.WriteLine("PASS " + name); } catch (Exception e) { Fail(name, e); } }
    private void Fail(string name, Exception e) { var type = e is ControlException c ? c.Code : e.GetType().Name; Tests.Add(new(name, false, type)); Console.WriteLine("FAIL " + name + " (" + type + ")"); }
    public static void True(bool value) { if (!value) throw new InvalidOperationException("Assertion failed."); }
    public static void Equal<T>(T first, T second) { if (!EqualityComparer<T>.Default.Equals(first, second)) throw new InvalidOperationException("Values differ."); }
    public static void Throws(Action action) { try { action(); } catch (ControlException) { return; } throw new InvalidOperationException("Expected protocol rejection."); }
    public static async Task ThrowsAsync(Func<Task> action) { try { await action(); } catch (ControlException) { return; } throw new InvalidOperationException("Expected protocol rejection."); }
}
sealed record Outcome(string Name, bool Passed, string? Error);
static class FakeBackend
{
    public static BackendLayout Create(string temporary, string node, string mode)
    {
        var root = Path.Combine(temporary, "fake-" + mode); Directory.CreateDirectory(Path.Combine(root, "scripts")); Directory.CreateDirectory(Path.Combine(root, "src")); Directory.CreateDirectory(Path.Combine(root, "dev-fixtures"));
        const string worker = "const readline=require('node:readline');let boot=false;readline.createInterface({input:process.stdin}).on('line',line=>{if(!boot){boot=true;return;}const q=JSON.parse(line);const mode=MODE;if(mode==='hang')return;if(mode==='oversize'){process.stdout.write('x'.repeat(2001000)+'\\n');return;}console.log(JSON.stringify({protocol:'riftassist-control-1',requestId:mode==='wrong-id'?'wrong':q.requestId,ok:true,result:{keys:Object.keys(process.env)}}));});";
        File.WriteAllText(Path.Combine(root, "scripts/card-review-control.cjs"), worker.Replace("MODE", JsonSerializer.Serialize(mode), StringComparison.Ordinal));
        foreach (var name in new[] { "scripts/prepare-development.cjs", "scripts/prepare-control-center-demo.cjs", "src/card-review-auth.js", "dev-fixtures/mock-cards.json" }) File.WriteAllText(Path.Combine(root, name), "{}");
        var files = Directory.GetFiles(root, "*", SearchOption.AllDirectories).ToDictionary(p => Path.GetRelativePath(root, p).Replace('\\', '/'), p => Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(p))));
        var manifest = Path.Combine(temporary, "fake-manifest-" + mode + ".json"); File.WriteAllText(manifest, JsonSerializer.Serialize(new { schemaVersion = 1, files }));
        return new BackendLayout(root, node, manifest);
    }
}
