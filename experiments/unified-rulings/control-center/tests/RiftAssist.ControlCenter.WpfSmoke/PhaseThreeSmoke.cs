using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using RiftAssist.ControlCenter;
using RiftAssist.ControlCenter.Core;

internal static class PhaseThreeSmoke
{
    public static void Run(Application app, Window owner, string? output)
    {
        foreach (var accept in new[] { false, true }) {
            var dialog = new ActionConfirmation(owner, "개발 앱 시작", "합성 개발 환경");
            _ = app.Dispatcher.BeginInvoke(new Action(() => {
                Check(!Children(dialog).Any(c => c is CheckBox or TextBox));
                Check(dialog.CancelButton.IsDefault && !dialog.ConfirmButton.IsDefault);
                (accept ? dialog.ConfirmButton : dialog.CancelButton).RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
            }), DispatcherPriority.ApplicationIdle);
            Check((dialog.ShowDialog() == true) == accept);
        }
        var protectedDialog = new ReviewDialog(owner, "최종 전환 확인", "합성 대상", true, "개발 자료 활성화", UserInteraction.AuditReason("activate", "synthetic-release"));
        protectedDialog.Show(); Idle(app);
        Check(Children(protectedDialog).OfType<CheckBox>().Count() == 1);
        Check(Children(protectedDialog).OfType<TextBox>().Count(t => !t.IsReadOnly) == 1);
        Check(protectedDialog.Reason.Contains("자동 기록", StringComparison.Ordinal)); protectedDialog.Close();

        var home = Path.Combine(Path.GetTempPath(), "riftassist-phase3-ui-" + Guid.NewGuid().ToString("N")); Directory.CreateDirectory(home);
        var runner = new FakeSsh(); var model = new OperationsModel(runner, new SshProfileStore(home)); var view = new OperationsView(model);
        var window = new Window { Title = "RiftAssist dashboard smoke", Content = view, Width = 1120, Height = 800 };
        try {
            window.Show(); var tabs = (TabControl)view.FindName("OperationsTabs"); tabs.SelectedIndex = 6; Idle(app);
            model.Host = "example.invalid"; model.User = "synthetic_user"; model.HttpsOrigin = "https://example.invalid"; model.KnownHostsFile = Path.Combine(home, "known_hosts");
            Idle(app); Check(runner.Calls == 0);
            var port = (TextBox)view.FindName("PortInput"); port.Text = "abc"; Idle(app);
            Check(OperationsView.HasInvalidInput((StackPanel)view.FindName("SettingsForm")));
            ((Button)view.FindName("SaveSshSettings")).RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
            Check(!File.Exists(Path.Combine(home, "ssh.local.json")) && runner.Calls == 0);
            port.Text = "22"; Idle(app);
            foreach (var accept in new[] { false, true }) {
                _ = app.Dispatcher.BeginInvoke(new Action(() => {
                    var dialog = app.Windows.OfType<ActionConfirmation>().Single();
                    (accept ? dialog.ConfirmButton : dialog.CancelButton).RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                }), DispatcherPriority.ApplicationIdle);
                ((Button)view.FindName("SaveSshSettings")).RaiseEvent(new RoutedEventArgs(Button.ClickEvent));
                Check(File.Exists(Path.Combine(home, "ssh.local.json")) == accept && runner.Calls == 0);
            }
            ((ComboBox)view.FindName("ModeCombo")).SelectedIndex = 1; tabs.SelectedIndex = 0; Idle(app);
            Check(view.FindName("RemoteApproved") is null && !((StackPanel)view.FindName("ServerControlPanel")).IsEnabled);
            ((Button)view.FindName("QuerySshButton")).RaiseEvent(new RoutedEventArgs(Button.ClickEvent)); Idle(app);
            Check(runner.Calls == 1 && model.Metrics.Count == 6 && model.Metrics[5].Value == "실행 중");
            Check(((TextBlock)view.FindName("ConnectionText")).Text == "SSH 연결됨");
            if (output is not null) {
                var image = new RenderTargetBitmap((int)window.ActualWidth, (int)window.ActualHeight, 96, 96, PixelFormats.Pbgra32); image.Render(window);
                var encoder = new PngBitmapEncoder(); encoder.Frames.Add(BitmapFrame.Create(image));
                using var file = File.Create(Path.Combine(output, "wpf-phase3-dashboard.png")); encoder.Save(file);
            }
            runner.Fail = true; ((Button)view.FindName("QuerySshButton")).RaiseEvent(new RoutedEventArgs(Button.ClickEvent)); Idle(app);
            Check(runner.Calls == 2 && model.SnapshotInfo.Contains("이전 정상값", StringComparison.Ordinal) && model.State.Contains("인증", StringComparison.Ordinal));
            model.Host = "other.invalid"; Check(model.Metrics.All(t => t.Value == "미조회"));
        } finally { window.Close(); view.DisposeAsync().AsTask().GetAwaiter().GetResult(); Directory.Delete(home, recursive: true); }
    }
    private static void Idle(Application app) => app.Dispatcher.Invoke(() => { }, DispatcherPriority.ApplicationIdle);
    private static void Check(bool value) { if (!value) throw new InvalidOperationException("Phase 3 native UI assertion failed."); }
    private static IEnumerable<DependencyObject> Children(DependencyObject root)
    { yield return root; for (var i = 0; i < VisualTreeHelper.GetChildrenCount(root); i++) foreach (var child in Children(VisualTreeHelper.GetChild(root, i))) yield return child; }
    private sealed class FakeSsh : ISshRunner
    {
        public int Calls { get; private set; }
        public bool Fail { get; set; }
        public Task<SshProcessResult> RunAsync(SshCommand command, CancellationToken cancellation)
        {
            SshCommandPolicy.Validate(command); Calls++;
            return Task.FromResult(Fail ? new SshProcessResult(255, "", "Permission denied (publickey).") : new SshProcessResult(0,
                "protocol=riftassist-status-1\nuptime_seconds=90061\nmemory_total_kib=4194304\nmemory_available_kib=3145728\ndisk_total_kib=67108864\ndisk_available_kib=54525952\ncpu_percent=12.50\nservice=active\napp_http=200\nhttps_http=200\n", ""));
        }
    }
}
