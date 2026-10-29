using System.Diagnostics;
using System.Globalization;
using System.Net;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace RiftAssist.ControlCenter.Core;

public sealed record SshProfile(string Host = "", string User = "", int Port = 22, string IdentityFile = "", string KnownHostsFile = "", string HttpsOrigin = "")
{
    public void Validate()
    {
        if (new[] { Host, User, IdentityFile, KnownHostsFile, HttpsOrigin }.Any(value => value is null) || HttpsOrigin.Length > 2048) throw new ControlException("client-ssh-profile");
        if (Host.Length is < 1 or > 253 || !(IPAddress.TryParse(Host, out _) || Regex.IsMatch(Host, @"\A[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?\z"))
            || !Regex.IsMatch(User, @"\A[a-zA-Z_][a-zA-Z0-9_-]{0,63}\z") || Port is < 1 or > 65535) throw new ControlException("client-ssh-profile");
        foreach (var value in new[] { IdentityFile, KnownHostsFile })
            if (value.Length > 1024 || value.Any(c => char.IsControl(c) || c is '"' or '\'') || (value.Length != 0 && !Path.IsPathFullyQualified(value))) throw new ControlException("client-ssh-profile");
        if (KnownHostsFile.Length == 0 || !Uri.TryCreate(HttpsOrigin, UriKind.Absolute, out var uri) || uri.Scheme != "https" || !uri.IsDefaultPort
            || uri.UserInfo.Length != 0 || uri.AbsolutePath != "/" || uri.Query.Length != 0 || uri.Fragment.Length != 0
            || !Regex.IsMatch(HttpsOrigin, @"\Ahttps://[a-zA-Z0-9.\[\]:-]+/?\z")) throw new ControlException("client-ssh-profile");
    }
    [JsonIgnore] public string HealthUrl => HttpsOrigin.TrimEnd('/') + "/api/health";
}

public sealed class SshProfileStore(string directory)
{
    public string DirectoryPath { get; } = Path.GetFullPath(directory);
    public static SshProfileStore Local() => new(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "RiftAssist", "ControlCenter", "Settings"));
    private string FilePath => Path.Combine(DirectoryPath, "ssh.local.json");
    private static JsonSerializerOptions Options => new(ProtocolJson.Options) { UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow };
    public SshProfile Load()
    {
        SafePath.NoLinks(FilePath);
        if (!File.Exists(FilePath)) return new SshProfile(KnownHostsFile: Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), ".ssh", "known_hosts"));
        if (new FileInfo(FilePath).Length > 16384) throw new ControlException("client-ssh-profile");
        try { var profile = JsonSerializer.Deserialize<SshProfile>(File.ReadAllBytes(FilePath), Options) ?? throw new JsonException(); profile.Validate(); return profile; }
        catch (JsonException) { throw new ControlException("client-ssh-profile"); }
    }
    public void Save(SshProfile profile)
    {
        profile.Validate(); SafePath.NoLinks(FilePath); Directory.CreateDirectory(DirectoryPath);
        var temporary = Path.Combine(DirectoryPath, Guid.NewGuid().ToString("N") + ".tmp");
        try { File.WriteAllText(temporary, JsonSerializer.Serialize(profile, Options), ProtocolJson.Utf8); File.Move(temporary, FilePath, true); }
        finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
}

