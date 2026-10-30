using System.Text.Json;
using RiftAssist.ControlCenter.Core;

internal static class PhaseTwoProofs
{
    private const string GoodStatus = "protocol=riftassist-status-1\nuptime_seconds=3600.5\nmemory_total_kib=4194304\nmemory_available_kib=3145728\ndisk_total_kib=67108864\ndisk_available_kib=54525952\ncpu_percent=12.50\nservice=active\napp_http=200\nhttps_http=200\n";
    public static async Task RunAsync(ProofSuite suite, BackendLayout backend, string temporary)
    {
        var profile = new SshProfile("example.invalid", "synthetic_user", 22, Path.Combine(temporary, "identity-placeholder"), Path.Combine(temporary, "known hosts-placeholder"), "https://example.invalid");
        suite.Check("SSH strict host verification, noninteractive auth and no forwarding", () => {
            var command = SshCommandPolicy.Build(profile); SshCommandPolicy.Validate(command);
            foreach (var value in new[] { "StrictHostKeyChecking=yes", "UpdateHostKeys=no", "BatchMode=yes", "ClearAllForwardings=yes", "PermitLocalCommand=no", "ForwardAgent=no", "ForwardX11=no" }) ProofSuite.True(command.Arguments.Contains(value));
            ProofSuite.True(command.Arguments.Take(2).SequenceEqual(new[] { "-F", "NUL" }));
            ProofSuite.True(!command.Arguments.Any(a => a is "-L" or "-R" or "-D"));
            ProofSuite.True(command.Arguments.Contains("UserKnownHostsFile=\"" + profile.KnownHostsFile.Replace('\\', '/') + "\""));
        });
        suite.Check("SSH uses a fixed read-only script and tampered commands are rejected", () => {
            var command = SshCommandPolicy.Build(profile);
            ProofSuite.True(command.StandardInput.Contains("systemctl show riftassist.service", StringComparison.Ordinal));
            ProofSuite.True(!command.StandardInput.Contains("sudo", StringComparison.Ordinal) && !command.StandardInput.Contains("--insecure", StringComparison.Ordinal));
            ProofSuite.True(!command.StandardInput.Contains("3100", StringComparison.Ordinal));
            ProofSuite.Throws(() => SshCommandPolicy.Validate(command with { StandardInput = command.StandardInput + "\nsystemctl restart riftassist.service\n" }));
            ProofSuite.Throws(() => SshCommandPolicy.Validate(command with { Arguments = [..command.Arguments, "-L", "3100:127.0.0.1:3100"] }));
        });
        suite.Check("SSH injection, unexpected HTTPS targets and invalid profile fields fail", () => {
            foreach (var invalid in new[] { profile with { Host = "-oProxyCommand=x" }, profile with { Host = "host;id" }, profile with { User = "u@other" },
                profile with { User = "root\n" }, profile with { Port = 0 }, profile with { Port = 65536 }, profile with { KnownHostsFile = "" },
                profile with { IdentityFile = "relative-file" }, profile with { IdentityFile = "C:\\fake\nvalue" }, profile with { HttpsOrigin = "http://example.invalid" },
                profile with { HttpsOrigin = "https://example.invalid/?x=1" }, profile with { HttpsOrigin = "https://" + "u:p" + "@example.invalid" }, profile with { Host = null! },
                profile with { HttpsOrigin = "https://example.invalid:3100" }, profile with { HttpsOrigin = "https://example.invalid/api/other" } })
                ProofSuite.Throws(() => SshCommandPolicy.Build(invalid));
        });
        suite.Check("SSH agent mode does not require a private key file or read key bytes", () => {
            var command = SshCommandPolicy.Build(profile with { IdentityFile = "" });
            ProofSuite.True(!command.Arguments.Contains("-i")); ProofSuite.True(command.Arguments.Last() == "sh -s");
        });
        suite.Check("remote status accepts bounded numeric metrics and HTTP codes", () => {
            var sample = RemoteSnapshot.Parse(GoodStatus); ProofSuite.Equal(sample.CpuPercent, 12.5); ProofSuite.Equal(sample.Service, "active"); ProofSuite.Equal(sample.HttpsHttp, 200);
            ProofSuite.Equal(RemoteSnapshot.Parse(GoodStatus.Replace("https_http=200", "https_http=000", StringComparison.Ordinal)).HttpsHttp, 0);
        });
        suite.Check("malformed, duplicate, unknown, unbounded or inconsistent metrics fail", () => {
            foreach (var value in new[] { "not-json", GoodStatus + "service=active\n", GoodStatus + "unexpected=value\n", GoodStatus.Replace("12.50", "NaN", StringComparison.Ordinal),
                GoodStatus.Replace("12.50", "101", StringComparison.Ordinal), GoodStatus.Replace("uptime_seconds=3600.5", "uptime_seconds=-1", StringComparison.Ordinal),
                GoodStatus.Replace("memory_available_kib=3145728", "memory_available_kib=9999999", StringComparison.Ordinal),
                GoodStatus.Replace("https_http=200", "https_http=700", StringComparison.Ordinal), GoodStatus.Replace("service=active", "service=secret-output", StringComparison.Ordinal), new string('x', 8193) })
                ProofSuite.Throws(() => RemoteSnapshot.Parse(value));
        });
        suite.Check("SSH settings store only six metadata fields and never private key contents", () => {
            File.WriteAllText(profile.IdentityFile, "synthetic-key-content-do-not-copy");
            var store = new SshProfileStore(Path.Combine(temporary, "settings")); store.Save(profile); ProofSuite.Equal(store.Load(), profile);
            var saved = File.ReadAllText(Path.Combine(store.DirectoryPath, "ssh.local.json")); using var json = JsonDocument.Parse(saved);
            ProofSuite.Equal(json.RootElement.EnumerateObject().Count(), 6); ProofSuite.True(!saved.Contains("synthetic-key-content-do-not-copy", StringComparison.Ordinal));
            ProofSuite.True(!saved.Contains("approval", StringComparison.OrdinalIgnoreCase));
        });
        suite.Check("unexpected credential fields and symlink settings are refused", () => {
            var root = Path.Combine(temporary, "untrusted-settings"); var store = new SshProfileStore(root); store.Save(profile);
            var fields = ProtocolJson.Element(profile).EnumerateObject().ToDictionary(p => p.Name, p => (object?)p.Value.Clone()); fields["privateKeyContents"] = "synthetic-only";
            File.WriteAllText(Path.Combine(root, "ssh.local.json"), JsonSerializer.Serialize(fields)); ProofSuite.Throws(() => store.Load());
            if (!OperatingSystem.IsWindows()) {
                var link = Path.Combine(temporary, "linked-settings"); Directory.CreateSymbolicLink(link, root);
                ProofSuite.Throws(() => new SshProfileStore(link).Save(profile)); Directory.Delete(link);
            }
        });
        await suite.CheckAsync("no SSH runner is invoked without separate connection approval", async () => {
            var runner = new FakeSsh(new(0, GoodStatus, "")); var monitor = new RemoteMonitor(runner);
            await ProofSuite.ThrowsAsync(() => monitor.ReadAsync(profile, false)); ProofSuite.Equal(runner.Calls, 0);
        });
        await suite.CheckAsync("mock SSH success produces one timestamped snapshot without paid APIs", async () => {
            var runner = new FakeSsh(new(0, GoodStatus, "")); var monitor = new RemoteMonitor(runner);
            await monitor.ReadAsync(profile, true); ProofSuite.Equal(runner.Calls, 1); ProofSuite.True(monitor.LastGood is not null && !monitor.Stale);
        });
        foreach (var (name, message, code) in new[] { ("authentication", "Permission denied (publickey).", "client-ssh-authentication"),
            ("changed host key", "REMOTE HOST IDENTIFICATION HAS CHANGED", "client-ssh-host-key-changed"),
            ("unverified host key", "Host key verification failed", "client-ssh-host-key-unverified"),
            ("network timeout", "Connection timed out", "client-ssh-timeout"), ("disconnect", "Connection reset", "client-ssh-disconnected") })
            await suite.CheckAsync("mock SSH " + name + " is sanitized, bounded and not retried", async () => {
                var runner = new FakeSsh(new(255, "", message + " synthetic-sensitive-output"));
                try { await new RemoteMonitor(runner).ReadAsync(profile, true); throw new InvalidOperationException(); }
                catch (ControlException e) { ProofSuite.Equal(e.Code, code); ProofSuite.True(!e.ToString().Contains("synthetic-sensitive-output", StringComparison.Ordinal)); }
                ProofSuite.Equal(runner.Calls, 1);
            });
        await suite.CheckAsync("failed SSH preserves last good metrics as stale and explicit retry can recover", async () => {
            var runner = new FakeSsh(new(0, GoodStatus, "")); var monitor = new RemoteMonitor(runner); await monitor.ReadAsync(profile, true);
            runner.Result = new(255, "", "Connection reset"); await ProofSuite.ThrowsAsync(() => monitor.ReadAsync(profile, true));
            ProofSuite.True(monitor.Stale && monitor.LastGood?.Service == "active"); ProofSuite.Equal(runner.Calls, 2);
            runner.Result = new(0, GoodStatus, ""); await monitor.ReadAsync(profile, true); ProofSuite.True(!monitor.Stale); ProofSuite.Equal(runner.Calls, 3);
        });
        await suite.CheckAsync("SSH profile switch never reuses another server's successful snapshot", async () => {
            var runner = new FakeSsh(new(0, GoodStatus, "")); var monitor = new RemoteMonitor(runner); await monitor.ReadAsync(profile, true);
            runner.Result = new(255, "", "Connection reset"); await ProofSuite.ThrowsAsync(() => monitor.ReadAsync(profile with { Host = "other.invalid" }, true)); ProofSuite.True(monitor.LastGood is null);
        });
        await suite.CheckAsync("SSH cancellation and malformed stdout never publish fresh metrics", async () => {
            var runner = new FakeSsh(new(0, GoodStatus, "")) { Cancel = true }; var monitor = new RemoteMonitor(runner);
            await ProofSuite.ThrowsAsync(() => monitor.ReadAsync(profile, true)); ProofSuite.Equal(monitor.State, "client-ssh-timeout");
            using var cancellation = new CancellationTokenSource(); cancellation.Cancel();
            await ProofSuite.ThrowsAsync(() => monitor.ReadAsync(profile, true, cancellation.Token)); ProofSuite.Equal(monitor.State, "client-ssh-cancelled");
            runner.Cancel = false; runner.Result = new(0, "unexpected output", ""); await ProofSuite.ThrowsAsync(() => monitor.ReadAsync(profile, true)); ProofSuite.True(monitor.LastGood is null);
        });
        suite.Check("Azure operational controls and actual admin data are denied before transport", () => {
            foreach (var method in OperationsPolicy.WriteMethods) ProofSuite.Throws(() => OperationsPolicy.RequireDevelopment(OperationsTarget.AzureReadOnly));
            ProofSuite.Throws(SshCommandPolicy.DenyOperationalMutation);
        });
        suite.Check("all eight existing AI limits enforce ranges and reject missing/extra fields", () => {
            var limits = OperationsPolicy.LimitLabels.Keys.ToDictionary(k => k, k => k == "concurrent" ? 3 : 100); OperationsPolicy.ValidateLimits(limits);
            limits["concurrent"] = 4; ProofSuite.Throws(() => OperationsPolicy.ValidateLimits(limits)); limits["concurrent"] = 3;
            limits.Remove("reports"); ProofSuite.Throws(() => OperationsPolicy.ValidateLimits(limits));
        });
        await suite.CheckAsync("uncertain development writes require status refresh and cannot become production requests", async () => {
            var fake = new FakeOperations(); await using var session = new DevelopmentOperations(fake);
            await ProofSuite.ThrowsAsync(() => session.ChangeAsync("start", new { }, "확인", false)); ProofSuite.Equal(fake.Calls, 0);
            fake.FailWrite = true; await ProofSuite.ThrowsAsync(() => session.ChangeAsync("start", new { }, "합성 시작", true)); ProofSuite.True(session.NeedsRefresh);
            await ProofSuite.ThrowsAsync(() => session.ChangeAsync("start", new { }, "다시 시작", true)); ProofSuite.Equal(fake.Calls, 1);
            await session.ReadAsync("status"); ProofSuite.True(!session.NeedsRefresh);
            await using var denied = new DevelopmentOperations(fake, OperationsTarget.AzureReadOnly);
            await ProofSuite.ThrowsAsync(() => denied.ReadAsync("status")); await ProofSuite.ThrowsAsync(() => denied.ChangeAsync("stop", new { }, "차단", true)); ProofSuite.Equal(fake.Calls, 2);
        });

        var catalog = new SandboxCatalog(Path.Combine(temporary, "operations-owned")); OwnedSandbox? sandbox = null; DevelopmentOperations? operations = null;
        OperationsReport? report = null;
        try {
            await suite.CheckAsync("owned Node development manager authenticates through existing login/cookie API", async () => {
                sandbox = await catalog.CreateAsync(backend); var transport = await NodeReviewTransport.ConnectOperationsAsync(backend, sandbox); operations = new(transport);
                var status = await operations.ReadAsync("status"); ProofSuite.Equal(status.Field("controlCenterMode").Text(), "synthetic-development");
                ProofSuite.True(status.Field("appRunning").ValueKind == JsonValueKind.False);
                var local = new Uri(status.Field("localUrl").Text()); ProofSuite.Equal(local.Host, "127.0.0.1"); ProofSuite.True(local.Port is not (3100 or 3001 or 3200 or 3201));
                await using var second = await NodeReviewTransport.ConnectOperationsAsync(backend, sandbox);
                await ProofSuite.ThrowsAsync(() => second.SendAsync("status", new { }));
                await operations.ReadAsync("status"); // A refused second session must leave the first manager usable.
            });
            await suite.CheckAsync("synthetic report detail includes original question and response without real user data", async () => {
                var rows = (await operations!.ReadAsync("reports")).Field("reports").Rows().ToArray(); ProofSuite.Equal(rows.Length, 1); report = OperationsReport.Read(rows[0]);
                var detail = await operations.ReadAsync("report", new { id = report.Id });
                ProofSuite.True(detail.Field("snapshot").Field("question").Field("text").Text().Contains("합성 질문", StringComparison.Ordinal));
                ProofSuite.True(detail.Field("snapshot").Field("response").Field("recommendation").Text().Contains("모의", StringComparison.Ordinal));
                await ProofSuite.ThrowsAsync(() => operations.ReadAsync("questions"));
            });
            await suite.CheckAsync("development AI toggle and usage are actual local API state, not paid calls", async () => {
                var status = await operations!.ReadAsync("status"); ProofSuite.True(status.Field("stats").Field("calls").Rows().Any(c => c.Field("count").Number() == 1));
                await operations.ChangeAsync("ai", new { enabled = false }, UserInteraction.AuditReason("ai", sandbox!.Id), true);
                status = await operations.ReadAsync("status"); ProofSuite.True(status.Field("stats").Field("aiEnabled").ValueKind == JsonValueKind.False);
            });
            await suite.CheckAsync("development limits use the unchanged admin API validation", async () => {
                var limits = OperationsPolicy.LimitLabels.Keys.ToDictionary(k => k, k => k == "concurrent" ? 2 : 80);
                await operations!.ChangeAsync("limits", new { limits }, "합성 한도 변경", true); var status = await operations.ReadAsync("status"); ProofSuite.Equal(status.Field("stats").Field("limits").Field("generations").Number(), 80);
                limits["concurrent"] = 4; await ProofSuite.ThrowsAsync(() => operations.ChangeAsync("limits", new { limits }, "잘못된 한도", true)); await operations.ReadAsync("status");
            });
            await suite.CheckAsync("development hosting cannot open a tunnel or accept public configuration", async () => {
                await ProofSuite.ThrowsAsync(() => operations!.ChangeAsync("hosting", new { provider = "external" }, "공개 연결 차단", true));
                await operations!.ReadAsync("status"); await operations.ChangeAsync("hosting", new { provider = "none" }, "loopback 유지", true); await operations.ReadAsync("status");
            });
            await suite.CheckAsync("development app start and restart affect only owned ephemeral workers", async () => {
                await operations!.ChangeAsync("start", new { }, "합성 앱 시작", true); var status = await operations.ReadAsync("status"); ProofSuite.True(status.Field("appRunning").ValueKind == JsonValueKind.True);
                await operations.ChangeAsync("restart", new { }, "합성 앱 재시작", true); status = await operations.ReadAsync("status"); ProofSuite.True(status.Field("appRunning").ValueKind == JsonValueKind.True);
            });
            await suite.CheckAsync("development app update and rollback use ready synthetic releases", async () => {
                var rows = (await operations!.ReadAsync("app-releases")).Field("releases").Rows().ToArray(); ProofSuite.True(rows.Any(r => r.Field("releaseId").Text() == "v0.2.0-cc-demo"));
                await operations.ChangeAsync("app-release", new { releaseId = "v0.2.0-cc-demo" }, "합성 버전 적용", true);
                var status = await operations.ReadAsync("status"); ProofSuite.Equal(status.Field("appHost").Field("releaseId").Text(), "v0.2.0-cc-demo");
                await operations.ChangeAsync("app-release", new { releaseId = "v0.2.0" }, "이전 합성 버전 복귀", true); status = await operations.ReadAsync("status"); ProofSuite.Equal(status.Field("appHost").Field("releaseId").Text(), "v0.2.0");
            });
            await suite.CheckAsync("development report status and Korean notes persist through existing API", async () => {
                await operations!.ChangeAsync("update-report", new { id = report!.Id, status = "triaged", note = "합성 제보를 분류했습니다 🙂" }, UserInteraction.AuditReason("update-report", $"{sandbox!.Id}/{report.Id}/triaged"), true); await operations.ReadAsync("status");
                var detail = await operations.ReadAsync("report", new { id = report.Id }); ProofSuite.Equal(detail.Field("status").Text(), "triaged");
                ProofSuite.True(detail.Field("history").Rows().Any(h => h.Field("note").Text().Contains("합성 제보를 분류", StringComparison.Ordinal)));
            });
            await suite.CheckAsync("development backup stays inside owned root; no DB or key bytes are printed", async () => {
                var result = await operations!.ChangeAsync("backup", new { }, "합성 백업 확인", true); await operations.ReadAsync("status");
                var folder = result.Field("folder").Text(); ProofSuite.True(SafePath.IsInside(sandbox!.Root, folder)); ProofSuite.True(File.Exists(Path.Combine(folder, "operations.sqlite")) && File.Exists(Path.Combine(folder, "storage.key")));
            });
            await suite.CheckAsync("legacy network rediscovery remains blocked and never activates knowledge", async () => {
                var before = File.ReadAllBytes(Path.Combine(sandbox!.Root, "knowledge-releases/active.json"));
                await ProofSuite.ThrowsAsync(() => operations!.ChangeAsync("knowledge-discover", new { }, "기존 재수집 차단 확인", true)); await operations!.ReadAsync("status");
                ProofSuite.True(!File.Exists(Path.Combine(sandbox.Root, "source-updates/sync-request.json")));
                ProofSuite.True(File.ReadAllBytes(Path.Combine(sandbox.Root, "knowledge-releases/active.json")).SequenceEqual(before));
                await ProofSuite.ThrowsAsync(() => operations.ChangeAsync("knowledge-activate", new { releaseId = "missing-candidate", expectedId = "synthetic-development-1", reviewed = true }, "무효 자료 전환 차단", true)); await operations.ReadAsync("status");
            });
            await suite.CheckAsync("development operation journal stores reasons and outcomes, never keys/cookies/signatures", async () => {
                var rows = (await operations!.ReadAsync("logs")).Field("events").Rows().Select(OperationEvent.Read).ToArray();
                ProofSuite.True(rows.Any(r => r.Action == "restart" && r.Outcome == "completed"));
                ProofSuite.True(rows.Any(r => r.Action == "ai" && r.Reason.Contains("자동 기록", StringComparison.Ordinal) && r.Reason.Contains(sandbox!.Id, StringComparison.Ordinal)));
                ProofSuite.True(rows.Any(r => r.Action == "update-report" && r.Reason.Contains(report!.Id, StringComparison.Ordinal) && r.Reason.Contains("triaged", StringComparison.Ordinal)));
                var json = (await operations.ReadAsync("logs")).GetRawText(); ProofSuite.True(!json.Contains("manager.key", StringComparison.Ordinal) && !json.Contains("signature", StringComparison.Ordinal) && !json.Contains("cookie", StringComparison.OrdinalIgnoreCase));
            });
            await suite.CheckAsync("development stop/reconnect preserves reports and settings without auto-starting", async () => {
                await operations!.ChangeAsync("stop", new { }, "합성 앱 중지", true); var status = await operations.ReadAsync("status"); ProofSuite.True(status.Field("appRunning").ValueKind == JsonValueKind.False);
                await operations.DisposeAsync(); operations = new(await NodeReviewTransport.ConnectOperationsAsync(backend, catalog.Open(sandbox!.Root)));
                status = await operations.ReadAsync("status"); ProofSuite.True(status.Field("appRunning").ValueKind == JsonValueKind.False);
                ProofSuite.Equal(status.Field("stats").Field("limits").Field("generations").Number(), 80);
                ProofSuite.Equal((await operations.ReadAsync("reports")).Field("reports").Rows().Single().Field("status").Text(), "triaged");
            });
        } finally { if (operations is not null) await operations.DisposeAsync(); }
    }
    private sealed class FakeSsh(SshProcessResult result) : ISshRunner
    {
        public SshProcessResult Result { get; set; } = result;
        public bool Cancel { get; set; }
        public int Calls { get; private set; }
        public Task<SshProcessResult> RunAsync(SshCommand command, CancellationToken cancellation)
        { SshCommandPolicy.Validate(command); Calls++; if (Cancel) return Task.FromCanceled<SshProcessResult>(new CancellationToken(true)); return Task.FromResult(Result); }
    }
    private sealed class FakeOperations : IReviewTransport
    {
        public IReadOnlyList<string> Scopes => ["operations:read", "operations:write"];
        public bool IsFaulted => false;
        public bool FailWrite { get; set; }
        public int Calls { get; private set; }
        public Task<JsonElement> SendAsync(string method, object parameters, CancellationToken cancellation = default)
        { Calls++; if (method == "start" && FailWrite) throw new ControlException("client-result-uncertain"); return Task.FromResult(ProtocolJson.Element(new { controlCenterMode = "synthetic-development" })); }
        public ValueTask DisposeAsync() => ValueTask.CompletedTask;
    }
}
