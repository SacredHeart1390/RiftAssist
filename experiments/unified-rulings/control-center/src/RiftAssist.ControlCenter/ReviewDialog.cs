using System.Windows;
using System.Windows.Controls;
using RiftAssist.ControlCenter.Core;

namespace RiftAssist.ControlCenter;

public sealed class ReviewDialog : Window
{
    private readonly TextBox reason = new() { MaxLength = 1000, Height = 75, AcceptsReturn = true, TextWrapping = TextWrapping.Wrap };
    private readonly TextBox phrase = new();
    private readonly CheckBox acknowledge = new() { Margin = new Thickness(6), Content = "위 내용과 경고·반영/제외 범위를 확인했습니다." };
    private readonly string? requiredPhrase;
    private readonly bool requireAck;
    private readonly string? automaticReason;
    public string Reason => automaticReason ?? reason.Text.Trim();
    public string Phrase => phrase.Text;
    public bool Acknowledged => acknowledge.IsChecked == true;
    public ReviewDialog(Window owner, string title, string detail, bool requireAck, string? requiredPhrase = null, string? automaticReason = null)
    {
        Owner = owner; Title = title; Width = 680; Height = 600; MinWidth = 520; MinHeight = 480;
        WindowStartupLocation = WindowStartupLocation.CenterOwner; this.requiredPhrase = requiredPhrase; this.requireAck = requireAck;
        this.automaticReason = automaticReason;
        var panel = new DockPanel { Margin = new Thickness(16) }; Content = panel;
        var footer = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right };
        var cancel = new Button { Content = "취소", IsCancel = true }; var confirm = new Button { Content = "확인하여 진행" };
        confirm.Click += (_, _) => {
            try { ReviewCoordinator.ValidateReason(Reason); if ((requireAck && !Acknowledged) || (requiredPhrase is not null && Phrase != requiredPhrase)) throw new ControlException("client-confirmation-required"); DialogResult = true; }
            catch { MessageBox.Show(this, "확인 항목과 지정 문구를 확인해 주세요.", "확인 필요"); }
        };
        footer.Children.Add(cancel); footer.Children.Add(confirm); DockPanel.SetDock(footer, Dock.Bottom); panel.Children.Add(footer);
        var input = new StackPanel(); DockPanel.SetDock(input, Dock.Bottom); panel.Children.Add(input);
        if (requireAck) input.Children.Add(acknowledge);
        if (automaticReason is null) { input.Children.Add(new TextBlock { Text = "변경/작업 사유", Margin = new Thickness(6) }); input.Children.Add(reason); }
        if (requiredPhrase is not null) { input.Children.Add(new TextBlock { Text = $"확인 문구를 입력하세요: {requiredPhrase}", Margin = new Thickness(6) }); input.Children.Add(phrase); }
        panel.Children.Add(new TextBox { Text = detail, IsReadOnly = true, TextWrapping = TextWrapping.Wrap, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, Margin = new Thickness(3) });
    }
}
