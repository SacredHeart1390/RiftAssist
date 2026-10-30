using System.Windows;
using System.Windows.Controls;

namespace RiftAssist.ControlCenter;

public sealed class ActionConfirmation : Window
{
    public Button ConfirmButton { get; } = new() { Content = "예, 실행", MinWidth = 100 };
    public Button CancelButton { get; } = new() { Content = "아니요", IsCancel = true, IsDefault = true, MinWidth = 100 };
    public ActionConfirmation(Window owner, string action, string target, string detail = "")
    {
        Owner = owner; Title = "작업 확인"; Width = 480; SizeToContent = SizeToContent.Height; MaxHeight = 520; ResizeMode = ResizeMode.NoResize;
        WindowStartupLocation = WindowStartupLocation.CenterOwner;
        var panel = new StackPanel { Margin = new Thickness(20) }; Content = panel;
        panel.Children.Add(new TextBlock { Text = "정말 실행하시겠습니까?", FontSize = 19, FontWeight = FontWeights.SemiBold });
        panel.Children.Add(new TextBlock { Text = action, Margin = new Thickness(0, 12, 0, 4), TextWrapping = TextWrapping.Wrap });
        panel.Children.Add(new TextBlock { Text = target, TextWrapping = TextWrapping.Wrap });
        if (detail.Length != 0) panel.Children.Add(new ScrollViewer { Content = new TextBlock { Text = detail, TextWrapping = TextWrapping.Wrap }, MaxHeight = 260, VerticalScrollBarVisibility = ScrollBarVisibility.Auto, Margin = new Thickness(0, 12, 0, 0) });
        var buttons = new StackPanel { Orientation = Orientation.Horizontal, HorizontalAlignment = HorizontalAlignment.Right, Margin = new Thickness(0, 16, 0, 0) };
        buttons.Children.Add(CancelButton); buttons.Children.Add(ConfirmButton); panel.Children.Add(buttons);
        ConfirmButton.Click += (_, _) => DialogResult = true; CancelButton.Click += (_, _) => DialogResult = false;
    }
    public static bool Confirm(Window owner, string action, string target, string detail = "") => new ActionConfirmation(owner, action, target, detail).ShowDialog() == true;
}
