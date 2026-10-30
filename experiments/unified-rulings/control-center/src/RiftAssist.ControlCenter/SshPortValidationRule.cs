using System.Globalization;
using System.Windows.Controls;

namespace RiftAssist.ControlCenter;

public sealed class SshPortValidationRule : ValidationRule
{
    public override ValidationResult Validate(object value, CultureInfo cultureInfo) =>
        int.TryParse(value as string, NumberStyles.None, CultureInfo.InvariantCulture, out var port) && port is >= 1 and <= 65535
            ? ValidationResult.ValidResult : new ValidationResult(false, "1–65,535의 정수를 입력하세요.");
}
