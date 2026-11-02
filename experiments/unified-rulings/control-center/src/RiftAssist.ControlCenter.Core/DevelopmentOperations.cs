using System.Text.Json;

namespace RiftAssist.ControlCenter.Core;

public enum OperationsTarget { IsolatedDevelopment, AzureReadOnly }
public static class OperationsPolicy
{
    public static readonly string[] ReadMethods = ["status", "reports", "report", "knowledge", "app-releases", "logs"];
    public static readonly string[] WriteMethods = ["start", "stop", "restart", "ai", "limits", "update-report", "hosting", "backup", "app-release", "knowledge-discover", "knowledge-activate"];
    public static readonly string[] ReportStates = ["received", "triaged", "reproduced", "fixing", "review", "resolved", "duplicate", "needs-info"];
    public static IReadOnlyDictionary<string, string> LimitLabels { get; } = new Dictionary<string, string> {
        ["questions"] = "전체 질문/일", ["generations"] = "답변 생성/일", ["translations"] = "새 번역/일", ["sessionQuestions"] = "세션 질문/일",
        ["sessionTranslations"] = "세션 번역/일", ["reports"] = "전체 제보/일", ["sessionReports"] = "세션 제보/일", ["concurrent"] = "AI 동시 호출" };
    public static void RequireDevelopment(OperationsTarget target)
    { if (target != OperationsTarget.IsolatedDevelopment) SshCommandPolicy.DenyOperationalMutation(); }
    public static void ValidateLimits(IReadOnlyDictionary<string, int> limits)
    {
        if (limits.Count != LimitLabels.Count || LimitLabels.Keys.Any(k => !limits.ContainsKey(k)) || limits.Any(p => p.Value < 1 || p.Value > (p.Key == "concurrent" ? 3 : 1000)))
            throw new ControlException("client-operations-limits");
    }
}

public sealed class DevelopmentOperations(IReviewTransport transport, OperationsTarget target = OperationsTarget.IsolatedDevelopment) : IAsyncDisposable
{
    public bool NeedsRefresh { get; private set; }
    public bool Connected => !transport.IsFaulted;
    public async Task<JsonElement> ReadAsync(string method, object? parameters = null, CancellationToken cancellation = default)
    {
        OperationsPolicy.RequireDevelopment(target);
        if (!OperationsPolicy.ReadMethods.Contains(method, StringComparer.Ordinal)) throw new ControlException("client-operations-method");
        var result = await transport.SendAsync(method, parameters ?? new { }, cancellation);
        if (result.Field("controlCenterMode").Text() != "synthetic-development" && method != "logs") throw new ControlException("client-operations-target");
        if (method == "status") NeedsRefresh = false;
        return result;
    }
    public async Task<JsonElement> ChangeAsync(string method, object parameters, string reason, bool confirmed, CancellationToken cancellation = default)
    {
        OperationsPolicy.RequireDevelopment(target); ReviewCoordinator.ValidateReason(reason);
        if (!confirmed || NeedsRefresh || !OperationsPolicy.WriteMethods.Contains(method, StringComparer.Ordinal)) throw new ControlException("client-operations-confirmation");
        var fields = ProtocolJson.Element(parameters).EnumerateObject().ToDictionary(p => p.Name, p => (object?)p.Value.Clone()); fields["reason"] = reason;
        try { return await transport.SendAsync(method, fields, cancellation); }
        finally { NeedsRefresh = true; }
    }
    public async ValueTask DisposeAsync() => await transport.DisposeAsync();
}

public sealed record OperationsReport(string Id, string Category, string Status, string RequestId, string Created, string Source = "운영/개발 API", string Title = "", int Revision = 0)
{
    public static OperationsReport Read(JsonElement row) => new(row.Field("id").Text(), row.Field("category").Text(), row.Field("status").Text(), row.Field("request_id").Text(),
        row.Field("created").ValueKind == JsonValueKind.Number && row.Field("created").TryGetInt64(out var at) ? DateTimeOffset.FromUnixTimeMilliseconds(at).ToLocalTime().ToString("yyyy-MM-dd HH:mm") : "미확인");
}
public sealed record OperationEvent(string At, string Action, string Outcome, string Reason, string OperationId)
{
    public static OperationEvent Read(JsonElement row) => new(row.Field("at").Text(), row.Field("action").Text(), row.Field("outcome").Text(), row.Field("reason").Text(), row.Field("operationId").Text());
}
