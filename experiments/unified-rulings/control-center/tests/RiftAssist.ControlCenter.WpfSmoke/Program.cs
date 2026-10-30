using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using RiftAssist.ControlCenter;
using RiftAssist.ControlCenter.Core;

internal static class Program
{
    [STAThread]
    private static int Main(string[] args)
    {
        var trace = new BindingTrace(); PresentationTraceSources.DataBindingSource.Switch.Level = SourceLevels.Error;
        PresentationTraceSources.DataBindingSource.Listeners.Add(trace);
        var app = new App(); app.InitializeComponent(); app.ShutdownMode = ShutdownMode.OnExplicitShutdown;
        var model = new DesktopModel();
        using var json = JsonDocument.Parse("""
        {"id":"mock:smoke/translation","cardId":"mock:smoke","type":"translation","fingerprint":"synthetic",
        "kinds":["translation-proposal"],"warnings":[{"code":"mock-source","severity":"review"}],
        "before":{"nameEn":"Synthetic card","textEn":"Draw 1 card.","textKo":"카드 1장을 뽑습니다.","source":{"kind":"mock"}},
        "after":{"nameEn":"Synthetic card","textEn":"Draw 2 cards after combat.","status":"preview-unreleased","source":{"kind":"mock","url":"https://example.invalid/smoke"},"cost":{"energy":1},"symbols":["[E]"]},
        "proposal":{"authority":"mock","textKo":"전투 후 카드 2장을 뽑습니다."}}
        """);
        model.Items.Add(new ReviewItem(json.RootElement));
        var window = new MainWindow(model); window.Show(); window.UpdateLayout();
        var mainTabs = (TabControl)window.FindName("MainTabs");
        var operations = (OperationsView)window.FindName("OperationsPanel");
        var operationTabs = (TabControl)operations.FindName("OperationsTabs");
        if (operationTabs.Items.Count != 7 || operations.Model.CanControl || operations.Model.AzureMode) return 1;
        foreach (TabItem tab in operationTabs.Items) { tab.IsSelected = true; window.UpdateLayout(); window.Dispatcher.Invoke(() => { }, DispatcherPriority.ApplicationIdle); }
        ((ComboBox)operations.FindName("ModeCombo")).SelectedIndex = 1;
        window.Dispatcher.Invoke(() => { }, DispatcherPriority.ApplicationIdle);
        if (!operations.Model.AzureMode || ((StackPanel)operations.FindName("ServerControlPanel")).IsEnabled || operations.FindName("RemoteApproved") is not null) return 1;
        operationTabs.SelectedIndex = 0; mainTabs.SelectedIndex = 1; window.UpdateLayout();
        var grid = (DataGrid)window.FindName("ReviewGrid"); grid.SelectedIndex = 0;
        window.Dispatcher.Invoke(() => { }, DispatcherPriority.ApplicationIdle);
        if (!window.IsLoaded || ((TextBox)window.FindName("AfterEnglish")).Text != "Draw 2 cards after combat." || trace.Errors.Count != 0) return 1;
        if (args.Length > 0)
        {
            Directory.CreateDirectory(args[0]);
            var image = new RenderTargetBitmap((int)window.ActualWidth, (int)window.ActualHeight, 96, 96, PixelFormats.Pbgra32); image.Render(window);
            var encoder = new PngBitmapEncoder(); encoder.Frames.Add(BitmapFrame.Create(image));
            using var file = File.Create(Path.Combine(args[0], "wpf-native-smoke.png")); encoder.Save(file);
            mainTabs.SelectedIndex = 0; window.UpdateLayout(); window.Dispatcher.Invoke(() => { }, DispatcherPriority.ApplicationIdle);
            var dashboard = new RenderTargetBitmap((int)window.ActualWidth, (int)window.ActualHeight, 96, 96, PixelFormats.Pbgra32); dashboard.Render(window);
            var dashboardEncoder = new PngBitmapEncoder(); dashboardEncoder.Frames.Add(BitmapFrame.Create(dashboard));
            using var dashboardFile = File.Create(Path.Combine(args[0], "wpf-operations-smoke.png")); dashboardEncoder.Save(dashboardFile);
        }
        PhaseThreeSmoke.Run(app, window, args.Length > 0 ? args[0] : null);
        if (trace.Errors.Count != 0) return 1;
        window.Close(); window.Dispatcher.Invoke(() => { }, DispatcherPriority.ApplicationIdle); app.Shutdown();
        var report = JsonSerializer.Serialize(new { nativeWpfWindowLoaded = true, bindingErrors = trace.Errors.Count,
            operationsTabsLoaded = 7, simpleConfirmationTested = true, automaticReasonTested = true, manualMockSshQueryTested = true,
            invalidPortSaveBlocked = true, productionControlsDisabled = true, backendStarted = false, liveConnections = false, os = System.Runtime.InteropServices.RuntimeInformation.OSDescription });
        if (args.Length > 0) File.WriteAllText(Path.Combine(args[0], "wpf-native-smoke.json"), report + Environment.NewLine);
        Console.WriteLine(report);
        return 0;
    }
    private sealed class BindingTrace : TraceListener
    {
        public List<string> Errors { get; } = [];
        public override void Write(string? message) { if (!string.IsNullOrWhiteSpace(message)) Errors.Add(message); }
        public override void WriteLine(string? message) => Write(message);
    }
}
