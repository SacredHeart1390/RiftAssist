using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace RiftAssist.ControlCenter.Core;

public sealed record AdminStatusView(string Summary, string Ai, IReadOnlyDictionary<string, int> Limits);
public static class RemoteAdminData
{
    public static AdminStatusView Status(JsonElement status)
    {
        try {
            var stats = status.GetProperty("stats"); var limits = stats.GetProperty("limits").EnumerateObject().ToDictionary(p => p.Name, p => p.Value.GetInt32());
            OperationsPolicy.ValidateLimits(limits);
            var day = stats.GetProperty("day").GetString() ?? "";
            if (!DateOnly.TryParseExact(day, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _)) throw new FormatException();
            var enabled = stats.GetProperty("aiEnabled").GetBoolean();
            var calls = stats.GetProperty("calls").EnumerateArray().ToArray(); if (calls.Length > 30) throw new FormatException();
            long Count(JsonElement row, string name) { var n = row.GetProperty(name).GetInt64(); if (n < 0) throw new FormatException(); return n; }
            var usage = calls.Select(c => {
                var kind = c.Field("kind").Text(); if (!Regex.IsMatch(kind, @"\A[a-zA-Z0-9_-]{1,40}\z")) throw new FormatException();
                var label = kind switch { "answer" => "AI 판정", "translation" => "번역", _ => "기타 집계" };
                return $"{label}: {Count(c, "count")}회 · 입력 {Count(c, "inputTokens")} / 출력 {Count(c, "outputTokens")} 토큰 · 사용량 미확인 {Count(c, "usageUnknown")}건";
            });
            // Only finite labels; an upstream error message can contain sensitive paths/credentials.
            var error = status.Field("error").Text();
            var recent = error.Length == 0 ? "없음" : error.Contains("Cloudflare", StringComparison.OrdinalIgnoreCase) || error.Contains("ngrok", StringComparison.OrdinalIgnoreCase) ? "공개 연결 오류 있음 (원문 보호)" : "관리자 오류 있음 (원문 보호)";
            var running = status.GetProperty("appRunning").GetBoolean() ? "실행 중" : "미실행";
            return new($"운영 관리자 보고 앱: {running} (systemd 실행 상태와 별도)\n최근 관리자 오류: {recent}\n마지막 조회: {DateTimeOffset.Now:yyyy-MM-dd HH:mm:ss}",
                $"운영 관리자 집계 · {day} (한국 시간) · AI {(enabled ? "활성" : "비활성")}\n" + string.Join("\n", usage) + "\n호출/토큰 집계이며 실제 과금 금액은 조회하지 않습니다.", limits);
        }
        catch (Exception e) when (e is InvalidOperationException or KeyNotFoundException or FormatException or OverflowException or ControlException) { throw new ControlException("client-admin-response"); }
    }
    public static IReadOnlyList<OperationsReport> Reports(JsonElement result)
    {
        try {
            var rows = result.GetProperty("reports").EnumerateArray().ToArray(); if (rows.Length > 200) throw new FormatException();
            foreach (var row in rows) {
                AdminReadPolicy.Require(HttpMethod.Get, "/api/reports/" + row.GetProperty("id").GetString());
                if (!OperationsPolicy.ReportStates.Contains(row.GetProperty("status").GetString(), StringComparer.Ordinal)) throw new FormatException();
            }
            return rows.Select(OperationsReport.Read).ToArray();
        } catch (Exception e) when (e is InvalidOperationException or KeyNotFoundException or FormatException or ArgumentOutOfRangeException or ControlException) { throw new ControlException("client-admin-response"); }
    }
    // Native read-only text only. Never serialize unknown server fields, trace, cookies or credentials.
    public static string Detail(JsonElement result, string expectedId)
    {
        if (result.Field("id").Text() != expectedId) throw new ControlException("client-admin-response");
        string Text(JsonElement v, string name, int limit = 100000) {
            var field = v.Field(name); if (field.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined) return "미보관/없음";
            if (field.ValueKind != JsonValueKind.String || field.GetString()!.Length > limit) throw new ControlException("client-admin-response"); return field.GetString()!;
        }
        var snapshot = result.Field("snapshot"); var question = snapshot.Field("question"); var response = snapshot.Field("response");
        var questionText = question.ValueKind == JsonValueKind.String ? question.GetString()! : Text(question, "text");
        if (questionText.Length > 100000) throw new ControlException("client-admin-response");
        var history = result.Field("history").Rows().Take(100).Select(h => $"{Text(h, "status", 100)} · {Text(h, "note", 3000)}");
        return $"제보: {expectedId}\n분류: {Text(result, "category", 100)} · 상태: {Text(result, "status", 100)}\n\n제보 내용\n{Text(result, "content", 10000)}\n\n연결 질문\n{questionText}\n\n연결 답변\n{Text(response, "recommendation")}\n\n판정 근거\n{Text(response, "reasoning")}\n\n처리 이력\n" + string.Join("\n", history);
    }
}