public sealed record SshCommand(SshProfile Profile, IReadOnlyList<string> Arguments, string StandardInput);
public static class SshCommandPolicy
{
    public static void Validate(SshCommand command)
    {
        var expected = Build(command.Profile);
        if (expected.StandardInput != command.StandardInput || !expected.Arguments.SequenceEqual(command.Arguments, StringComparer.Ordinal)) throw new ControlException("client-production-control-blocked");
    }
    // One fixed script, no user command, sudo, log/DB read, port forwarding, service mutation or deployment.
    public static SshCommand Build(SshProfile profile)
    {
        profile.Validate();
        string QuotedPath(string value) => "\"" + value.Replace('\\', '/') + "\"";
        var arguments = new List<string> { "-F", "NUL", "-T", "-p", profile.Port.ToString(CultureInfo.InvariantCulture),
            "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "UpdateHostKeys=no", "-o", "GlobalKnownHostsFile=NUL",
            "-o", "UserKnownHostsFile=" + QuotedPath(profile.KnownHostsFile), "-o", "ConnectTimeout=8", "-o", "ConnectionAttempts=1",
            "-o", "ServerAliveInterval=5", "-o", "ServerAliveCountMax=1", "-o", "ForwardAgent=no", "-o", "ForwardX11=no",
            "-o", "ClearAllForwardings=yes", "-o", "PermitLocalCommand=no", "-o", "LogLevel=ERROR" };
        if (profile.IdentityFile.Length != 0) arguments.AddRange(["-o", "IdentitiesOnly=yes", "-i", profile.IdentityFile]);
        var destination = profile.Host.Contains(':', StringComparison.Ordinal) ? $"[{profile.Host}]" : profile.Host;
        arguments.AddRange([profile.User + "@" + destination, "sh -s"]);
        var script = "LC_ALL=C\nexport LC_ALL\n" +
            "printf 'protocol=riftassist-status-1\\n'\n" +
            "awk '{print \"uptime_seconds=\" $1}' /proc/uptime\n" +
            "awk '/^MemTotal:/ {print \"memory_total_kib=\" $2} /^MemAvailable:/ {print \"memory_available_kib=\" $2}' /proc/meminfo\n" +
            "df -Pk / 2>/dev/null | awk 'NR==2 {print \"disk_total_kib=\" $2; print \"disk_available_kib=\" $4}'\n" +
            "cpu_a=$(head -n 1 /proc/stat); sleep 0.2; cpu_b=$(head -n 1 /proc/stat)\n" +
            "printf '%s\\n%s\\n' \"$cpu_a\" \"$cpu_b\" | awk 'NR==1 {for(i=2;i<=9;i++) t+=$i; idle=$5+$6; next} {for(i=2;i<=9;i++) u+=$i; d=u-t; if(d>0) printf \"cpu_percent=%.2f\\n\", 100*(1-(($5+$6)-idle)/d); else print \"cpu_percent=0\"}'\n" +
            "service=$(systemctl show riftassist.service --property=ActiveState --value 2>/dev/null)\n" +
            "case \"$service\" in active|inactive|failed|activating|deactivating|reloading) ;; *) service=unknown;; esac\n" +
            "printf 'service=%s\\n' \"$service\"\n" +
            "app=$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 5 --connect-timeout 3 --noproxy '*' http://127.0.0.1:3001/api/health 2>/dev/null)\n" +
            "printf 'app_http=%s\\n' \"${app:-000}\"\n" +
            "https=$(curl --silent --output /dev/null --write-out '%{http_code}' --max-time 5 --connect-timeout 3 --proto '=https' --noproxy '*' '" + profile.HealthUrl + "' 2>/dev/null)\n" +
            "printf 'https_http=%s\\n' \"${https:-000}\"\n";
        return new(profile, arguments, script);
    }
    public static void DenyOperationalMutation() => throw new ControlException("client-production-control-blocked");
}

public sealed record SshProcessResult(int ExitCode, string Output, string Error);
public interface ISshRunner { Task<SshProcessResult> RunAsync(SshCommand command, CancellationToken cancellation); }
public sealed class WindowsOpenSshRunner : ISshRunner
{
    public async Task<SshProcessResult> RunAsync(SshCommand command, CancellationToken cancellation)
    {
        SshCommandPolicy.Validate(command);
        if (!OperatingSystem.IsWindows()) throw new ControlException("client-ssh-windows-only");
        var executable = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System), "OpenSSH", "ssh.exe");
        if (!File.Exists(executable)) throw new ControlException("client-ssh-missing");
        foreach (var path in new[] { executable, command.Profile.KnownHostsFile, command.Profile.IdentityFile }.Where(p => p.Length != 0))
        { SafePath.NoLinks(path); if (!File.Exists(path)) throw new ControlException("client-ssh-file-missing"); }
        var info = new ProcessStartInfo(executable) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = true,
            RedirectStandardOutput = true, RedirectStandardError = true, StandardInputEncoding = ProtocolJson.Utf8, StandardOutputEncoding = ProtocolJson.Utf8, StandardErrorEncoding = ProtocolJson.Utf8 };
        info.Environment.Clear();
        foreach (var key in new[] { "SystemRoot", "WINDIR", "USERPROFILE", "HOMEDRIVE", "HOMEPATH" })
            if (Environment.GetEnvironmentVariable(key) is { } value) info.Environment[key] = value;
        foreach (var argument in command.Arguments) info.ArgumentList.Add(argument);
        using var process = Process.Start(info) ?? throw new ControlException("client-ssh-start");
        try
        {
            var stdout = ReadBounded(process.StandardOutput, cancellation); var stderr = ReadBounded(process.StandardError, cancellation);
            await process.StandardInput.WriteAsync(command.StandardInput.AsMemory(), cancellation); process.StandardInput.Close();
            await process.WaitForExitAsync(cancellation); return new(process.ExitCode, await stdout, await stderr);
        }
        catch { ChildProcess.Stop(process); throw; }
    }
    private static async Task<string> ReadBounded(StreamReader reader, CancellationToken cancellation)
    {
        var output = new System.Text.StringBuilder(); var buffer = new char[2048]; int count;
        while ((count = await reader.ReadAsync(buffer.AsMemory(), cancellation)) != 0)
        { output.Append(buffer, 0, count); if (output.Length > 32768) throw new ControlException("client-ssh-response-limit"); }
        return output.ToString();
    }
}

