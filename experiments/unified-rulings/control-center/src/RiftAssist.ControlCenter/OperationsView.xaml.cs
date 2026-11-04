using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Media;
using System.Windows.Threading;
using Microsoft.Win32;
using RiftAssist.ControlCenter.Core;

namespace RiftAssist.ControlCenter;

public partial class OperationsView : UserControl, IAsyncDisposable
{
    public OperationsModel Model { get; }
    private bool startupHandled, automaticStartupHandled, viewDisposed;
    private readonly DispatcherTimer expiryTimer = new() { Interval = TimeSpan.FromSeconds(30) };
    public OperationsView() : this(new OperationsModel()) { }
    public OperationsView(OperationsModel model) {
        Model = model; InitializeComponent(); DataContext = Model;
        expiryTimer.Tick += async (_, _) => await RefreshAutomaticSessionIfNeededAsync();
        Loaded += (_, _) => { Model.ExpireAdminIfNeeded(); expiryTimer.Start(); };
        // Keep local session expiry checks alive across tab changes; Dispose stops the timer.
        Model.PropertyChanged += (_, e) => { if (e.PropertyName is nameof(Model.Host) or nameof(Model.User) or nameof(Model.Port) or nameof(Model.IdentityFile) or nameof(Model.KnownHostsFile) or nameof(Model.HttpsOrigin) or nameof(Model.AzureMode)) AdminKeyInput.Clear(); };
    }
    private async Task Run(string name, Func<Task> work, bool ssh = false)
    {
        if (Model.Busy) return; Model.Busy = true; OpsBody.IsEnabled = false; ModeCombo.IsEnabled = false; CancelQueryButton.IsEnabled = ssh;
        try { await work(); }
        catch (Exception error) { Model.Log(name, error is ControlException c ? c.Code : "client-local-failed"); if (Model.AzureMode) Model.State = UserErrors.Explain(error); else if (!ssh) MessageBox.Show(Window.GetWindow(this), UserErrors.Explain(error), name, MessageBoxButton.OK, MessageBoxImage.Warning); }
        finally { Model.Busy = false; OpsBody.IsEnabled = true; ModeCombo.IsEnabled = true; CancelQueryButton.IsEnabled = false; }
    }
    private async void Mode_Changed(object sender, SelectionChangedEventArgs e)
    { if (IsInitialized && !Model.Busy) { AdminKeyInput?.Clear(); await Run("대상 변경", () => Model.SetModeAsync(ModeCombo.SelectedIndex == 1)); } }
    private async void New_Click(object sender, RoutedEventArgs e) => await Run("합성 개발 관리자 준비", () => Model.ConnectMockAsync(null));
    private async void Connect_Click(object sender, RoutedEventArgs e)
    { if (EnvironmentCombo.SelectedItem is OwnedSandbox sandbox) await Run("개발 관리자 연결", () => Model.ConnectMockAsync(sandbox)); }
    private void List_Click(object sender, RoutedEventArgs e) { try { Model.ReloadEnvironments(); } catch (Exception error) { MessageBox.Show(UserErrors.Explain(error)); } }
    private async void Disconnect_Click(object sender, RoutedEventArgs e) { AdminKeyInput.Clear(); await Run("연결 해제", Model.DisconnectAsync); }
    private async void Refresh_Click(object sender, RoutedEventArgs e) => await Run("개발 상태 갱신", Model.RefreshMockAsync);
    private void Cancel_Click(object sender, RoutedEventArgs e) => Model.CancelQuery();
    private async void Query_Click(object sender, RoutedEventArgs e)
    {
        if (!ValidateSettingsInputs()) { OperationsTabs.SelectedIndex = 6; return; }
        // Manual refresh shares the fixed read-only monitor with the automatic connection workflow.
        await Run("SSH 상태 조회", () => Model.QueryRemoteAsync(true), ssh: true);
    }
    private async Task<bool> Change(string method, object parameters, string label, string? phrase = null)
    {
        if (!Model.CanControl) return false;
        var target = Model.OperationTarget;
        var fields = ProtocolJson.Element(parameters);
        foreach (var name in new[] { "id", "status", "releaseId" })
            if (fields.Field(name).Text() is { Length: > 0 } value) target += " / " + value;
        var reason = UserInteraction.AuditReason(method, target);
        if (UserInteraction.ConfirmationFor(method) == ConfirmationKind.Protected)
        {
            var detail = method == "backup" ? "개발 DB와 복호화 키를 함께 백업합니다. 개발 폴더 밖으로 공유하지 마세요." : "선택한 개발 버전을 변경합니다. 대상과 복귀 기준을 확인하세요.";
            var dialog = new ReviewDialog(Window.GetWindow(this), label, target + "\n\n" + detail, true, phrase, reason);
            if (dialog.ShowDialog() != true) return false;
        }
        else if (!ActionConfirmation.Confirm(Window.GetWindow(this), label, target, AdminChangeContract.Actions.Contains(method) ? AdminChangeContract.Plan(method, parameters).Impact : "")) return false;
        var saved = false;
        await Run(label, async () => { await Model.ChangeAsync(method, parameters, reason, true); saved = true; });
        return saved;
    }
    private async void Server_Click(object sender, RoutedEventArgs e)
    { var method = (string)((Button)sender).Tag; await Change(method, new { }, "합성 관리자 앱 " + method); }
    private async void Ai_Click(object sender, RoutedEventArgs e) => await Change("ai", new { enabled = !Model.AiEnabled }, "개발 AI 허용 상태 변경");
    private async void Limits_Click(object sender, RoutedEventArgs e)
    {
        if (!LimitsGrid.CommitEdit(DataGridEditingUnit.Cell, true) || !LimitsGrid.CommitEdit(DataGridEditingUnit.Row, true)) return;
        var limits = Model.Limits.ToDictionary(row => row.Name, row => row.Value);
        try { OperationsPolicy.ValidateLimits(limits); } catch (Exception error) { MessageBox.Show(UserErrors.Explain(error)); return; }
        await Change("limits", new { limits }, "개발 호출 한도 저장");
    }
    private async void Hosting_Click(object sender, RoutedEventArgs e) => await Change("hosting", new { provider = "none" }, "개발 공개 연결 없음 저장");
    private async void Backup_Click(object sender, RoutedEventArgs e) => await Change("backup", new { }, "개발 DB/키 백업", "개발 백업");
    private async void AppRelease_Click(object sender, RoutedEventArgs e)
    { if (AppReleaseCombo.SelectedItem is string id) await Change("app-release", new { releaseId = id }, "개발 앱 버전 적용: " + id, "개발 앱 버전 적용"); }
    private async void Discover_Click(object sender, RoutedEventArgs e) => await Change("knowledge-discover", new { }, "기존 재수집 API 차단 확인 (v0.2.0 정책상 거절 · 수집 접수로 표시하지 않음)");
    private async void Knowledge_Click(object sender, RoutedEventArgs e)
    { if (KnowledgeCombo.SelectedItem is string id) await Change("knowledge-activate", new { releaseId = id, expectedId = Model.ActiveKnowledgeId, reviewed = true }, "개발 knowledge 버전 적용 (기존 카드 승인 경계 유지)", "개발 자료 활성화"); }
    private async void AdminConnect_Click(object sender, RoutedEventArgs e)
    {
        if (!ValidateSettingsInputs()) { AdminKeyInput.Clear(); OperationsTabs.SelectedIndex = 6; return; }
        var key = AdminKeyInput.Password; AdminKeyInput.Clear();
        await Run("운영 관리자 인증", async () => { try { if (key.Length == 0 && Model.HasSavedLogin) await Model.ConnectSavedAdminAsync(); else await Model.ConnectAdminAsync(key); } finally { key = ""; } });
    }
    public async Task RefreshAutomaticSessionIfNeededAsync()
    {
        if (viewDisposed) return;
        if (Model.AutomaticRecoveryDue) await Run("관리자 세션 재인증", Model.ConnectAutomaticallyAsync, ssh: true);
        else Model.ExpireAdminIfNeeded();
    }
    public async Task TryAutomaticStartupAsync()
    {
        if (automaticStartupHandled) return; automaticStartupHandled = true;
        if (!Model.HasSavedSshSettings) return;
        // An unselected WPF tab may not raise Loaded until first opened.
        expiryTimer.Start();
        await Run("SSH 읽기 전용 자동 연결", async () => { await Model.SetModeAsync(true); ModeCombo.SelectedIndex = 1; await Model.ConnectAutomaticallyAsync(); }, ssh: true);
    }
    private async void RecoverConnection_Click(object sender, RoutedEventArgs e)
    { await Run("연결 복구", async () => { await Model.SetModeAsync(true); ModeCombo.SelectedIndex = 1; await Model.ConnectAutomaticallyAsync(); }, ssh: true); }
    public async Task TryStartupAdminAsync()
    {
        if (startupHandled) return; startupHandled = true;
        if (!Model.StartupAutoRequested) return;
        await Run("읽기 전용 관리자 자동 연결", async () => { await Model.SetModeAsync(true); ModeCombo.SelectedIndex = 1; await Model.ConnectSavedAdminAsync(startup: true); });
    }
    private async void SavedAdminConnect_Click(object sender, RoutedEventArgs e)
    { AdminKeyInput.Clear(); await Run("저장된 관리자 인증", () => Model.ConnectSavedAdminAsync()); }
    private async void ForgetSavedAdmin_Click(object sender, RoutedEventArgs e)
    { AdminKeyInput.Clear(); await Run("저장된 로그인 삭제", () => { Model.ForgetSavedLogin(); return Task.CompletedTask; }); }
    private async void AdminRefresh_Click(object sender, RoutedEventArgs e) => await Run("운영 상태 조회", () => Model.RefreshAdminAsync());
    private async void AdminReports_Click(object sender, RoutedEventArgs e) => await Run("운영 제보 목록", () => Model.ReadAdminReportsAsync());
    private async void Report_Changed(object sender, SelectionChangedEventArgs e)
    { if (!Model.Busy && ReportsGrid.SelectedItem is OperationsReport report) await Run("제보 상세", async () => { await Model.SelectReportAsync(report); ReportState.SelectedItem = report.Status; }); }
    private void ReportFilter_Changed(object sender, TextChangedEventArgs e)
    {
        if (ReportFilter is null) return; var filter = ReportFilter.Text;
        CollectionViewSource.GetDefaultView(Model.Reports).Filter = value => value is OperationsReport report && (filter.Length == 0 || $"{report.Id} {report.Category} {report.Status} {report.Source} {report.Title}".Contains(filter, StringComparison.OrdinalIgnoreCase));
    }
    private async void ReportUpdate_Click(object sender, RoutedEventArgs e)
    { if (ReportsGrid.SelectedItem is OperationsReport report && report.Source != "수동 · 로컬" && ReportState.SelectedItem is string state && await Change("update-report", new { id = report.Id, status = state, note = ReportNote.Text }, "개발 제보 처리 저장")) ReportNote.Clear(); }
    private async void AnalyzeIncident_Click(object sender, RoutedEventArgs e)
    {
        if (ReportsGrid.SelectedItem is not OperationsReport report) return;
        await Run("제보 분석 준비", async () => {
            var input = await Model.ReadIncidentInputAsync(report); var backend = BackendLayout.Installed(AppContext.BaseDirectory);
            new IncidentAnalysisWindow(Window.GetWindow(this), input, () => Model.ReadIncidentInputAsync(report), AnalysisLedger.Local(), new OfflineIncidentAnalyzer(backend), new MockRepairWorker(backend)).Show();
        });
    }
    private async void RealCodex_Click(object sender,RoutedEventArgs e)
    {
        if(ReportsGrid.SelectedItem is not OperationsReport report)return;
        await Run("실제 Codex 작업 준비",async()=>{var input=await Model.ReadIncidentInputAsync(report);new RealRepairWindow(Window.GetWindow(this),input,()=>Model.ReadIncidentInputAsync(report)).Show();});
    }
    private void NewManualReport_Click(object sender, RoutedEventArgs e) => EditManual(null);
    private void EditManualReport_Click(object sender, RoutedEventArgs e)
    { try { if (ReportsGrid.SelectedItem is OperationsReport { Source: "수동 · 로컬" } report) EditManual(Model.ReadManualReport(report)); } catch (Exception error) { MessageBox.Show(Window.GetWindow(this), UserErrors.Explain(error), "수동 제보"); } }
    private void EditManual(ManualReportDocument? old)
    {
        try { var dialog = new ManualReportEditor(Window.GetWindow(this), old?.Draft ?? new ManualReportDraft());
            if (dialog.ShowDialog() == true) Model.SaveManualReport(dialog.Draft, old?.Id, old?.Revision);
        } catch (Exception error) { MessageBox.Show(Window.GetWindow(this), UserErrors.Explain(error), "수동 제보"); }
    }
    private void ManualReports_Click(object sender, RoutedEventArgs e)
    { try { Model.ReloadManualReports(); } catch (Exception error) { Model.State = UserErrors.Explain(error); } }
    private async void Export_Click(object sender, RoutedEventArgs e)
    {
        if (ReportsGrid.SelectedItem is not OperationsReport report || report.Source == "수동 · 로컬" || !Model.CanControl) return;
        var dialog = new SaveFileDialog { Title = "합성 제보 내보내기 (실제 사용자 자료 없음)", FileName = "RiftAssist-synthetic-report-" + report.Id + ".json", Filter = "JSON|*.json", OverwritePrompt = true };
        if (dialog.ShowDialog(Window.GetWindow(this)) != true) return;
        await Run("합성 제보 내보내기", async () => { await Model.SelectReportAsync(report); await File.WriteAllTextAsync(dialog.FileName, Model.ReportDetail, ProtocolJson.Utf8); Model.Log("export-synthetic-report", "선택 파일에 저장"); });
    }
    private async void Logs_Click(object sender, RoutedEventArgs e) => await Run("개발 로그 조회", Model.RefreshLogsAsync);
    private void OpenSettings_Click(object sender, RoutedEventArgs e) => OperationsTabs.SelectedIndex = 6;
    private void Browse_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new OpenFileDialog { Title = "기존 SSH 파일 경로만 선택 (파일 내용 복사/저장 안 함)", CheckFileExists = true };
        if (dialog.ShowDialog(Window.GetWindow(this)) != true) return;
        if ((string)((Button)sender).Tag == "identity") Model.IdentityFile = dialog.FileName; else Model.KnownHostsFile = dialog.FileName;
    }
    public static bool HasInvalidInput(DependencyObject root)
    {
        if (Validation.GetHasError(root)) return true;
        for (var i = 0; i < VisualTreeHelper.GetChildrenCount(root); i++)
            if (HasInvalidInput(VisualTreeHelper.GetChild(root, i))) return true;
        return false;
    }
    private bool ValidateSettingsInputs()
    {
        if (HasInvalidInput(SettingsForm)) { Model.SettingsFeedback = "포트 등 입력값을 확인하세요. SSH 포트는 1–65,535의 정수입니다."; return false; }
        try { Model.ValidateSettings(); return true; }
        catch (Exception error) { Model.SettingsFeedback = UserErrors.Explain(error); return false; }
    }
    private void SaveSettings_Click(object sender, RoutedEventArgs e)
    {
        if (!ValidateSettingsInputs() || !ActionConfirmation.Confirm(Window.GetWindow(this), "SSH 연결 설정 저장", "이 컴퓨터의 연결 설정")) return;
        try { Model.SaveSettings(); } catch (Exception error) { Model.SettingsFeedback = UserErrors.Explain(error); }
    }
    private void ReloadSettings_Click(object sender, RoutedEventArgs e)
    { try { Model.LoadSettings(); } catch (Exception error) { Model.SettingsFeedback = UserErrors.Explain(error); } }
    public async ValueTask DisposeAsync() { viewDisposed = true; expiryTimer.Stop(); AdminKeyInput.Clear(); await Model.DisposeAsync(); }
}
