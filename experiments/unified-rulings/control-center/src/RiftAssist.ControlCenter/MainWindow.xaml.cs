using System.ComponentModel;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using System.Windows.Input;
using RiftAssist.ControlCenter.Core;

namespace RiftAssist.ControlCenter;

public partial class MainWindow : Window
{
    public DesktopModel Model { get; }
    private bool closing;
    public MainWindow(DesktopModel model)
    {
        Model = model; InitializeComponent(); DataContext = model;
        Loaded += (_, _) => { try { Model.ReloadSandboxes(); } catch { Model.Status = "개발 환경 목록 점검이 필요합니다."; } UpdateButtons(); };
        Closing += CloseWindow;
        PreviewKeyDown += async (_, e) => { if (e.Key == Key.R && Keyboard.Modifiers == ModifierKeys.Control && !Model.Busy && Model.Connected) { e.Handled = true; await Refresh(); } };
    }
    private async Task Run(string action, Func<Task> work)
    {
        if (Model.Busy) return; Model.Busy = true; Body.IsEnabled = false; Model.Status = action + "…";
        try { await work(); }
        catch (Exception e) { Model.Log(action, e is ControlException c ? c.Code : "client-local-failed"); Model.Status = "작업 결과 확인 필요"; MessageBox.Show(this, UserErrors.Explain(e), action, MessageBoxButton.OK, MessageBoxImage.Warning); }
        finally { Model.Busy = false; Body.IsEnabled = true; UpdateButtons(); }
    }
    private void UpdateButtons()
    {
        if (!IsInitialized || Model is null) return;
        var review = Model.Review; var current = review?.Current; var connected = Model.Connected;
        ConnectButton.IsEnabled = !connected && SandboxCombo.SelectedItem is OwnedSandbox; DisconnectButton.IsEnabled = connected; RefreshButton.IsEnabled = connected;
        SandboxCombo.IsEnabled = !connected; FinalRole.IsEnabled = !connected;
        var mutable = connected && current is not null && !review!.NeedsRefresh && current.StaleReason.Length == 0 && current.Status == "open" && current.PendingIntents.Count == 0;
        ApproveButton.IsEnabled = RejectButton.IsEnabled = HoldButton.IsEnabled = mutable && review!.HasScope("review:decide"); StageButton.IsEnabled = mutable && review!.HasScope("cards:stage");
        PreviousButton.IsEnabled = connected && current?.Offset > 0; NextButton.IsEnabled = connected && current is not null && current.Offset + current.Items.Count < current.Total;
        var package = PackageCombo.SelectedItem as ReviewPackage;
        ActivateButton.IsEnabled = mutable && package is not null && package.ValidRevision == current!.Revision && review!.HasScope("cards:activate");
        RollbackButton.IsEnabled = connected && current?.Status == "active" && !review!.NeedsRefresh && package is not null && review.HasScope("cards:rollback");
        RecoverButton.IsEnabled = connected && IntentCombo.SelectedItem is PendingIntent intent && review!.HasScope(intent.Action == "activate" ? "cards:activate" : "cards:rollback");
        AuditButton.IsEnabled = connected; AuditPreviousButton.IsEnabled = connected && Model.AuditOffset > 0; AuditNextButton.IsEnabled = connected && Model.AuditOffset + 20 < Model.AuditTotal;
    }
    private async Task Load(string id, int offset = 0)
    {
        await Model.LoadAsync(id, offset); ReviewGrid.SelectedIndex = Model.Items.Count > 0 ? 0 : -1;
        PackageCombo.SelectedIndex = Model.Packages.Count - 1; IntentCombo.SelectedIndex = Model.PendingIntents.Count > 0 ? 0 : -1;
    }
    private async Task Refresh()
    {
        await Run("새로고침", async () => { var id = Model.Review?.Current?.BundleId; var offset = Model.Review?.Current?.Offset ?? 0;
            await Model.RefreshBundlesAsync(); BundleCombo.SelectedItem = Model.Bundles.FirstOrDefault(b => b.Id == id) ?? Model.Bundles.LastOrDefault();
            if (BundleCombo.SelectedItem is BundleSummary b) await Load(b.Id, offset); });
    }
    private async void Create_Click(object sender, RoutedEventArgs e) => await Run("합성자료 준비", async () => {
        var id = await Model.CreateAsync(FinalRole.IsChecked == true); BundleCombo.SelectedItem = Model.Bundles.FirstOrDefault(b => b.Id == id); await Load(id); });
    private void Environments_Click(object sender, RoutedEventArgs e) { try { Model.ReloadSandboxes(); UpdateButtons(); } catch (Exception ex) { MessageBox.Show(this, UserErrors.Explain(ex)); } }
    private async void Connect_Click(object sender, RoutedEventArgs e)
    { if (SandboxCombo.SelectedItem is OwnedSandbox sandbox) await Run("연결", async () => { await Model.ConnectAsync(sandbox, FinalRole.IsChecked == true); BundleCombo.SelectedItem = Model.Bundles.LastOrDefault(); if (BundleCombo.SelectedItem is BundleSummary b) await Load(b.Id); }); }
    private async void Disconnect_Click(object sender, RoutedEventArgs e) => await Run("연결 해제", async () => { await Model.DisconnectAsync(); Model.Status = "연결 해제됨 · 기존 자료 보존"; });
    private void Sandbox_Changed(object sender, SelectionChangedEventArgs e) => UpdateButtons();
    private void FinalRole_Checked(object sender, RoutedEventArgs e)
    {
        if (!IsLoaded) return;
        if (MessageBox.Show(this, "이 세션에 앱 소유 합성자료의 최종 활성화/롤백 권한을 추가합니다. 각 작업에는 별도 사유와 확인 문구가 필요합니다. 운영 서버 권한을 부여하지 않습니다. 계속할까요?", "로컬 최종 승인 권한", MessageBoxButton.YesNo, MessageBoxImage.Warning, MessageBoxResult.No) != MessageBoxResult.Yes)
            FinalRole.IsChecked = false;
    }
    private async void Bundle_Changed(object sender, SelectionChangedEventArgs e) { if (!Model.Busy && BundleCombo.SelectedItem is BundleSummary b) await Run("후보 조회", () => Load(b.Id)); }
    private async void Refresh_Click(object sender, RoutedEventArgs e) => await Refresh();
    private async void Previous_Click(object sender, RoutedEventArgs e) { if (Model.Review?.Current is { } b) await Run("이전 페이지", () => Load(b.BundleId, Math.Max(0, b.Offset - 10))); }
    private async void Next_Click(object sender, RoutedEventArgs e) { if (Model.Review?.Current is { } b) await Run("다음 페이지", () => Load(b.BundleId, b.Offset + 10)); }
    private void Filter_Changed(object sender, TextChangedEventArgs e)
    {
        if (Model is null) return; var text = FilterBox.Text;
        CollectionViewSource.GetDefaultView(Model.Items).Filter = value => value is ReviewItem item && (text.Length == 0 ||
            string.Join(" ", item.Title, item.CardId, item.Kinds, item.AfterKorean, item.AfterEnglish).Contains(text, StringComparison.OrdinalIgnoreCase));
    }
    private void Review_Changed(object sender, SelectionChangedEventArgs e)
    {
        var item = ReviewGrid.SelectedItem as ReviewItem;
        BeforeEnglish.Text = item?.BeforeEnglish ?? ""; AfterEnglish.Text = item?.AfterEnglish ?? ""; BeforeKorean.Text = item?.BeforeKorean ?? ""; AfterKorean.Text = item?.AfterKorean ?? "";
        BeforeMetadata.Text = item?.BeforeMetadata ?? ""; AfterMetadata.Text = item?.AfterMetadata ?? "";
        Warnings.Text = item is null ? "" : $"검토: {item.DecisionLabel} · 사유: {item.DecisionReason}\n{item.WarningText}";
    }
    private void SelectAll_Click(object sender, RoutedEventArgs e) { foreach (var item in ReviewGrid.Items.OfType<ReviewItem>()) item.Selected = true; ReviewGrid.Items.Refresh(); }
    private void ClearSelection_Click(object sender, RoutedEventArgs e) { foreach (var item in Model.Items) item.Selected = false; ReviewGrid.Items.Refresh(); }
    private async Task Decide(string decision)
    {
        ReviewGrid.CommitEdit(DataGridEditingUnit.Cell, true); ReviewGrid.CommitEdit(DataGridEditingUnit.Row, true);
        var items = ReviewGrid.Items.OfType<ReviewItem>().Where(i => i.Selected).ToArray();
        if (items.Length == 0) { MessageBox.Show(this, "현재 페이지에서 항목을 선택해 주세요."); return; }
        var label = decision switch { "approve" => "승인", "reject" => "거절", _ => "보류" };
        var warnings = items.SelectMany(i => i.Warnings).Select(w => w.Code).ToHashSet(StringComparer.Ordinal);
        var detail = string.Join(Environment.NewLine, items.Select(i => $"{i.Title} · {i.TypeLabel}\n{i.WarningText}"));
        var dialog = new ReviewDialog(this, $"선택 {items.Length}개 {label}", detail, decision == "approve");
        if (dialog.ShowDialog() != true) return;
        await Run(label, async () => { var review = Model.Review!; var id = review.Current!.BundleId; var offset = review.Current.Offset;
            await review.DecideAsync(items, decision, dialog.Reason, dialog.Acknowledged ? warnings : new HashSet<string>());
            Model.Log(label, "결정 저장됨 · 활성화 안 함"); await Load(id, offset); });
    }
    private async void Approve_Click(object sender, RoutedEventArgs e) => await Decide("approve");
    private async void Reject_Click(object sender, RoutedEventArgs e) => await Decide("reject");
    private async void Hold_Click(object sender, RoutedEventArgs e) => await Decide("hold");
    private async void Stage_Click(object sender, RoutedEventArgs e) => await Run("승인본 구성", async () => {
        var review = Model.Review!; var plan = await review.PlanStageAsync();
        var dialog = new ReviewDialog(this, "승인 항목으로 별도 후보 구성", plan.Description + "\n\n현재 활성 자료는 바뀌지 않습니다.", true);
        if (dialog.ShowDialog() != true) return;
        var result = await review.StageAsync(plan, dialog.Reason, dialog.Acknowledged); Model.Log("승인본 구성", result.Field("status").Text() == "no-changes" ? "실제 변경 없음" : "새 후보 저장 · 활성화 안 함");
        await Load(plan.BundleId, Model.Review!.Current!.Offset);
    });
    private void Package_Changed(object sender, SelectionChangedEventArgs e) { PackageDetails.Text = (PackageCombo.SelectedItem as ReviewPackage)?.Description ?? "구성된 승인본이 없습니다."; UpdateButtons(); }
    private void Intent_Changed(object sender, SelectionChangedEventArgs e) => UpdateButtons();
    private async Task Final(string action)
    {
        if (Model.Review?.Current is not { } snapshot || PackageCombo.SelectedItem is not ReviewPackage package) return;
        var activate = action == "activate"; var phrase = activate ? "개발 자료 활성화" : "개발 자료 되돌리기";
        var detail = $"대상은 아래 앱 소유 로컬 합성자료입니다.\n{Model.Location}\n\n{package.Description}\n\n"
            + (activate ? "승인된 내용으로 이 개발 폴더의 활성 포인터가 바뀝니다. 보류/거절/미검토 항목은 구성 범위에서 제외됩니다." : "이 승인본이 현재 활성 상태일 때만 정확한 이전 정상 자료로 되돌립니다.")
            + "\n\nRiot/Azure/운영 DB는 연결되지 않았습니다. 자료 손상/미완료 감사 이력이 있으면 자동 재시도하지 마세요.";
        var dialog = new ReviewDialog(this, phrase + " · 별도 최종 확인", detail, true, phrase); if (dialog.ShowDialog() != true) return;
        await Run(phrase, async () => { var approval = new FinalApproval(dialog.Phrase, dialog.Reason, dialog.Acknowledged);
            if (activate) await Model.Review!.ActivateAsync(package, approval); else await Model.Review!.RollbackAsync(package, approval);
            Model.Log(action, "로컬 포인터 전환 완료"); await Load(snapshot.BundleId, snapshot.Offset); });
    }
    private async void Activate_Click(object sender, RoutedEventArgs e) => await Final("activate");
    private async void Rollback_Click(object sender, RoutedEventArgs e) => await Final("rollback");
    private async void Recover_Click(object sender, RoutedEventArgs e)
    {
        if (IntentCombo.SelectedItem is not PendingIntent intent || Model.Review?.Current is not { } snapshot) return;
        var dialog = new ReviewDialog(this, "미완료 작업 결과 확인", intent.Description + "\n\n먼저 개발 폴더의 잠금·자료를 점검해야 합니다. 이 명령은 현재 포인터를 확인해 결과만 기록하며 자동 재활성화/롤백하지 않습니다.", true, "복구 상태 확인");
        if (dialog.ShowDialog() != true) return;
        await Run("복구 확인", async () => { await Model.Review!.RecoverAsync(intent, new FinalApproval(dialog.Phrase, dialog.Reason, dialog.Acknowledged)); Model.Log("recover", "의도/포인터 확인 완료"); await Load(snapshot.BundleId, snapshot.Offset); });
    }
    private async void Audit_Click(object sender, RoutedEventArgs e) => await Run("감사 조회", async () => { await Model.RefreshAuditAsync(Model.AuditOffset); Model.Log("audit", "조회 완료"); });
    private async void AuditPrevious_Click(object sender, RoutedEventArgs e) => await Run("감사 이전", () => Model.RefreshAuditAsync(Math.Max(0, Model.AuditOffset - 20)));
    private async void AuditNext_Click(object sender, RoutedEventArgs e) => await Run("감사 다음", () => Model.RefreshAuditAsync(Model.AuditOffset + 20));
    private async void CloseWindow(object? sender, CancelEventArgs e)
    {
        if (closing) return; e.Cancel = true;
        if (Model.Busy) { MessageBox.Show(this, "진행 중 작업이 끝나거나 시간 초과 결과를 확인한 뒤 종료해 주세요."); return; }
        await Model.DisposeAsync(); closing = true; _ = Dispatcher.BeginInvoke(new Action(Close));
    }
}
