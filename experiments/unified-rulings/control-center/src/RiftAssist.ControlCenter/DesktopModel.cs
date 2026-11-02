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
            "client-manual-validation" => "수동 제보 제목·오류 내용·분류·상태와 입력 길이를 확인하세요.",
            "client-manual-protection" => "로컬 제보를 안전하게 읽거나 암호화 저장하지 못했습니다. 기존 파일을 덮어쓰지 말고 Windows 계정·권한을 확인하세요.",
            "client-manual-conflict" => "다른 창/프로그램이 제보를 먼저 수정했습니다. 목록을 새로 읽은 뒤 변경을 다시 확인하세요.",
            "client-manual-busy" => "다른 로컬 저장 작업이 진행 중입니다. 완료 후 다시 시도하세요.",
            "client-manual-limit" => "로컬 제보 개수·크기·수정 이력 제한에 도달했습니다. 기존 자료를 보존하고 별도 관리가 필요합니다.",
            "client-admin-plan" => "기존 관리자 API가 지원하는 작업/입력 형식이 아닙니다.",
            "client-admin-change-refresh" => "변경 전 현재 관리자 상태를 먼저 새로고침하세요. 실패한 요청은 자동 재전송하지 않습니다.",
            "client-admin-change-busy" => "관리자 변경 확인이 진행 중입니다. 중복 요청을 보내지 않습니다.",
            "client-admin-change-uncertain" => "변경 결과가 확정되지 않았습니다. 자동 재전송하지 말고 상태 새로고침과 감사 기록을 먼저 확인하세요.",

            "client-automatic-settings" => "저장된 SSH 연결 설정이 필요합니다. 주소·계정·known_hosts·키 경로·HTTPS 주소를 확인하고 저장하세요.",
            "client-manager-key-missing" => "서버의 지정 관리자 키 파일이 없거나 경로에 접근할 수 없습니다. 앱은 파일을 만들지 않습니다.",
            "client-manager-key-permission" => "SSH 계정에 지정 관리자 키 파일의 읽기 권한이 없습니다. 권한을 자동 변경하지 않습니다.",
            "client-manager-key-file" => "지정 관리자 키가 일반 파일이 아닙니다. 링크/다른 파일로 우회하지 않습니다.",
            "client-manager-key-format" => "서버 관리자 키가 64자리 16진수 형식과 일치하지 않습니다. 키 원문은 표시하지 않습니다.",
            "client-manager-key-timeout" => "SSH 관리자 키 조회 시간이 초과됐습니다. 제한된 재시도 후 연결 복구를 사용할 수 있습니다.",
            "client-manager-key-read" => "지정 관리자 키를 안전하게 읽지 못했습니다. 파일·SSH 상태를 별도로 확인하세요.",
            "client-credential-missing" => "저장된 로그인 정보가 없습니다. 새 관리자 키를 입력하세요. 자동 연결은 꺼졌습니다.",
            "client-credential-save" => "로그인 정보를 안전하게 저장하지 못했습니다. 자동 연결은 사용하지 않습니다. Windows 사용자 폴더 권한을 확인하세요.",
            "client-credential-protection" => "저장된 로그인 정보를 복호화하거나 저장/삭제하지 못했습니다. Windows 계정과 파일 권한을 확인하고 필요하면 새 키를 입력하세요.",
            "client-credential-settings" => "로그인 옵션을 확인하지 못했습니다. 자동 연결을 실행하지 않습니다.",
            "client-credential-windows-only" => "로그인 정보의 안전한 저장은 Windows 사용자 범위 DPAPI에서 지원합니다.",
            "client-admin-authentication" => "운영 관리자 인증이 필요하거나 실패했습니다. 기존 관리자 키와 세션 만료를 확인하세요. 키는 저장하지 않습니다.",
            "client-admin-forward-denied" => "SSH 서버가 loopback 관리자 연결을 허용하지 않습니다. 서버 설정을 임의로 바꾸지 말고 별도 승인을 받으세요.",
            "client-admin-forward-failed" => "SSH의 관리자 연결에 실패했습니다. 서버의 forwarding 허용 여부와 loopback 3100 상태를 별도로 확인하세요. 설정을 자동 변경하지 않습니다.",
            "client-admin-unavailable" => "서버의 loopback 3100 관리자에 연결하지 못했습니다. 기존 관리자 실행 여부를 별도로 확인해야 합니다.",
            "client-admin-http" => "운영 관리자 API가 조회를 완료하지 못했습니다. 서버 오류 원문은 보호합니다.",
            "client-admin-not-found" => "운영 관리자 API 또는 선택한 제보를 찾지 못했습니다. 보관 기간과 실제 API 구성을 확인하세요.",
            "client-admin-response" => "운영 관리자 응답 형식이나 크기를 검증하지 못했습니다. 화면의 민감 자료를 지웠습니다.",
            "client-admin-timeout" => "운영 관리자 응답 시간이 초과됐습니다. 자동 재시도하지 않으며 다시 인증해야 합니다.",
            "client-admin-cancelled" => "운영 관리자 조회를 취소했습니다.",
            "client-admin-disconnected" => "운영 관리자 연결이 끊겼습니다. 화면의 자료와 인증 세션을 지웠습니다. SSH와 기존 관리자 상태를 확인하세요.",
            "client-ssh-profile" => "SSH 주소·사용자·포트·known_hosts·HTTPS origin과 경로 형식을 확인하세요. 키 내용은 입력하지 마세요.",
            "client-ssh-approval-required" => "실제 접속은 별도 승인 후 수동으로만 실행할 수 있습니다.",
            "client-ssh-missing" or "client-ssh-windows-only" => "Windows OpenSSH Client가 필요합니다. Windows 선택적 기능에서 설치 상태를 확인하세요.",
            "client-ssh-file-missing" => "선택한 known_hosts 또는 개인키 경로를 확인하세요. 앱은 키를 복사하거나 호스트 키를 자동 등록하지 않습니다.",
            "client-ssh-host-key-changed" or "client-ssh-host-key-unverified" => "SSH 호스트 키를 검증하지 못했습니다. 신뢰한 별도 경로로 fingerprint를 확인하세요. 검증을 끄거나 기존 키를 임의로 지우지 마세요.",
            "client-ssh-authentication" => "SSH 인증에 실패했습니다. Windows 계정·개인키 경로와 ssh-agent의 잠금 해제 상태를 운영자가 확인해야 합니다.",
            "client-ssh-timeout" => "서버 응답이 지연됐습니다. 네트워크와 SSH 포트를 확인한 뒤 다시 조회하세요.",
            "client-ssh-cancelled" => "조회가 취소됐습니다. 표시된 이전 값은 현재 상태를 보장하지 않습니다.",
            "client-ssh-disconnected" => "SSH 세션을 확인하지 못했습니다. 주소·포트와 접속 조건을 PowerShell 명령과 비교하세요.",
            "client-ssh-session-lost" => "SSH 연결 후 조회 도중 세션이 종료됐습니다. 네트워크 또는 서버의 세션 제한을 확인하세요.",
            "client-ssh-remote-command" => "SSH 실행 후 원격 상태 조회 명령이 실패했습니다. 서버의 sh 셸·실행 권한·조회 명령 호환성을 확인하세요.",
            "client-ssh-remote-tools" => "SSH 연결은 확인됐지만 서버의 필수 조회 도구 또는 /proc 자료를 읽지 못했습니다. 조회 상세의 점검 항목을 확인하세요.",
            "client-ssh-input-incomplete" => "SSH 프로세스가 상태 조회 스크립트를 모두 받기 전에 입력을 닫았습니다. 세션과 원격 sh 실행 정책을 확인하세요.",
            "client-ssh-configuration" => "Windows OpenSSH가 실행 옵션을 거절했습니다. 설치된 OpenSSH 버전을 확인하세요.",
            "client-ssh-dns" => "SSH 서버 이름을 찾지 못했습니다. 서버 주소와 DNS를 확인하세요.",
            "client-ssh-refused" => "서버가 SSH 접속을 거절했습니다. 주소·포트와 SSH 서비스 상태를 확인하세요.",
            "client-ssh-environment" => "Windows의 ProgramData 기본 경로를 확인하지 못했습니다. Windows 계정 환경과 프로그램 실행 정책을 확인하세요.",
            "client-ssh-start" => "Windows ssh.exe를 시작하지 못했습니다. OpenSSH 설치와 회사 PC의 프로그램 실행 정책을 확인하세요.",
            "client-ssh-pipe-failed" => "로컬 ssh.exe의 표준 입출력 처리에 실패했습니다. 서버 연결 실패와 구분되는 로컬 실행 오류입니다.",
            "client-ssh-local-failed" => "로컬 SSH 조회 처리 중 예상하지 못한 오류가 발생했습니다. 서버가 중단됐다는 의미는 아닙니다.",
            "client-ssh-response-invalid" => "SSH 조회 결과를 해석하지 못했습니다. 서버 출력 형식·문자 인코딩·로그인 배너를 확인하세요.",
            "client-ssh-response-limit" => "SSH 조회 출력이 허용 크기를 초과했습니다. 서버의 배너 또는 조회 명령 출력을 확인하세요.",
            "client-production-control-blocked" => "Azure 운영 변경과 실제 관리자 데이터 접근은 이 버전에서 차단됩니다.",
            "client-operations-disconnected" => "먼저 합성 개발 관리자에 연결하세요. 운영 관리자 연결은 구현하지 않았습니다.",
            "client-operations-limits" => "한도 8개를 모두 입력하세요. 동시 호출은 1–3, 나머지는 1–1,000의 정수입니다.",
            "review-operations-result-uncertain" => "개발 작업의 완료 여부가 불명확합니다. 상태·작업 기록을 확인하고 자동 재시도하거나 감사 기록을 지우지 마세요.",
            "review-operations-request-rejected" => "기존 개발 관리자 API가 요청을 거절했습니다. 앱 실행 상태·선행 조건·검토 경계를 확인하세요.",
            "review-operations-authentication" => "개발 관리자 세션 인증이 필요합니다. 운영 키를 입력하지 말고 해당 합성 환경에 다시 연결하세요.",
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
