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
                var capture = new SafeFixtureCapture(runner);
                var monitor = new RemoteMonitor(capture);
                try { var snapshot = await monitor.ReadAsync(profile, true, timeout.Token); ProofSuite.True(code is null); ProofSuite.Equal(snapshot.Service, "active"); }
                catch (ControlException e) {
                    if (e.Code != code) throw new ControlException("fixture-expected-" + (code ?? "success") + "-received-" + e.Code + "-" + capture.Hint);
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
    private sealed class SafeFixtureCapture(ISshRunner inner) : ISshRunner
    {
        public string Hint { get; private set; } = "no-result";
        public async Task<SshProcessResult> RunAsync(SshCommand command, CancellationToken cancellation)
        {
            var result = await inner.RunAsync(command, cancellation);
            // Exact finite templates only: no fixture stderr, private key, host/path or fingerprint is logged.
            var labels = new List<string>();
            foreach (var (pattern, label) in new[] {
                ("extra arguments", "option-extra-arguments"), ("invalid quotes", "option-quotes"), ("Bad configuration", "option-invalid"),
                ("Could not open", "file-open"), ("Failed to open", "file-open-failed"), ("No such file", "file-absent"),
                ("No user exists", "local-user-missing"), ("getpwuid", "local-user-lookup"), ("get_passwd", "local-passwd-lookup"),
                ("CreateProcess", "local-process"), ("not a socket", "local-socket"), ("Invalid argument", "invalid-argument"),
                ("Connection closed", "connection-closed"), ("Connection reset", "connection-reset"), ("kex_exchange", "kex-exchange"),
                ("no matching", "negotiation"), ("invalid format", "key-format"), ("libcrypto", "crypto"),
                ("Bad owner", "key-owner"), ("Permission denied", "permission"), ("Host key verification", "host-key"),
                ("Unknown error", "unknown-os-error"), ("handle is invalid", "invalid-handle"), ("Failed to create", "create-failed"),
                ("invalid characters", "invalid-characters"), ("Bad port", "bad-port"), ("Bad owner or permissions", "key-permissions")
            }) if (result.Error.Contains(pattern, StringComparison.OrdinalIgnoreCase)) labels.Add(label);
            Hint = labels.Count == 0 ? "unclassified-stderr-length-" + result.Error.Length : string.Join("-", labels);
            return result;
        }
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
