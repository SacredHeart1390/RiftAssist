using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using Microsoft.Win32;
using RiftAssist.ControlCenter.Core;

namespace RiftAssist.ControlCenter;

public partial class OperationsView : UserControl, IAsyncDisposable
{
    public OperationsModel Model { get; }
    public OperationsView() { Model = new OperationsModel(); InitializeComponent(); DataContext = Model; }
    private async Task Run(string name, Func<Task> work, bool ssh = false)
    {
        if (Model.Busy) return; Model.Busy = true; OpsBody.IsEnabled = false; ModeCombo.IsEnabled = false; CancelQueryButton.IsEnabled = ssh;
        try { await work(); }
        catch (Exception error) { Model.Log(name, error is ControlException c ? c.Code : "client-local-failed"); MessageBox.Show(Window.GetWindow(this), UserErrors.Explain(error), name, MessageBoxButton.OK, MessageBoxImage.Warning); }
        finally { Model.Busy = false; OpsBody.IsEnabled = true; ModeCombo.IsEnabled = true; CancelQueryButton.IsEnabled = false; }
    }
    private async void Mode_Changed(object sender, SelectionChangedEventArgs e)
    { if (IsInitialized && !Model.Busy) { RemoteApproved.IsChecked = false; await Run("대상 변경", () => Model.SetModeAsync(ModeCombo.SelectedIndex == 1)); } }
    private async void New_Click(object sender, RoutedEventArgs e) => await Run("합성 개발 관리자 준비", () => Model.ConnectMockAsync(null));
    private async void Connect_Click(object sender, RoutedEventArgs e)
    { if (EnvironmentCombo.SelectedItem is OwnedSandbox sandbox) await Run("개발 관리자 연결", () => Model.ConnectMockAsync(sandbox)); }
    private void List_Click(object sender, RoutedEventArgs e) { try { Model.ReloadEnvironments(); } catch (Exception error) { MessageBox.Show(UserErrors.Explain(error)); } }
    private async void Disconnect_Click(object sender, RoutedEventArgs e) => await Run("연결 해제", Model.DisconnectAsync);
    private async void Refresh_Click(object sender, RoutedEventArgs e) => await Run("개발 상태 갱신", Model.RefreshMockAsync);
    private void Cancel_Click(object sender, RoutedEventArgs e) => Model.CancelQuery();
    private async void Query_Click(object sender, RoutedEventArgs e)
    {
        if (RemoteApproved.IsChecked != true) { MessageBox.Show("실제 서버 접속의 별도 승인 전에는 실행할 수 없습니다."); return; }
        var dialog = new ReviewDialog(Window.GetWindow(this), "Azure 읽기 전용 조회 · 별도 승인 필요",
            "Windows OpenSSH가 설정한 호스트로 연결합니다. CPU/RAM/루트 디스크/가동시간, riftassist.service 상태와 앱3001·설정 HTTPS /api/health의 응답 코드만 읽습니다.\n\n호스트 키는 사전에 독립적인 경로로 검증해야 합니다. 호스트 키 자동 등록·SSH 터널·sudo·서비스 제어·운영 데이터/로그 조회는 없습니다. 실제 연결의 별도 승인을 받은 경우에만 진행하세요.", true, "읽기 전용 조회");
        if (dialog.ShowDialog() != true) return;
        RemoteApproved.IsChecked = false;
        await Run("SSH 상태 조회", () => Model.QueryRemoteAsync(true), ssh: true);
    }
    private async Task<bool> Change(string method, object parameters, string label, string? phrase = null)
    {
        if (!Model.CanControl) return false;
        var extra = method == "backup" ? "\n\n백업은 개발 DB와 개발 암호화 키를 함께 포함합니다. 개발 폴더 내부 전용이며 외부 반출/Git 포함을 금지합니다." : "";
        var dialog = new ReviewDialog(Window.GetWindow(this), label, $"대상: 합성 개발 환경\n{Model.LocalRoot}\n\n{label}\n이 명령은 운영 Azure 서버로 전달되지 않습니다. 결과가 불명확하면 자동 재시도하지 말고 상태와 감사 기록을 확인하세요.{extra}", true, phrase);
        if (dialog.ShowDialog() != true) return false;
        var saved = false;
        await Run(label, async () => { await Model.ChangeAsync(method, parameters, dialog.Reason, dialog.Acknowledged); saved = true; });
        return saved;
    }
    private async void Server_Click(object sender, RoutedEventArgs e)
    { var method = (string)((Button)sender).Tag; await Change(method, new { }, "개발 앱 " + method, method is "stop" or "restart" ? "개발 서버 변경" : null); }
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
    private async void Report_Changed(object sender, SelectionChangedEventArgs e)
    { if (!Model.Busy && ReportsGrid.SelectedItem is OperationsReport report) await Run("합성 제보 상세", async () => { await Model.SelectReportAsync(report); ReportState.SelectedItem = report.Status; }); }
    private void ReportFilter_Changed(object sender, TextChangedEventArgs e)
    {
        if (ReportFilter is null) return; var filter = ReportFilter.Text;
        CollectionViewSource.GetDefaultView(Model.Reports).Filter = value => value is OperationsReport report && (filter.Length == 0 || $"{report.Id} {report.Category} {report.Status}".Contains(filter, StringComparison.OrdinalIgnoreCase));
    }
    private async void ReportUpdate_Click(object sender, RoutedEventArgs e)
    { if (ReportsGrid.SelectedItem is OperationsReport report && ReportState.SelectedItem is string state && await Change("update-report", new { id = report.Id, status = state, note = ReportNote.Text }, "개발 제보 처리 저장")) ReportNote.Clear(); }
    private async void Export_Click(object sender, RoutedEventArgs e)
    {
        if (ReportsGrid.SelectedItem is not OperationsReport report || !Model.CanControl) return;
        var dialog = new SaveFileDialog { Title = "합성 제보 내보내기 (실제 사용자 자료 없음)", FileName = "RiftAssist-synthetic-report-" + report.Id + ".json", Filter = "JSON|*.json", OverwritePrompt = true };
        if (dialog.ShowDialog(Window.GetWindow(this)) != true) return;
        await Run("합성 제보 내보내기", async () => { await Model.SelectReportAsync(report); await File.WriteAllTextAsync(dialog.FileName, Model.ReportDetail, ProtocolJson.Utf8); Model.Log("export-synthetic-report", "선택 파일에 저장"); });
    }
    private async void Logs_Click(object sender, RoutedEventArgs e) => await Run("개발 로그 조회", Model.RefreshLogsAsync);
    private void Profile_Changed(object sender, TextChangedEventArgs e) { if (RemoteApproved is not null) RemoteApproved.IsChecked = false; Model.InvalidateRemote(); }
    private void Browse_Click(object sender, RoutedEventArgs e)
    {
        var dialog = new OpenFileDialog { Title = "기존 SSH 파일 경로만 선택 (파일 내용 복사/저장 안 함)", CheckFileExists = true };
        if (dialog.ShowDialog(Window.GetWindow(this)) != true) return;
        if ((string)((Button)sender).Tag == "identity") Model.IdentityFile = dialog.FileName; else Model.KnownHostsFile = dialog.FileName;
        RemoteApproved.IsChecked = false; Model.InvalidateRemote();
    }
    private void SaveSettings_Click(object sender, RoutedEventArgs e)
    { try { Model.SaveSettings(); RemoteApproved.IsChecked = false; } catch (Exception error) { MessageBox.Show(UserErrors.Explain(error)); } }
    public async ValueTask DisposeAsync() => await Model.DisposeAsync();
}
