using System.Collections.ObjectModel;
using System.ComponentModel;
using System.Runtime.CompilerServices;
using RiftAssist.ControlCenter.Core;

namespace RiftAssist.ControlCenter;

public sealed class DesktopModel : INotifyPropertyChanged, IAsyncDisposable
{
    private string status = "로컬 합성자료 전용 · 연결되지 않음";
    private string location = "앱이 만든 개발 환경만 열 수 있습니다.";
    private bool busy;
    private NodeReviewTransport? transport;
    public ReviewCoordinator? Review { get; private set; }
    public OwnedSandbox? Sandbox { get; private set; }
    public SandboxCatalog Catalog { get; } = SandboxCatalog.Local();
    public ObservableCollection<OwnedSandbox> Sandboxes { get; } = [];
    public ObservableCollection<BundleSummary> Bundles { get; } = [];
    public ObservableCollection<ReviewItem> Items { get; } = [];
    public ObservableCollection<ReviewPackage> Packages { get; } = [];
    public ObservableCollection<PendingIntent> PendingIntents { get; } = [];
    public ObservableCollection<AuditRow> AuditRows { get; } = [];
    public ObservableCollection<string> Results { get; } = [];
    public IReadOnlyList<FeatureModule> Modules => FeatureCatalog.Modules;
    public string Status { get => status; set { status = value; Changed(); } }
    public string Location { get => location; set { location = value; Changed(); } }
    public bool Busy { get => busy; set { busy = value; Changed(); } }
    public bool Connected => Review?.Connected == true;
    public int AuditOffset { get; set; }
    public int AuditTotal { get; private set; }
    public event PropertyChangedEventHandler? PropertyChanged;
    private void Changed([CallerMemberName] string? name = null) => PropertyChanged?.Invoke(this, new PropertyChangedEventArgs(name));
    public void ReloadSandboxes() { Sandboxes.Clear(); foreach (var item in Catalog.List()) Sandboxes.Add(item); }
    private static BackendLayout Backend() => BackendLayout.Installed(AppContext.BaseDirectory);
    public async Task<string> CreateAsync(bool allowFinal)
    {
        var backend = Backend(); var sandbox = await Catalog.CreateAsync(backend); var receipt = await Catalog.SeedAsync(backend, sandbox);
        await ConnectAsync(sandbox, allowFinal);
        var registered = await Review!.RegisterAsync(receipt.Field("candidateId").Text(), receipt.Field("knowledgeReleaseId").Text());
        Log("합성 후보 등록", "성공"); ReloadSandboxes(); await RefreshBundlesAsync(); return registered.Field("bundleId").Text();
    }
    public async Task ConnectAsync(OwnedSandbox sandbox, bool allowFinal)
    {
        Catalog.Open(sandbox.Root); await DisconnectAsync();
        transport = await NodeReviewTransport.ConnectAsync(Backend(), sandbox, allowFinal); Review = new ReviewCoordinator(transport); Sandbox = sandbox;
        Location = sandbox.Root; Status = allowFinal ? "합성자료 연결 · 로컬 최종 승인 권한 있음" : "합성자료 연결 · 검토/승인본 구성 권한";
        await RefreshBundlesAsync(); Changed(nameof(Connected));
    }
    public async Task RefreshBundlesAsync()
    { Bundles.Clear(); if (Review is not null) foreach (var item in await Review.ListAsync()) Bundles.Add(item); }
    public async Task LoadAsync(string bundleId, int offset = 0)
    {
        if (Review is null) return;
        var snapshot = await Review.LoadAsync(bundleId, offset); Show(snapshot);
        Status = $"{snapshot.Status} · 검토 버전 {snapshot.Revision} · {offset + 1}–{Math.Min(offset + snapshot.Items.Count, snapshot.Total)}/{snapshot.Total}"
            + (snapshot.StaleReason.Length == 0 ? "" : $" · {snapshot.StaleReason}");
    }
    public void Show(ReviewSnapshot snapshot)
    {
        Items.Clear(); foreach (var item in snapshot.Items) Items.Add(item);
        Packages.Clear(); foreach (var item in snapshot.Packages) Packages.Add(item);
        PendingIntents.Clear(); foreach (var item in snapshot.PendingIntents) PendingIntents.Add(item);
    }
    public async Task RefreshAuditAsync(int offset)
    {
        if (Review is null) return;
        var result = await Review.AuditAsync(offset); AuditOffset = offset; AuditTotal = result.Total;
        AuditRows.Clear(); foreach (var row in result.Rows) AuditRows.Add(row);
    }
    public void Log(string method, string outcome)
    {
        Results.Insert(0, $"{DateTime.Now:HH:mm:ss} · {method} · {outcome} · 요청 {transport?.LastRequestId ?? "—"}");
        while (Results.Count > 100) Results.RemoveAt(Results.Count - 1);
    }
    public async Task DisconnectAsync()
    {
        if (transport is not null) await transport.DisposeAsync(); transport = null; Review = null; Sandbox = null;
        Bundles.Clear(); Items.Clear(); Packages.Clear(); PendingIntents.Clear(); AuditRows.Clear(); Status = "연결되지 않음"; Changed(nameof(Connected));
    }
    public async ValueTask DisposeAsync() => await DisconnectAsync();
}

public static class UserErrors
{
    public static string Explain(Exception error)
    {
        var code = error is ControlException control ? control.Code : "client-local-failed";
        var message = code switch {
            "client-node-missing" or "client-runtime-integrity" => "Node.js 실행 파일이 포함된 패키지가 필요합니다. 배포 안내의 Publish-Windows.ps1을 실행해 주세요.",
            "client-backend-integrity" => "백엔드 파일 해시가 다릅니다. 검증된 소스로 다시 빌드해 주세요.",
            "client-result-uncertain" => "작업 결과를 확인하지 못했습니다. 같은 쓰기를 자동 재시도하지 마세요. 재연결 후 버전·감사 기록을 확인해 주세요.",
            "review-audit-unavailable" or "review-recovery-required" => "감사 기록/잠금과 미완료 작업 점검이 필요합니다. 운영자 안내를 확인하고 임의로 자료를 지우지 마세요.",
            "review-stale" or "review-version-conflict" or "client-refresh-required" or "client-selection-stale" => "후보 또는 검토 버전이 바뀌었습니다. 새로고침 후 다시 비교해 주세요.",
            "client-warnings-required" => "차단 오류를 해결하고 선택 항목의 경고를 확인해야 승인할 수 있습니다.",
            "client-selection" => "현재 페이지에서 1–50개 항목을 선택해 주세요.",
            "client-reason-required" => "1,000자 이하의 비어 있지 않은 사유가 필요합니다.",
            "review-data-prerequisite" => "번역 대상 카드의 데이터 항목도 승인해야 합니다.",
            "client-final-denied" or "review-forbidden" => "해당 작업의 권한 또는 유효한 승인본이 없습니다.",
            _ => "요청을 완료하지 못했습니다. 작업 결과와 안내 문서를 확인해 주세요." };
        return $"{message}\n\n코드: {code}";
    }
}
