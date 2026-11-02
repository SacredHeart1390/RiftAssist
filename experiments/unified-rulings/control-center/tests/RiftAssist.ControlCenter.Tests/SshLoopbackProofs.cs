using System.Diagnostics;
using System.Text.Json;
using RiftAssist.ControlCenter.Core;

internal static class SshLoopbackProofs
{
    // This is a real OpenSSH client talking ONLY to a generated local mock server. No Azure connection.
    public static async Task RunAsync(ProofSuite suite, string python, string temporary)
    {
        foreach (var (mode, code) in new (string, string?)[] {
            ("good", null), ("remote-error", "client-ssh-remote-command"), ("denied", "client-ssh-authentication"),
            ("host-mismatch", "client-ssh-host-key-changed"), ("bad-output", "client-ssh-response-invalid"), ("drop", "client-ssh-session-lost")
        }) await suite.CheckAsync("actual OpenSSH loopback mock: " + mode, async () => {
            var root = Path.Combine(temporary, "SSH 루프백 " + mode); Directory.CreateDirectory(root);
            var info = new ProcessStartInfo(python) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
            info.ArgumentList.Add(Path.Combine(AppContext.BaseDirectory, "fixtures", "ssh-loopback.py")); info.ArgumentList.Add(root); info.ArgumentList.Add(mode);
            using var server = Process.Start(info) ?? throw new InvalidOperationException();
            var errors = server.StandardError.ReadToEndAsync();
            try {
                using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(20));
                var line = await server.StandardOutput.ReadLineAsync(timeout.Token);
                using var json = JsonDocument.Parse(line ?? "{}"); var port = json.RootElement.GetProperty("port").GetInt32();
                var profile = new SshProfile("127.0.0.1", "synthetic_user", port, Path.Combine(root, "synthetic key.pem"), Path.Combine(root, "known hosts"), "https://example.invalid");
                var command = SshCommandPolicy.Build(profile);
                File.WriteAllText(Path.Combine(root, "expected-input.txt"), command.StandardInput, ProtocolJson.Utf8);
                var runner = OperatingSystem.IsWindows() ? (ISshRunner)new WindowsOpenSshRunner() : new LinuxLoopbackRunner(root);
                var monitor = new RemoteMonitor(runner);
                try { var snapshot = await monitor.ReadAsync(profile, true, timeout.Token); ProofSuite.True(code is null); ProofSuite.Equal(snapshot.Service, "active"); }
                catch (ControlException e) {
                    if (e.Code != code) throw new ControlException("fixture-expected-" + (code ?? "success") + "-received-" + e.Code);
                    ProofSuite.True(!e.ToString().Contains(root, StringComparison.Ordinal));
                }
                ProofSuite.True(!monitor.Diagnostic.Contains("synthetic-sensitive-output", StringComparison.Ordinal));
                if (mode is "good" or "remote-error" or "bad-output") ProofSuite.True(File.Exists(Path.Combine(root, "stdin-verified")));
            }
            finally {
                if (!server.HasExited) server.Kill(entireProcessTree: true);
                await server.WaitForExitAsync(); await errors; // Never echo fixture stderr or generated key material.
            }
        });
    }
    private sealed class LinuxLoopbackRunner(string root) : ISshRunner
    {
        public Task<SshProcessResult> RunAsync(SshCommand command, CancellationToken cancellation)
        {
            if (command.Profile.Host != "127.0.0.1") throw new InvalidOperationException();
            var info = WindowsOpenSshRunner.StartInfo("/usr/bin/ssh", command); info.WorkingDirectory = root;
            File.WriteAllText(Path.Combine(root, "NUL"), ""); // Linux equivalent for Windows -F NUL; test-only empty config.
            return SshProcessIo.RunAsync(info, command.StandardInput, cancellation);
        }
    }
}
