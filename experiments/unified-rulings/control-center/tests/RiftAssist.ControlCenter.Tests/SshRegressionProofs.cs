using System.Diagnostics;
using System.Text.Json;
using RiftAssist.ControlCenter.Core;

internal static class SshRegressionProofs
{
    internal const string Status = "protocol=riftassist-status-1\nuptime_seconds=3600.5\nmemory_total_kib=4194304\nmemory_available_kib=3145728\ndisk_total_kib=67108864\ndisk_available_kib=54525952\ncpu_percent=12.50\nservice=active\napp_http=200\nhttps_http=200\n";
    public static async Task RunAsync(ProofSuite suite, string node, string temporary)
    {
        var root = Path.Combine(temporary, "SSH 한글 and spaces"); Directory.CreateDirectory(root);
        var profile = new SshProfile("example.invalid", "synthetic_user", 22, Path.Combine(root, "key placeholder"), Path.Combine(root, "known hosts"), "https://example.invalid");
        var command = SshCommandPolicy.Build(profile);
        suite.Check("SSH stdin is LF-only UTF-8 without BOM and fixed POSIX sh", () => {
            ProofSuite.True(!command.StandardInput.Contains('\r') && ProtocolJson.Utf8.GetPreamble().Length == 0);
            ProofSuite.Equal(command.Arguments.Last(), "sh -s"); ProofSuite.True(command.Arguments.Contains("ConnectTimeout=10"));
            ProofSuite.True(command.StandardInput.EndsWith("exit 0\n", StringComparison.Ordinal));
        });
        suite.Check("SSH start-info preserves argument boundaries and strips unrelated environment", () => {
            var info = WindowsOpenSshRunner.StartInfo(node, command);
            ProofSuite.True(info.ArgumentList.SequenceEqual(command.Arguments)); ProofSuite.True(!info.UseShellExecute && info.CreateNoWindow);
            ProofSuite.True(info.RedirectStandardInput && info.RedirectStandardOutput && info.RedirectStandardError);
            foreach (var key in new[] { "OPENAI_API_KEY", "RIOT_API_KEY", "ADMIN_KEY", "NODE_OPTIONS", "RIFTASSIST_CC_ENV_CANARY", "PATH" }) ProofSuite.True(!info.Environment.ContainsKey(key));
        });
        foreach (var (name, result, expected) in new (string, SshProcessResult, string?)[] {
            ("remote shell exit 2", new(2, "", "sh: syntax error synthetic-sensitive-output"), "client-ssh-remote-command"),
            ("missing remote tool", new(70, "", "RIFTASSIST_STATUS_STARTED\nRIFTASSIST_STATUS_ERROR=awk\n"), "client-ssh-remote-tools"),
            ("post-auth session loss", new(255, "", "RIFTASSIST_STATUS_STARTED\nConnection reset"), "client-ssh-session-lost"),
            ("Windows no-exit-status -1", new(-1, "", "RIFTASSIST_STATUS_STARTED\n"), "client-ssh-session-lost"),
            ("Windows native crash status", new(unchecked((int)0xC0000005), "", "synthetic-sensitive-output"), "client-ssh-local-failed"),
            ("truncated input success", new(0, Status, "", true), "client-ssh-input-incomplete"),
            ("stdin pipe failure with auth stderr", new(255, "", "Permission denied (publickey). synthetic-sensitive-output", true), "client-ssh-authentication"),
            ("refused", new(255, "", "Connection refused"), "client-ssh-refused"),
            ("DNS", new(255, "", "Could not resolve hostname synthetic-sensitive-output"), "client-ssh-dns"),
            ("unsupported option", new(255, "", "Bad configuration option: synthetic-sensitive-output"), "client-ssh-configuration"),
            ("key load", new(255, "", "Load key synthetic-sensitive-output: invalid format"), "client-ssh-authentication"),
            ("benign stderr", new(0, Status, "synthetic-sensitive-output"), null)
        }) await suite.CheckAsync("SSH failure separation: " + name, async () => {
            var monitor = new RemoteMonitor(new Fixed(result));
            try { await monitor.ReadAsync(profile, true); ProofSuite.True(expected is null); }
            catch (ControlException e) { ProofSuite.Equal(e.Code, expected); ProofSuite.True(!e.ToString().Contains("synthetic-sensitive-output", StringComparison.Ordinal)); }
            ProofSuite.True(!monitor.Diagnostic.Contains("synthetic-sensitive-output", StringComparison.Ordinal));
        });
        await suite.CheckAsync("SSH exit zero malformed output is parsing failure rather than disconnect", async () => {
            var monitor = new RemoteMonitor(new Fixed(new(0, "login banner\n" + Status, "")));
            await ProofSuite.ThrowsAsync(() => monitor.ReadAsync(profile, true)); ProofSuite.Equal(monitor.State, "client-ssh-response-invalid");
            ProofSuite.True(monitor.LastGood is null && monitor.Diagnostic.Contains("종료 코드 0", StringComparison.Ordinal));
        });
        suite.Check("SSH diagnostic only permits known marker values", () => {
            var result = new SshProcessResult(70, "", "RIFTASSIST_STATUS_ERROR=synthetic-sensitive-output\nRIFTASSIST_STATUS_WARNING=synthetic-sensitive-output\n");
            ProofSuite.True(!SshDiagnostics.Describe(result).Contains("synthetic-sensitive-output", StringComparison.Ordinal));
            ProofSuite.Equal(SshDiagnostics.FailureCode(result), "client-ssh-remote-command");
        });
        await suite.CheckAsync("unexpected local exception is never described as server disconnect", async () => {
            var monitor = new RemoteMonitor(new LocalFailure()); await ProofSuite.ThrowsAsync(() => monitor.ReadAsync(profile, true));
            ProofSuite.Equal(monitor.State, "client-ssh-local-failed");
        });
        var worker = Path.Combine(root, "pipe-fixture.cjs");
        File.WriteAllText(worker, """
        const fs = require('node:fs'); const [mode, expected] = process.argv.slice(2);
        if (mode === 'early') { fs.closeSync(0); process.stderr.write('Permission denied (publickey). synthetic-sensitive-output\n'); process.exitCode=255; }
        else if (mode === 'hang') { fs.writeFileSync(expected+'.pid.tmp',String(process.pid)); fs.renameSync(expected+'.pid.tmp',expected+'.pid'); setInterval(()=>{},1000); }
        else if (mode === 'limit') { process.stdout.write('x'.repeat(70000)); setInterval(()=>{},1000); }
        else if (mode === 'invalid-utf8') { process.stdout.write(Buffer.from([0xff,0xfe])); }
        else {
          const chunks=[]; process.stdin.on('data',x=>chunks.push(x)); process.stdin.on('end',()=>{
            if (!Buffer.concat(chunks).equals(fs.readFileSync(expected))) { process.exitCode=91; return; }
            process.stdout.write('INPUT_OK'); process.stderr.write(Buffer.from([0xff,0xfe]));
          });
        }
        """);
        var expectedFile = Path.Combine(root, "expected stdin.txt"); File.WriteAllText(expectedFile, command.StandardInput, ProtocolJson.Utf8);
        ProcessStartInfo Info(string mode) {
            var info = WindowsOpenSshRunner.StartInfo(node, command); info.ArgumentList.Clear();
            foreach (var arg in new[] { worker, mode, expectedFile }) info.ArgumentList.Add(arg); return info;
        }
        await suite.CheckAsync("real child pipes preserve Korean paths, LF stdin, EOF and non-UTF8 stderr", async () => {
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            var result = await SshProcessIo.RunAsync(Info("normal"), command.StandardInput, timeout.Token);
            ProofSuite.Equal(result.ExitCode, 0); ProofSuite.Equal(result.Output, "INPUT_OK"); ProofSuite.True(!result.InputClosedEarly);
        });
        await suite.CheckAsync("real early child stdin close still returns authentication stderr and exit code", async () => {
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            var result = await SshProcessIo.RunAsync(Info("early"), new string('x', 4 * 1024 * 1024), timeout.Token);
            ProofSuite.Equal(result.ExitCode, 255); ProofSuite.True(result.InputClosedEarly);
            ProofSuite.Equal(SshDiagnostics.FailureCode(result), "client-ssh-authentication");
        });
        await suite.CheckAsync("real pipe output limit terminates child promptly without deadlock", async () => {
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10)); var watch = Stopwatch.StartNew();
            try { await SshProcessIo.RunAsync(Info("limit"), command.StandardInput, timeout.Token); throw new InvalidOperationException(); }
            catch (ControlException e) { ProofSuite.Equal(e.Code, "client-ssh-response-limit"); }
            ProofSuite.True(watch.Elapsed < TimeSpan.FromSeconds(8));
        });
        await suite.CheckAsync("invalid stdout UTF-8 is a parse failure, not SSH disconnected", async () => {
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            try { await SshProcessIo.RunAsync(Info("invalid-utf8"), command.StandardInput, timeout.Token); throw new InvalidOperationException(); }
            catch (ControlException e) { ProofSuite.Equal(e.Code, "client-ssh-response-invalid"); }
        });
        await suite.CheckAsync("real hanging child respects cancellation and is reaped", async () => {
            // Cancellation used to race writeFileSync's create/truncate/write, leaving
            // an empty PID file on loaded Windows runners. Require atomic readiness
            // first: the test must prove a live child was actually cancelled.
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            var running = SshProcessIo.RunAsync(Info("hang"), command.StandardInput, timeout.Token);
            try {
                while (!File.Exists(expectedFile + ".pid") && !running.IsCompleted && !timeout.IsCancellationRequested)
                    await Task.Delay(10);
                ProofSuite.True(File.Exists(expectedFile + ".pid"));
                var pid = int.Parse(File.ReadAllText(expectedFile + ".pid"));
                using (var started = Process.GetProcessById(pid)) ProofSuite.True(!started.HasExited);
                var watch = Stopwatch.StartNew(); timeout.Cancel();
                try { await running; throw new InvalidOperationException(); }
                catch (OperationCanceledException) { ProofSuite.True(timeout.IsCancellationRequested); }
                ProofSuite.True(watch.Elapsed < TimeSpan.FromSeconds(8));
                try { using var child = Process.GetProcessById(pid); ProofSuite.True(child.HasExited); }
                catch (ArgumentException) { } // Exited process already removed by the OS.
            } finally {
                timeout.Cancel();
                try { await running; } catch (OperationCanceledException) { }
            }
        });
        await suite.CheckAsync("local executable launch failure is sanitized and distinct", async () => {
            var info = Info("normal"); info.FileName = Path.Combine(root, "missing-ssh.exe");
            try { await SshProcessIo.RunAsync(info, command.StandardInput, default); throw new InvalidOperationException(); }
            catch (ControlException e) { ProofSuite.Equal(e.Code, "client-ssh-start"); ProofSuite.True(!e.ToString().Contains(root, StringComparison.Ordinal)); }
        });
        if (OperatingSystem.IsLinux()) await LinuxScriptProofs(suite, profile, root);
        if (Environment.GetEnvironmentVariable("RIFTASSIST_CC_LOOPBACK_PYTHON") is { Length: > 0 } python)
            await SshLoopbackProofs.RunAsync(suite, python, root);
    }
    private static async Task LinuxScriptProofs(ProofSuite suite, SshProfile profile, string root)
    {
        var bin = Path.Combine(root, "stub-bin"); Directory.CreateDirectory(bin);
        void Stub(string name, string body) {
            var path = Path.Combine(bin, name); File.WriteAllText(path, "#!/bin/sh\n" + body + "\n", ProtocolJson.Utf8);
            if (!OperatingSystem.IsWindows()) File.SetUnixFileMode(path, UnixFileMode.UserRead | UnixFileMode.UserWrite | UnixFileMode.UserExecute);
        }
        Stub("curl", "printf 200"); Stub("systemctl", "printf 'active\\n'");
        async Task<SshProcessResult> Run() {
            var info = WindowsOpenSshRunner.StartInfo("/bin/sh", SshCommandPolicy.Build(profile)); info.ArgumentList.Clear(); info.ArgumentList.Add("-s");
            info.Environment["PATH"] = bin + ":/usr/bin:/bin";
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(10));
            return await SshProcessIo.RunAsync(info, SshCommandPolicy.Build(profile).StandardInput, timeout.Token);
        }
        await suite.CheckAsync("Linux POSIX sh status script runs with real /proc and stubbed HTTP/systemd", async () => {
            var result = await Run(); ProofSuite.Equal(result.ExitCode, 0); var snapshot = RemoteSnapshot.Parse(result.Output);
            ProofSuite.Equal(snapshot.Service, "active"); ProofSuite.Equal(snapshot.HttpsHttp, 200);
            ProofSuite.True(result.Error.Contains("RIFTASSIST_STATUS_COMPLETE", StringComparison.Ordinal));
        });
        await suite.CheckAsync("Linux missing required tool yields safe dependency failure", async () => {
            Stub("df", "exit 1"); var result = await Run(); ProofSuite.Equal(result.ExitCode, 70);
            ProofSuite.Equal(SshDiagnostics.FailureCode(result), "client-ssh-remote-tools");
            ProofSuite.True(SshDiagnostics.Describe(result).Contains("disk", StringComparison.Ordinal)); File.Delete(Path.Combine(bin, "df"));
        });
        await suite.CheckAsync("Linux unavailable optional health/systemd retain metrics with explicit warnings", async () => {
            Stub("curl", "exit 7"); Stub("systemctl", "exit 1"); var result = await Run(); ProofSuite.Equal(result.ExitCode, 0);
            var snapshot = RemoteSnapshot.Parse(result.Output); ProofSuite.Equal(snapshot.AppHttp, 0); ProofSuite.Equal(snapshot.Service, "unknown");
            ProofSuite.True(SshDiagnostics.Describe(result).Contains("HTTPS 응답 미확인", StringComparison.Ordinal));
        });
    }
    private sealed class Fixed(SshProcessResult result) : ISshRunner
    { public Task<SshProcessResult> RunAsync(SshCommand command, CancellationToken cancellation) => Task.FromResult(result); }
    private sealed class LocalFailure : ISshRunner
    { public Task<SshProcessResult> RunAsync(SshCommand command, CancellationToken cancellation) => throw new InvalidOperationException("synthetic-sensitive-output"); }
}
