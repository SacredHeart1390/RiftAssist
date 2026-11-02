using System.Windows;

namespace RiftAssist.ControlCenter;

public partial class App : Application
{
    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        if (!OperatingSystem.IsWindowsVersionAtLeast(10, 0, 19045))
        { MessageBox.Show("이 MVP는 Windows 10 22H2 x64 이상을 대상으로 합니다.", "RiftAssist"); Shutdown(1); return; }
        var window = new MainWindow(new DesktopModel()); MainWindow = window; window.Show();
        if (window.FindName("OperationsPanel") is OperationsView operations) await operations.TryStartupAdminAsync();
    }
}