public sealed record RemoteSnapshot(DateTimeOffset ObservedAt, double CpuPercent, long MemoryTotalKiB, long MemoryAvailableKiB,
    long DiskTotalKiB, long DiskAvailableKiB, double UptimeSeconds, string Service, int AppHttp, int HttpsHttp)
{
    public string Display => $"CPU {CpuPercent:F1}% · RAM {(MemoryTotalKiB - MemoryAvailableKiB) / 1024:N0}/{MemoryTotalKiB / 1024:N0} MiB\n"
        + $"디스크 {(DiskTotalKiB - DiskAvailableKiB) / 1048576.0:F1}/{DiskTotalKiB / 1048576.0:F1} GiB · 가동 {TimeSpan.FromSeconds(UptimeSeconds)}\n"
        + $"riftassist.service: {Service} · 앱 HTTP {AppHttp:000} · HTTPS HTTP {HttpsHttp:000}\n조회: {ObservedAt.ToLocalTime():yyyy-MM-dd HH:mm:ss}";
    public static RemoteSnapshot Parse(string output)
    {
        try
        {
            if (output.Length > 8192) throw new FormatException();
            var pairs = output.Split('\n', StringSplitOptions.RemoveEmptyEntries).Select(l => l.TrimEnd('\r').Split('=', 2)).ToArray();
            if (pairs.Any(p => p.Length != 2) || pairs.Length != 10 || pairs.Select(p => p[0]).Distinct(StringComparer.Ordinal).Count() != pairs.Length) throw new FormatException();
            var values = pairs.ToDictionary(p => p[0], p => p[1], StringComparer.Ordinal);
            var keys = new[] { "protocol", "cpu_percent", "memory_total_kib", "memory_available_kib", "disk_total_kib", "disk_available_kib", "uptime_seconds", "service", "app_http", "https_http" };
            if (values.Count != keys.Length || keys.Any(k => !values.ContainsKey(k)) || values["protocol"] != "riftassist-status-1") throw new FormatException();
            double Number(string key) => double.Parse(values[key], NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture);
            long Integer(string key) => long.Parse(values[key], NumberStyles.None, CultureInfo.InvariantCulture);
            var cpu = Number("cpu_percent"); var uptime = Number("uptime_seconds");
            var total = Integer("memory_total_kib"); var free = Integer("memory_available_kib"); var disk = Integer("disk_total_kib"); var available = Integer("disk_available_kib");
            var app = Integer("app_http"); var https = Integer("https_http"); var service = values["service"];
            if (!double.IsFinite(cpu) || cpu is < 0 or > 100 || !double.IsFinite(uptime) || uptime < 0 || uptime > TimeSpan.MaxValue.TotalSeconds / 2
                || total <= 0 || free < 0 || free > total || disk <= 0 || available < 0 || available > disk
                || (app != 0 && app is < 100 or > 599) || (https != 0 && https is < 100 or > 599)
                || !new[] { "active", "inactive", "failed", "activating", "deactivating", "reloading", "unknown" }.Contains(service, StringComparer.Ordinal)) throw new FormatException();
            return new(DateTimeOffset.UtcNow, cpu, total, free, disk, available, uptime, service, (int)app, (int)https);
        }
        catch (Exception e) when (e is FormatException or OverflowException or ArgumentException or KeyNotFoundException) { throw new ControlException("client-ssh-response-invalid"); }
    }
}

public sealed class RemoteMonitor(ISshRunner runner)
{
    private SshProfile? previousProfile;
    public RemoteSnapshot? LastGood { get; private set; }
    public string State { get; private set; } = "연결되지 않음";
    public bool Stale { get; private set; }
    public void Reset() { LastGood = null; Stale = false; previousProfile = null; State = "연결되지 않음"; }
    public async Task<RemoteSnapshot> ReadAsync(SshProfile profile, bool separatelyApproved, CancellationToken cancellation = default)
    {
        if (!separatelyApproved) throw new ControlException("client-ssh-approval-required");
        if (previousProfile != profile) { LastGood = null; Stale = false; previousProfile = profile; }
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellation); deadline.CancelAfter(TimeSpan.FromSeconds(25));
        State = "조회 중";
        try
        {
            var result = await runner.RunAsync(SshCommandPolicy.Build(profile), deadline.Token);
            if (result.ExitCode != 0)
            {
                var code = result.Error.Contains("REMOTE HOST IDENTIFICATION HAS CHANGED", StringComparison.OrdinalIgnoreCase) ? "host-key-changed"
                    : result.Error.Contains("Host key verification failed", StringComparison.OrdinalIgnoreCase) ? "host-key-unverified"
                    : result.Error.Contains("Permission denied", StringComparison.OrdinalIgnoreCase) ? "authentication"
                    : result.Error.Contains("timed out", StringComparison.OrdinalIgnoreCase) ? "timeout" : "disconnected";
                throw new ControlException("client-ssh-" + code);
            }
            LastGood = RemoteSnapshot.Parse(result.Output); State = "SSH 조회 완료 · 운영 변경 차단"; Stale = false; return LastGood;
        }
        catch (OperationCanceledException) { State = cancellation.IsCancellationRequested ? "client-ssh-cancelled" : "client-ssh-timeout"; Stale = LastGood is not null; throw new ControlException(State); }
        catch (ControlException e) { State = e.Code; Stale = LastGood is not null; throw; }
        catch { State = "client-ssh-disconnected"; Stale = LastGood is not null; throw new ControlException(State); }
    }
}
