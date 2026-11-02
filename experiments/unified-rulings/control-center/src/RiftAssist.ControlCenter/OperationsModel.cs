using System.Collections.ObjectModel;
using System.ComponentModel;
using System.IO;
using System.Runtime.CompilerServices;
using System.Text.Json;
using RiftAssist.ControlCenter.Core;

namespace RiftAssist.ControlCenter;

public sealed class LimitRow(string name, int value) : INotifyPropertyChanged
{
    private int current = value;
    public string Name => name;
    public string Label => OperationsPolicy.LimitLabels[name];
    public int Value { get => current; set { current = value; PropertyChanged?.Invoke(this, new(nameof(Value))); } }
    public event PropertyChangedEventHandler? PropertyChanged;
}
public sealed partial class OperationsModel : INotifyPropertyChanged, IAsyncDisposable
{
    private bool busy, azureMode;
    private string state = "개발 관리자 연결 안 됨 · 운영 변경 차단";
    private string dashboard = "모의/개발 환경을 명시적으로 준비하면 상태를 표시합니다. 저장된 SSH 설정이 있으면 시작 시 읽기 전용 자동 연결합니다.";
    private string ai = "실제 API 비용/사용량 미연결";
    private string reportDetail = "제보를 선택하세요. 운영 자료는 화면 메모리에서만 조회합니다.";
    private string lastResult = "개발 제어 작업 결과 없음";
    private SshProfile profile;
    private readonly SshProfileStore settings;
    private readonly RemoteMonitor monitor;
    private DevelopmentOperations? operations;
    private IRemoteAdminReader? remoteAdmin;
    private readonly Func<SshProfile, IRemoteAdminReader> adminFactory;
    private string adminState = "운영 관리자 미연결", adminSummary = "운영 관리자 상태 미조회";
    public string AdminState { get => adminState; private set { adminState = value; Changed(); } }
    public string AdminSummary { get => adminSummary; private set { adminSummary = value; Changed(); } }
    public bool CanReadAdmin => AzureMode && !Busy && remoteAdmin?.Authenticated == true;
    public bool LimitsReadOnly => !CanControl;

