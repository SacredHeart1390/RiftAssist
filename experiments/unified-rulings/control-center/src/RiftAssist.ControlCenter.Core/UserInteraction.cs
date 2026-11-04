namespace RiftAssist.ControlCenter.Core;

public enum ConfirmationKind { None, Simple, Protected }
public static class UserInteraction
{
    private static readonly IReadOnlyDictionary<string, string> Labels = new Dictionary<string, string>(StringComparer.Ordinal) {
        ["start"] = "개발 앱 시작", ["stop"] = "개발 앱 중지", ["restart"] = "개발 앱 재시작", ["ai"] = "개발 AI 설정 변경",
        ["limits"] = "개발 호출 한도 변경", ["hosting"] = "개발 공개 연결 설정", ["update-report"] = "개발 제보 상태 수정",
        ["settings"] = "SSH 연결 설정 저장", ["approve"] = "카드/번역 승인", ["reject"] = "카드/번역 거절", ["hold"] = "카드/번역 보류",
        ["stage"] = "승인 후보 구성", ["backup"] = "개발 DB/키 백업", ["app-release"] = "개발 앱 버전 적용",
        ["knowledge-activate"] = "개발 자료 활성화", ["knowledge-discover"] = "재수집 차단 정책 확인",
        ["activate"] = "카드 자료 최종 활성화", ["rollback"] = "카드 자료 롤백", ["recover"] = "미완료 작업 확인" };
    public static ConfirmationKind ConfirmationFor(string action)
    {
        if (OperationsPolicy.ReadMethods.Contains(action, StringComparer.Ordinal) || action is "ssh-status" or "refresh" or "audit" or "list" or "get" or "load-settings") return ConfirmationKind.None;
        if (action is "start" or "stop" or "restart" or "ai" or "limits" or "hosting" or "update-report" or "settings" or "approve" or "reject" or "hold" or "stage" or "knowledge-discover") return ConfirmationKind.Simple;
        // Unknown actions fail closed. Destructive/production functionality is never enabled here.
        return ConfirmationKind.Protected;
    }
    public static string AuditReason(string action, string target)
    {
        if (!Labels.TryGetValue(action, out var label) || string.IsNullOrWhiteSpace(target) || target.Length > 700 || target.Any(char.IsControl))
            throw new ControlException("client-action-target");
        var reason = $"{label} · 대상: {target} · Control Center 자동 기록";
        ReviewCoordinator.ValidateReason(reason); return reason;
    }
}

public sealed record StatusTile(string Label, string Value, string Detail);
public static class StatusDashboard
{
    public static IReadOnlyList<StatusTile> Empty => new[] { "CPU", "RAM", "디스크", "가동시간", "웹사이트 / 앱", "systemd 서비스" }.Select(label => new StatusTile(label, "미조회", "")).ToArray();
    public static IReadOnlyList<StatusTile> From(RemoteSnapshot sample, bool stale = false)
    {
        var suffix = stale ? "이전 값 · 현재 상태 미확인" : "";
        var uptime = TimeSpan.FromSeconds(sample.UptimeSeconds);
        return [new("CPU", $"{sample.CpuPercent:F1}%", suffix.Length == 0 ? "순간 사용률" : suffix),
            new("RAM", $"{(sample.MemoryTotalKiB - sample.MemoryAvailableKiB) / 1024:N0} / {sample.MemoryTotalKiB / 1024:N0} MiB", suffix),
            new("디스크", $"{(sample.DiskTotalKiB - sample.DiskAvailableKiB) / 1048576.0:F1} / {sample.DiskTotalKiB / 1048576.0:F1} GiB", suffix.Length == 0 ? "루트 파일시스템" : suffix),
            new("가동시간", $"{uptime.Days}일 {uptime.Hours:00}:{uptime.Minutes:00}:{uptime.Seconds:00}", suffix),
            new("웹사이트 / 앱", Http(sample.HttpsHttp), $"앱: {Http(sample.AppHttp)}" + (stale ? " · 이전 값" : "")),
            new("systemd 서비스", Service(sample.Service), "riftassist.service" + (stale ? " · 이전 값" : ""))];
    }
    public static string Http(int code) => code switch { 0 => "응답 없음", >= 200 and < 300 => $"정상 · HTTP {code}", >= 300 and < 400 => $"이동 응답 · HTTP {code}", _ => $"확인 필요 · HTTP {code}" };
    public static string Service(string value) => value switch { "active" => "실행 중", "inactive" => "중지", "failed" => "실패", "activating" => "시작 중", "deactivating" => "종료 중", "reloading" => "다시 읽는 중", _ => "확인 필요" };
}
