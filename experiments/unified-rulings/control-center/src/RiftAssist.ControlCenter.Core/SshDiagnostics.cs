namespace RiftAssist.ControlCenter.Core;

// Only finite labels and numeric exit codes leave this boundary. Never echo raw stderr, paths or banners.
public static class SshDiagnostics
{
    private static bool Line(SshProcessResult result, string line) => result.Error.Split('\n').Any(l => l.TrimEnd('\r') == line);
    public static bool SessionStarted(SshProcessResult result) => Line(result, "RIFTASSIST_STATUS_STARTED")
        || result.Output.Split('\n').Any(l => l.TrimEnd('\r') == "protocol=riftassist-status-1");
    private static string? RemoteError(SshProcessResult result)
    {
        foreach (var tool in new[] { "awk", "df", "head", "sleep", "proc", "disk", "metrics" })
            if (Line(result, "RIFTASSIST_STATUS_ERROR=" + tool)) return tool;
        return null;
    }
    public static string? FailureCode(SshProcessResult result)
    {
        // POSIX truncates exit(-1) to 255; Windows preserves it as signed 0xFFFFFFFF.
        // OpenSSH uses -1 when a channel closes without a remote exit status.
        if (result.ExitCode is 255 or -1)
        {
            if (SessionStarted(result)) return "client-ssh-session-lost";
            var error = result.Error;
            bool Has(string value) => error.Contains(value, StringComparison.OrdinalIgnoreCase);
            return "client-ssh-" + (Has("REMOTE HOST IDENTIFICATION HAS CHANGED") ? "host-key-changed"
                : Has("Host key verification failed") ? "host-key-unverified"
                : Has("Permission denied") || Has("Load key") || Has("sign_and_send_pubkey") ? "authentication"
                : Has("Bad configuration option") || Has("Bad configuration options") || Has("no argument after keyword") ? "configuration"
                : Has("Could not resolve hostname") || Has("Name or service not known") ? "dns"
                : Has("Connection refused") ? "refused"
                : Has("timed out") ? "timeout" : "disconnected");
        }
        if (result.ExitCode < 0) return "client-ssh-local-failed"; // Other native crash/termination status, not a shell exit.
        if (result.ExitCode != 0) return RemoteError(result) is not null ? "client-ssh-remote-tools" : "client-ssh-remote-command";
        if (result.InputClosedEarly) return "client-ssh-input-incomplete";
        return null;
    }
    public static string Describe(SshProcessResult result)
    {
        var stage = SessionStarted(result) ? "원격 조회 시작 확인" : result.ExitCode is > 0 and < 255 ? "원격 명령 실패" : "SSH 실행 결과";
        var text = $"{stage} · 종료 코드 {result.ExitCode}";
        if (RemoteError(result) is { } tool) text += " · 서버 점검 항목: " + tool;
        if (result.InputClosedEarly) text += " · 스크립트 입력 파이프 조기 종료";
        foreach (var (key, label) in new[] { ("systemd", "systemd 상태 미확인"), ("app-health", "내부 앱 HTTP 응답 미확인"), ("https-health", "HTTPS 응답 미확인") })
            if (Line(result, "RIFTASSIST_STATUS_WARNING=" + key)) text += " · " + label;
        return text;
    }
}