    private OwnedSandbox? sandbox;
    private JsonElement status;
    private CancellationTokenSource? query;
    public SandboxCatalog Catalog { get; } = new(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "RiftAssist", "ControlCenter", "OperationsSandboxes"));
    public ObservableCollection<OwnedSandbox> Environments { get; } = [];
    public ObservableCollection<StatusTile> Metrics { get; } = [];
    private string connectionStatus = "미연결", snapshotInfo = "아직 조회하지 않았습니다.", settingsFeedback = "";
    public string ConnectionStatus { get => connectionStatus; private set { connectionStatus = value; Changed(); } }
    public string SnapshotInfo { get => snapshotInfo; private set { snapshotInfo = value; Changed(); } }
    public string SettingsFeedback { get => settingsFeedback; set { settingsFeedback = value; Changed(); } }
    public string OperationTarget => sandbox?.Id ?? "미연결";
    public ObservableCollection<LimitRow> Limits { get; } = [];
    public ObservableCollection<OperationsReport> Reports { get; } = [];
    public ObservableCollection<OperationEvent> Events { get; } = [];
    public ObservableCollection<string> LocalEvents { get; } = [];
    public ObservableCollection<string> AppReleases { get; } = [];
    public ObservableCollection<string> KnowledgeReleases { get; } = [];
    public IReadOnlyList<string> ReportStates => OperationsPolicy.ReportStates;
    public bool AzureMode { get => azureMode; private set { azureMode = value; Changed(); Changed(nameof(CanControl)); Changed(nameof(CanPrepareDevelopment)); Changed(nameof(TargetLabel)); } }
    public string TargetLabel => AzureMode ? "Azure · 상태 조회" : "합성 개발 환경";
    public bool CanControl => !Busy && !AzureMode && operations?.Connected == true;
    public bool CanPrepareDevelopment => !Busy && !AzureMode;
    public bool Busy { get => busy; set { busy = value; Changed(); Changed(nameof(CanControl)); Changed(nameof(CanPrepareDevelopment)); Changed(nameof(CanReadAdmin)); Changed(nameof(LimitsReadOnly)); Changed(nameof(CanRecoverConnection)); } }
    public bool AiEnabled => status.Field("stats").Field("aiEnabled").ValueKind == JsonValueKind.True;
    public string State { get => state; set { state = value; Changed(); } }
    public string Dashboard { get => dashboard; private set { dashboard = value; Changed(); } }
    public string Ai { get => ai; private set { ai = value; Changed(); } }
    public string ReportDetail { get => reportDetail; set { reportDetail = value; Changed(); } }
    public string LastResult { get => lastResult; private set { lastResult = value; Changed(); } }
    public string LocalRoot => sandbox?.Root ?? "개발 관리자 데이터 위치: 미연결";
    public string ActiveKnowledgeId { get; private set; } = "";
    public string Host { get => profile.Host; set => SetProfile(profile with { Host = value }); }
    public string User { get => profile.User; set => SetProfile(profile with { User = value }); }
    public int Port { get => profile.Port; set => SetProfile(profile with { Port = value }); }
    public string IdentityFile { get => profile.IdentityFile; set => SetProfile(profile with { IdentityFile = value }); }
    public string KnownHostsFile { get => profile.KnownHostsFile; set => SetProfile(profile with { KnownHostsFile = value }); }
    public string HttpsOrigin { get => profile.HttpsOrigin; set => SetProfile(profile with { HttpsOrigin = value }); }
    public event PropertyChangedEventHandler? PropertyChanged;
    private void Changed([CallerMemberName] string? name = null) => PropertyChanged?.Invoke(this, new(name));
    public OperationsModel(ISshRunner? runner = null, SshProfileStore? settingsStore = null, Func<SshProfile, IRemoteAdminReader>? remoteAdminFactory = null, SavedAdminLogin? savedAdminLogin = null, IManagerKeySource? automaticKeySource = null, Func<TimeSpan, CancellationToken, Task>? retryDelay = null, TimeProvider? clock = null)
    {
        managerKeySource = automaticKeySource ?? new SshManagerKeySource(); automaticDelay = retryDelay ?? ((delay, token) => Task.Delay(delay, token)); automaticClock = clock ?? TimeProvider.System;
        savedLogin = savedAdminLogin ?? SavedAdminLogin.Local();
        adminFactory = remoteAdminFactory ?? (p => new RemoteAdminReader(new SshAdminStreamConnector(p)));
        settings = settingsStore ?? SshProfileStore.Local(); monitor = new(runner ?? new WindowsOpenSshRunner()); profile = new SshProfile();
        ResetMetrics();
        try { LoadSettings(); ReloadEnvironments(); }
        catch { SettingsFeedback = "저장된 설정을 불러오지 못했습니다. 연결 정보를 확인해 주세요."; }
    }
    private void SetProfile(SshProfile next, [CallerMemberName] string? name = null)
    {
        if (profile == next) return; profile = next; Changed(name); InvalidateRemote(); SettingsFeedback = "저장하지 않은 변경사항이 있습니다.";
    }
    public void LoadSettings()
    {
        profile = settings.Load();
        foreach (var name in new[] { nameof(Host), nameof(User), nameof(Port), nameof(IdentityFile), nameof(KnownHostsFile), nameof(HttpsOrigin) }) Changed(name);
        InvalidateRemote(); SettingsFeedback = "로컬 설정을 불러왔습니다. 조회는 자동으로 시작하지 않습니다.";
    }
    public void ValidateSettings() => profile.Validate();
    private void ResetMetrics() { Metrics.Clear(); foreach (var tile in StatusDashboard.Empty) Metrics.Add(tile); SnapshotInfo = "아직 조회하지 않았습니다."; ConnectionStatus = "미연결"; }
    private void PresentSnapshot(RemoteSnapshot? sample, bool stale = false, bool mock = false)
    {
        Metrics.Clear(); foreach (var tile in sample is null ? StatusDashboard.Empty : StatusDashboard.From(sample, stale))
            Metrics.Add(mock ? tile with { Value = "모의 · " + tile.Value, Detail = "합성 개발 값" } : tile);
        SnapshotInfo = sample is null ? "정상 조회값이 없습니다." : $"{(mock ? "모의 값" : stale ? "이전 정상값 · 현재 상태 미확인" : "마지막 조회")} · {sample.ObservedAt.ToLocalTime():yyyy-MM-dd HH:mm:ss}";
    }
    public void ReloadEnvironments() { Environments.Clear(); foreach (var item in Catalog.List()) Environments.Add(item); }
    public void SaveSettings() { settings.Save(profile); SettingsFeedback = "저장했습니다. 연결 복구를 누르거나 앱을 다시 실행하면 자동 인증합니다."; Log("settings", UserInteraction.AuditReason("settings", "이 컴퓨터의 SSH 연결 설정")); Changed(nameof(CanRecoverConnection)); }
    public async Task SetModeAsync(bool remote)
    {
        if (remote == AzureMode) return;
        await DisconnectAsync(); AzureMode = remote;
        Dashboard = remote ? "설정을 확인하고 서버 상태 조회를 누르세요." : "합성 개발 관리자 미연결";
        State = remote ? "서버 상태 미조회" : "개발 관리자 연결 안 됨";
    }
    public async Task ConnectMockAsync(OwnedSandbox? existing)
    {
        if (AzureMode) throw new ControlException("client-production-control-blocked");
        await DisconnectAsync();
        var backend = BackendLayout.Installed(AppContext.BaseDirectory);
        sandbox = existing is null ? await Catalog.CreateAsync(backend) : Catalog.Open(existing.Root);
        var transport = await NodeReviewTransport.ConnectOperationsAsync(backend, sandbox); operations = new(transport);
        try { await RefreshMockAsync(); ReloadEnvironments(); Changed(nameof(LocalRoot)); Changed(nameof(CanControl)); Log("connect-development", "기존 관리자 인증 API 연결 완료"); }
        catch { await DisconnectAsync(); throw; }
    }
    public async Task RefreshMockAsync()
    {
        if (AzureMode || operations is null) throw new ControlException("client-operations-disconnected");
        status = await operations.ReadAsync("status");
        var stats = status.Field("stats");
        Dashboard = $"모의 CPU 12.5% · RAM 1,024/4,096 MiB · 디스크 12/64 GiB · 가동 01:00:00 (합성값)\n"
            + $"개발 관리자: 연결됨 · 개발 앱: {(status.Field("appRunning").ValueKind == JsonValueKind.True ? "실행 중" : "중지")}\n"
            + $"앱 버전: {status.Field("appHost").Field("releaseId").Text()} · 터널: {status.Field("tunnel").Text()}\n"
            + $"최근 개발 관리자 오류: {status.Field("error").Text()}\n실제 systemd/HTTPS 상태는 Azure 읽기 전용 조회에서 확인합니다.";
        Ai = $"합성 사용량 · {stats.Field("day").Text()} (한국 시간 기준) · AI {(AiEnabled ? "허용" : "중지")}\n"
            + string.Join("\n", stats.Field("calls").Rows().Select(c => $"{c.Field("kind").Text()}: {c.Field("count").Number()}회 · 입력 {c.Field("inputTokens").Number()} / 출력 {c.Field("outputTokens").Number()} 토큰 · 입력 사용량 미확인 {c.Field("usageUnknown").Number()}건"))
            + "\n실제 Riot/OpenAI 호출·요금 조회 없음. 토큰 합계로 실제 금액을 추정하지 않습니다.";
        Limits.Clear(); foreach (var key in OperationsPolicy.LimitLabels.Keys) Limits.Add(new(key, stats.Field("limits").Field(key).Number()));
        Reports.Clear(); foreach (var row in (await operations.ReadAsync("reports")).Field("reports").Rows()) Reports.Add(OperationsReport.Read(row));
        AppReleases.Clear(); foreach (var row in (await operations.ReadAsync("app-releases")).Field("releases").Rows()) AppReleases.Add(row.Field("releaseId").Text());
        var knowledge = await operations.ReadAsync("knowledge"); ActiveKnowledgeId = knowledge.Field("active").Field("releaseId").Text();
        KnowledgeReleases.Clear(); foreach (var row in knowledge.Field("releases").Rows()) KnowledgeReleases.Add(row.Field("releaseId").Text());
        if (ActiveKnowledgeId.Length != 0 && !KnowledgeReleases.Contains(ActiveKnowledgeId)) KnowledgeReleases.Add(ActiveKnowledgeId);
        var running = status.Field("appRunning").ValueKind == JsonValueKind.True;
        PresentSnapshot(new RemoteSnapshot(DateTimeOffset.UtcNow, 12.5, 4194304, 3145728, 67108864, 54525952, 3600, running ? "active" : "inactive", running ? 200 : 0, 0), mock: true);
        ConnectionStatus = "개발 관리자 연결됨";
        await RefreshLogsAsync(); State = "합성 개발 관리자 상태 갱신 완료 · 운영 미연결";
    }
    public async Task SelectReportAsync(OperationsReport report)
    {
        if (AzureMode) {
            var session = remoteAdmin ?? throw new ControlException("client-admin-authentication");
            ReportDetail = "운영 제보 조회 중…";
            try {
                var detail = await session.ReadAsync("/api/reports/" + report.Id);
                if (session != remoteAdmin || !AzureMode) throw new ControlException("client-admin-disconnected");
                ReportDetail = RemoteAdminData.Detail(detail, report.Id);
            } catch (Exception e) { if (session == remoteAdmin) AdminFailure(e); throw; }
        } else if (operations is not null) ReportDetail = (await operations.ReadAsync("report", new { id = report.Id })).Pretty();
    }
    public async Task RefreshAdminAsync(CancellationToken cancellation = default)
    {
        var session = remoteAdmin ?? throw new ControlException("client-admin-authentication");
        try {
            var value = await session.ReadAsync("/api/status", cancellation); var view = RemoteAdminData.Status(value);
            if (session != remoteAdmin || !AzureMode) throw new ControlException("client-admin-disconnected");
            AdminSummary = view.Summary; Ai = view.Ai; Limits.Clear(); foreach (var pair in view.Limits) Limits.Add(new(pair.Key, pair.Value));
            AdminState = "운영 관리자 조회 완료 · 읽기 전용"; Log("admin-status", "상태/사용량 조회 완료");
        } catch (Exception e) { if (session == remoteAdmin) AdminFailure(e); throw; }
    }
    public async Task ReadAdminReportsAsync(CancellationToken cancellation = default)
    {
        var session = remoteAdmin ?? throw new ControlException("client-admin-authentication");
        Reports.Clear(); ReportDetail = "운영 제보를 선택하세요. 화면에서만 조회하며 파일로 내보내지 않습니다.";
        try {
            var rows = RemoteAdminData.Reports(await session.ReadAsync("/api/reports", cancellation));
            if (session != remoteAdmin || !AzureMode) throw new ControlException("client-admin-disconnected");
            foreach (var row in rows) Reports.Add(row);
            AdminState = $"운영 제보 {rows.Count}개 조회 (기존 API 최대 200개)"; Log("admin-reports", "목록 조회 완료");
        } catch (Exception e) { if (session == remoteAdmin) AdminFailure(e); throw; }
    }
    public void ExpireAdminIfNeeded()
    {
        if (remoteAdmin is not null && !remoteAdmin.Authenticated) { DropAdmin(); AdminState = "운영 관리자 세션 만료 · 다시 인증하세요."; }
    }
    private void AdminFailure(Exception error) { DropAdmin(); AdminState = UserErrors.Explain(error); Log("admin-read", error is ControlException c ? c.Code : "client-admin-disconnected"); }
    private void DropAdmin()
    {
        var previous = remoteAdmin; remoteAdmin = null;
        if (previous is not null) _ = DisposeAdminAsync(previous);
        if (AzureMode) { Reports.Clear(); Limits.Clear(); ReportDetail = "운영 제보 미조회"; Ai = "운영 AI 집계 미조회"; }
        AdminState = "운영 관리자 미연결"; AdminSummary = "운영 관리자 상태 미조회"; Changed(nameof(CanReadAdmin));
    }
    private static async Task DisposeAdminAsync(IRemoteAdminReader session) { try { await session.DisposeAsync(); } catch { } }

    public async Task ChangeAsync(string method, object parameters, string reason, bool confirmed)
    {
        if (AzureMode) SshCommandPolicy.DenyOperationalMutation();
        var session = operations ?? throw new ControlException("client-operations-disconnected");
        try {
            var result = await session.ChangeAsync(method, parameters, reason, confirmed);
            Log(method, method == "backup" ? "개발 백업 생성 (DB/키 포함) · 외부 반출 금지" : "개발 작업 완료");
            LastResult = result.Pretty();
            await RefreshMockAsync();
        } catch { Log(method, "완료 여부 확인 필요 · 자동 재시도하지 않음"); throw; }
    }
    public async Task QueryRemoteAsync(bool separatelyApproved, CancellationToken cancellation = default)
    {
        if (!AzureMode) throw new ControlException("client-ssh-profile");
        var expected = profile; var generation = connectionGeneration;
        query = CancellationTokenSource.CreateLinkedTokenSource(cancellation); ConnectionStatus = "SSH 조회 중…";
        PresentSnapshot(monitor.LastGood, stale: true);
        try {
            var sample = await monitor.ReadAsync(profile, separatelyApproved, query.Token);
            if (profile != expected || generation != connectionGeneration) { monitor.Reset(); throw new ControlException("client-admin-cancelled"); }
            Dashboard = sample.Display + "\n" + monitor.Diagnostic; PresentSnapshot(sample); ConnectionStatus = "SSH 연결됨"; State = "조회 완료";
            Log("ssh-status", "사용자 요청으로 읽기 전용 조회 완료");
        }
        catch (Exception error) {
            if (profile != expected || generation != connectionGeneration) throw;
            PresentSnapshot(monitor.LastGood, monitor.Stale); Dashboard = (monitor.LastGood?.Display ?? "정상 조회값 없음") + "\n" + monitor.Diagnostic;
            ConnectionStatus = "연결 확인 필요"; State = UserErrors.Explain(error); Log("ssh-status", monitor.State + " · " + monitor.Diagnostic); throw;
        }
        finally { query.Dispose(); query = null; }
    }
    public void CancelQuery() { query?.Cancel(); StopAutomaticRecovery(); }
    public void InvalidateRemote() { connectionGeneration++; StopAutomaticRecovery(); DropAdmin(); ReloadLoginChoice(); Changed(nameof(CanRecoverConnection)); monitor.Reset(); if (AzureMode) { ResetMetrics(); Dashboard = "설정이 변경되었습니다. 다시 조회해 주세요."; State = "미조회"; } }
    public async Task RefreshLogsAsync()
    { if (operations is null || AzureMode) return; Events.Clear(); foreach (var e in (await operations.ReadAsync("logs")).Field("events").Rows()) Events.Add(OperationEvent.Read(e)); }
    public void Log(string action, string outcome)
    { LocalEvents.Insert(0, $"{DateTime.Now:HH:mm:ss} · {action} · {outcome}"); while (LocalEvents.Count > 100) LocalEvents.RemoveAt(LocalEvents.Count - 1); }
    public async Task DisconnectAsync()
    {
        connectionGeneration++; CancelQuery(); DropAdmin(); if (operations is not null) await operations.DisposeAsync(); operations = null; sandbox = null;
        Reports.Clear(); Limits.Clear(); AppReleases.Clear(); KnowledgeReleases.Clear(); Events.Clear(); Ai = "실제 AI 운영 미연결";
        ReportDetail = "실제 사용자 자료 미연결"; Changed(nameof(CanControl)); Changed(nameof(LocalRoot)); State = "연결 해제 · 개발 자료 보존";
        LastResult = "연결 해제 · 이전 작업은 개발 감사 기록에서 확인하세요.";
        monitor.Reset(); ResetMetrics(); Dashboard = "연결 해제 · 현재 상태 미확인";
    }
    public async ValueTask DisposeAsync() => await DisconnectAsync();
}
