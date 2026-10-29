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
public sealed class OperationsModel : INotifyPropertyChanged, IAsyncDisposable
{
    private bool busy, azureMode;
    private string state = "개발 관리자 연결 안 됨 · 운영 변경 차단";
    private string dashboard = "모의/개발 환경을 명시적으로 준비하면 상태를 표시합니다. 실제 서버에 자동 연결하지 않습니다.";
    private string ai = "실제 API 비용/사용량 미연결";
    private string reportDetail = "제보를 선택하세요. 실제 사용자 자료는 연결하지 않습니다.";
    private string lastResult = "개발 제어 작업 결과 없음";
    private SshProfile profile;
    private readonly SshProfileStore settings = SshProfileStore.Local();
    private readonly RemoteMonitor monitor = new(new WindowsOpenSshRunner());
    private DevelopmentOperations? operations;
    private OwnedSandbox? sandbox;
    private JsonElement status;
    private CancellationTokenSource? query;
    public SandboxCatalog Catalog { get; } = new(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "RiftAssist", "ControlCenter", "OperationsSandboxes"));
    public ObservableCollection<OwnedSandbox> Environments { get; } = [];
    public ObservableCollection<LimitRow> Limits { get; } = [];
    public ObservableCollection<OperationsReport> Reports { get; } = [];
    public ObservableCollection<OperationEvent> Events { get; } = [];
    public ObservableCollection<string> LocalEvents { get; } = [];
    public ObservableCollection<string> AppReleases { get; } = [];
    public ObservableCollection<string> KnowledgeReleases { get; } = [];
    public IReadOnlyList<string> ReportStates => OperationsPolicy.ReportStates;
    public bool AzureMode { get => azureMode; private set { azureMode = value; Changed(); Changed(nameof(CanControl)); Changed(nameof(CanPrepareDevelopment)); Changed(nameof(TargetLabel)); } }
    public string TargetLabel => AzureMode ? "Azure · SSH 읽기 전용 · 실제 제어/관리자 데이터 미연결" : "합성 개발 관리자 · 운영 서버와 별개";
    public bool CanControl => !Busy && !AzureMode && operations?.Connected == true;
    public bool CanPrepareDevelopment => !Busy && !AzureMode;
    public bool Busy { get => busy; set { busy = value; Changed(); Changed(nameof(CanControl)); Changed(nameof(CanPrepareDevelopment)); } }
    public bool AiEnabled => status.Field("stats").Field("aiEnabled").ValueKind == JsonValueKind.True;
    public string State { get => state; set { state = value; Changed(); } }
    public string Dashboard { get => dashboard; private set { dashboard = value; Changed(); } }
    public string Ai { get => ai; private set { ai = value; Changed(); } }
    public string ReportDetail { get => reportDetail; set { reportDetail = value; Changed(); } }
    public string LastResult { get => lastResult; private set { lastResult = value; Changed(); } }
    public string LocalRoot => sandbox?.Root ?? "개발 관리자 데이터 위치: 미연결";
    public string ActiveKnowledgeId { get; private set; } = "";
    public string Host { get => profile.Host; set { profile = profile with { Host = value }; Changed(); } }
    public string User { get => profile.User; set { profile = profile with { User = value }; Changed(); } }
    public int Port { get => profile.Port; set { profile = profile with { Port = value }; Changed(); } }
    public string IdentityFile { get => profile.IdentityFile; set { profile = profile with { IdentityFile = value }; Changed(); } }
    public string KnownHostsFile { get => profile.KnownHostsFile; set { profile = profile with { KnownHostsFile = value }; Changed(); } }
    public string HttpsOrigin { get => profile.HttpsOrigin; set { profile = profile with { HttpsOrigin = value }; Changed(); } }
    public event PropertyChangedEventHandler? PropertyChanged;
    private void Changed([CallerMemberName] string? name = null) => PropertyChanged?.Invoke(this, new(name));
    public OperationsModel()
    {
        profile = new SshProfile();
        try { profile = settings.Load(); ReloadEnvironments(); }
        catch { State = "로컬 설정/개발 환경 목록 점검 필요 · 자동 연결하지 않음"; }
    }
    public void ReloadEnvironments() { Environments.Clear(); foreach (var item in Catalog.List()) Environments.Add(item); }
    public void SaveSettings() { settings.Save(profile); Log("settings", "경로/접속 메타데이터만 저장 · 자동 연결 안 함"); }
    public async Task SetModeAsync(bool remote)
    {
        if (remote == AzureMode) return;
        await DisconnectAsync(); AzureMode = remote;
        Dashboard = remote ? "Azure 미연결 · 별도 승인과 수동 조회가 필요합니다." : "합성 개발 관리자 미연결";
        State = remote ? "운영 제어·실제 제보/AI 설정 조회 차단" : "개발 관리자 연결 안 됨";
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
            + $"최근 개발 관리자 오류: {status.Field("error").Text()}\n실제 systemd/HTTPS 상태는 Azure 수동 조회에서만 확인합니다.";
        Ai = $"합성 사용량 · {stats.Field("day").Text()} (한국 시간 기준) · AI {(AiEnabled ? "허용" : "중지")}\n"
            + string.Join("\n", stats.Field("calls").Rows().Select(c => $"{c.Field("kind").Text()}: {c.Field("count").Number()}회 · 입력 {c.Field("inputTokens").Number()} / 출력 {c.Field("outputTokens").Number()} 토큰 · 입력 사용량 미확인 {c.Field("usageUnknown").Number()}건"))
            + "\n실제 Riot/OpenAI 호출·요금 조회 없음. 토큰 합계로 실제 금액을 추정하지 않습니다.";
        Limits.Clear(); foreach (var key in OperationsPolicy.LimitLabels.Keys) Limits.Add(new(key, stats.Field("limits").Field(key).Number()));
        Reports.Clear(); foreach (var row in (await operations.ReadAsync("reports")).Field("reports").Rows()) Reports.Add(OperationsReport.Read(row));
        AppReleases.Clear(); foreach (var row in (await operations.ReadAsync("app-releases")).Field("releases").Rows()) AppReleases.Add(row.Field("releaseId").Text());
        var knowledge = await operations.ReadAsync("knowledge"); ActiveKnowledgeId = knowledge.Field("active").Field("releaseId").Text();
        KnowledgeReleases.Clear(); foreach (var row in knowledge.Field("releases").Rows()) KnowledgeReleases.Add(row.Field("releaseId").Text());
        if (ActiveKnowledgeId.Length != 0 && !KnowledgeReleases.Contains(ActiveKnowledgeId)) KnowledgeReleases.Add(ActiveKnowledgeId);
        await RefreshLogsAsync(); State = "합성 개발 관리자 상태 갱신 완료 · 운영 미연결";
    }
    public async Task SelectReportAsync(OperationsReport report)
    { if (operations is not null && !AzureMode) ReportDetail = (await operations.ReadAsync("report", new { id = report.Id })).Pretty(); }
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
    public async Task QueryRemoteAsync(bool separatelyApproved)
    {
        if (!AzureMode) throw new ControlException("client-ssh-profile");
        query = new CancellationTokenSource();
        try { var sample = await monitor.ReadAsync(profile, separatelyApproved, query.Token); Dashboard = sample.Display; State = monitor.State; Log("ssh-status", "고정 읽기 전용 상태 조회 완료"); }
        catch { Dashboard = (monitor.LastGood?.Display ?? "정상 조회값 없음") + (monitor.Stale ? "\n이전 정상값 · 현재 연결/상태를 보장하지 않음" : ""); State = monitor.State; Log("ssh-status", monitor.State); throw; }
        finally { query.Dispose(); query = null; }
    }
    public void CancelQuery() => query?.Cancel();
    public void InvalidateRemote() { monitor.Reset(); if (AzureMode) { Dashboard = "접속 설정 변경 · 재조회 전 상태 미확인"; State = "별도 승인/수동 조회 필요"; } }
    public async Task RefreshLogsAsync()
    { if (operations is null || AzureMode) return; Events.Clear(); foreach (var e in (await operations.ReadAsync("logs")).Field("events").Rows()) Events.Add(OperationEvent.Read(e)); }
    public void Log(string action, string outcome)
    { LocalEvents.Insert(0, $"{DateTime.Now:HH:mm:ss} · {action} · {outcome}"); while (LocalEvents.Count > 100) LocalEvents.RemoveAt(LocalEvents.Count - 1); }
    public async Task DisconnectAsync()
    {
        CancelQuery(); if (operations is not null) await operations.DisposeAsync(); operations = null; sandbox = null;
        Reports.Clear(); Limits.Clear(); AppReleases.Clear(); KnowledgeReleases.Clear(); Events.Clear(); Ai = "실제 AI 운영 미연결";
        ReportDetail = "실제 사용자 자료 미연결"; Changed(nameof(CanControl)); Changed(nameof(LocalRoot)); State = "연결 해제 · 개발 자료 보존";
        LastResult = "연결 해제 · 이전 작업은 개발 감사 기록에서 확인하세요.";
        if (AzureMode) { monitor.Reset(); Dashboard = "Azure 연결 해제 · 현재 서버 상태 미확인"; }
    }
    public async ValueTask DisposeAsync() => await DisconnectAsync();
}
