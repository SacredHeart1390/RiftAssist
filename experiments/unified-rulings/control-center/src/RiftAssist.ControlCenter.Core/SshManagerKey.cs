using System.ComponentModel;
using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;

namespace RiftAssist.ControlCenter.Core;

public sealed record ManagerKeyCommand(SshProfile Profile, IReadOnlyList<string> Arguments, string StandardInput);
public static class ManagerKeyPolicy
{
    public const string FixedPath = "/home/azureuser/RiftAssist/experiments/unified-rulings/private/manager.key";
    public static ManagerKeyCommand Build(SshProfile profile) => new(profile, SshCommandPolicy.Build(profile).Arguments,
        "set +x\nLC_ALL=C\nexport LC_ALL\np='" + FixedPath + "'\n" +
        "[ -f \"$p\" ] || exit 71\n[ ! -L \"$p\" ] || exit 73\n[ -r \"$p\" ] || exit 72\n" +
        "n=$(wc -c < \"$p\" 2>/dev/null) || exit 72\n" +
        "[ \"$n\" -ge 64 ] && [ \"$n\" -le 66 ] || exit 74\n" +
        "head -c 67 -- \"$p\" 2>/dev/null || exit 72\n");
    public static void Validate(ManagerKeyCommand command)
    {
        var expected = Build(command.Profile);
        if (command.StandardInput != expected.StandardInput || !command.Arguments.SequenceEqual(expected.Arguments, StringComparer.Ordinal)) throw new ControlException("client-production-control-blocked");
    }
}

// Owns only validated key bytes. No raw-output record, logging, serialization or public key-value property.
public sealed class AdminKeyLease : IDisposable
{
    private byte[]? bytes;
    private AdminKeyLease(byte[] bytes) { this.bytes = bytes; }
    public static AdminKeyLease Parse(ReadOnlySpan<byte> value)
    {
        if (value.Length == 65 && value[64] == 10) value = value[..64];
        else if (value.Length == 66 && value[64] == 13 && value[65] == 10) value = value[..64];
        if (value.Length != 64) throw new ControlException("client-manager-key-format");
        foreach (var b in value) if (!(b is >= 48 and <= 57 or >= 65 and <= 70 or >= 97 and <= 102)) throw new ControlException("client-manager-key-format");
        return new(value.ToArray());
    }
    public async Task AuthenticateAsync(IRemoteAdminReader reader, CancellationToken cancellation)
    {
        if (bytes is null) throw new ControlException("client-manager-key-format");
        string? key = Encoding.ASCII.GetString(bytes);
        try { await reader.LoginAsync(key, cancellation); }
        finally { key = null; } // .NET strings cannot be guaranteed wiped; never stored by this path.
    }
    public override string ToString() => "[protected manager credential]";
    public void Dispose() { if (bytes is not null) CryptographicOperations.ZeroMemory(bytes); bytes = null; }
}
public interface IManagerKeySource { Task<AdminKeyLease> ReadAsync(SshProfile profile, CancellationToken cancellation); }
public sealed class SshManagerKeySource : IManagerKeySource
{
    public Task<AdminKeyLease> ReadAsync(SshProfile profile, CancellationToken cancellation)
    {
        var command = ManagerKeyPolicy.Build(profile); ManagerKeyPolicy.Validate(command);
        var exe = WindowsOpenSshRunner.Executable(profile);
        return RunProcessAsync(WindowsOpenSshRunner.ProcessInfo(exe, command.Arguments), command.StandardInput, cancellation);
    }
    internal static async Task<AdminKeyLease> RunProcessAsync(ProcessStartInfo info, string script, CancellationToken cancellation)
    {
        cancellation.ThrowIfCancellationRequested();
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellation); timeout.CancelAfter(TimeSpan.FromSeconds(20));
        Process process;
        try { process = Process.Start(info) ?? throw new ControlException("client-ssh-start"); }
        catch (Win32Exception) { throw new ControlException("client-ssh-start"); }
        using (process)
        using (timeout.Token.Register(() => Stop(process))) {
            var output = new byte[67]; var count = 0;
            try {
                async Task ReadOutput() {
                    try {
                        while (true) {
                            var n = await process.StandardOutput.BaseStream.ReadAsync(output.AsMemory(count), timeout.Token);
                            if (n == 0) break; count += n;
                            if (count > 66) throw new ControlException("client-manager-key-format");
                        }
                    } catch { Stop(process); throw; }
                }
                async Task<string> ReadError() {
                    var text = new StringBuilder(); var buffer = new char[1024]; int n;
                    try { while ((n = await process.StandardError.ReadAsync(buffer.AsMemory(), timeout.Token)) > 0) {
                        if (text.Length + n > 4096) throw new ControlException("client-manager-key-read"); text.Append(buffer, 0, n);
                    } return text.ToString(); } catch { Stop(process); throw; }
                }
                async Task Send() {
                    try { await process.StandardInput.WriteAsync(script.AsMemory(), timeout.Token); await process.StandardInput.FlushAsync(timeout.Token); }
                    catch (IOException) { }
                    finally { try { process.StandardInput.Close(); } catch (IOException) { } }
                }
                var error = ReadError();
                await Task.WhenAll(ReadOutput(), error, Send(), process.WaitForExitAsync(timeout.Token));
                timeout.Token.ThrowIfCancellationRequested();
                var code = process.ExitCode switch { 71 => "client-manager-key-missing", 72 => "client-manager-key-permission", 73 => "client-manager-key-file", 74 => "client-manager-key-format", 0 => null,
                    _ => SshDiagnostics.FailureCode(new(process.ExitCode, "", await error)) ?? "client-manager-key-read" };
                if (code is not null) throw new ControlException(code);
                return AdminKeyLease.Parse(output.AsSpan(0, count));
            }
            catch (OperationCanceledException) { throw new ControlException(cancellation.IsCancellationRequested ? "client-admin-cancelled" : "client-manager-key-timeout"); }
            catch (IOException) { throw new ControlException("client-manager-key-read"); }
            finally {
                CryptographicOperations.ZeroMemory(output); Stop(process);
                using var cleanup = new CancellationTokenSource(TimeSpan.FromSeconds(2));
                try { await process.WaitForExitAsync(cleanup.Token); } catch (Exception e) when (e is OperationCanceledException or InvalidOperationException) { }
            }
        }
    }
    private static void Stop(Process process) { try { if (!process.HasExited) process.Kill(true); } catch (Exception e) when (e is Win32Exception or InvalidOperationException) { } }
}

public static class AutomaticReadRetry
{
    public const int MaxAttempts = 2;
    public static readonly TimeSpan Interval = TimeSpan.FromSeconds(5);
    public static bool IsTransient(string code) => code is "client-ssh-timeout" or "client-ssh-disconnected" or "client-ssh-session-lost" or "client-ssh-refused"
        or "client-admin-timeout" or "client-admin-disconnected" or "client-admin-unavailable" or "client-admin-forward-failed" or "client-admin-http" or "client-manager-key-timeout" or "client-admin-authentication";
    public static async Task RunAsync(Func<int, CancellationToken, Task> attempt, Func<TimeSpan, CancellationToken, Task> delay, CancellationToken cancellation)
    {
        for (var i = 1; ; i++) {
            cancellation.ThrowIfCancellationRequested();
            try { await attempt(i, cancellation); return; }
            catch (ControlException e) when (i < MaxAttempts && IsTransient(e.Code) && !cancellation.IsCancellationRequested) { await delay(Interval, cancellation); }
        }
    }
}
