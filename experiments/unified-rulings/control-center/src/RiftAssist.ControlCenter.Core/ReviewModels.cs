using System.Text.Json;

namespace RiftAssist.ControlCenter.Core;

public static class JsonView
{
    public static JsonElement Field(this JsonElement value, string key) => value.ValueKind == JsonValueKind.Object && value.TryGetProperty(key, out var field) ? field : default;
    public static string Text(this JsonElement value) => value.ValueKind == JsonValueKind.String ? value.GetString()! : "";
    public static int Number(this JsonElement value) => value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var n) ? n : 0;
    public static string Pretty(this JsonElement value) => value.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null ? "—" : JsonSerializer.Serialize(value,
        new JsonSerializerOptions(ProtocolJson.Options) { WriteIndented = true });
    public static IEnumerable<JsonElement> Rows(this JsonElement value) => value.ValueKind == JsonValueKind.Array ? value.EnumerateArray() : [];
}
public sealed record ReviewWarning(string Code, string Severity)
{
    public string Display => $"{(Severity == "error" ? "차단" : "검토")}: {Code}";
}
public sealed class ReviewItem
{
    public JsonElement Raw { get; }
    public bool Selected { get; set; }
    public string Id => Raw.Field("id").Text();
    public string CardId => Raw.Field("cardId").Text();
    public string Type => Raw.Field("type").Text();
    public string TypeLabel => Type == "data" ? "카드 데이터" : "번역 후보";
    public string Fingerprint => Raw.Field("fingerprint").Text();
    public string Decision => Raw.Field("decision").Field("decision").Text();
    public string DecisionLabel => Decision switch { "approve" => "승인", "reject" => "거절", "hold" => "보류", _ => "미검토" };
    public string DecisionReason => Raw.Field("decision").Field("reason").Text();
    public string Title => First(Raw.Field("after").Field("nameEn").Text(), Raw.Field("before").Field("nameEn").Text(), CardId);
    public string Kinds => string.Join(" · ", Raw.Field("kinds").Rows().Select(k => k.Text() switch {
        "new-card" => "신규", "english-changed" => "영문 변경", "errata-changed" => "에라타", "translation-proposal" => "AI/모의 번역",
        "official-korean-added" => "한국어 추가(모의)", "official-korean-changed" => "한국어 변경(모의)", "official-korean-removed" => "한국어 제거(모의)",
        "release-status-changed" => "출시/공개 상태", "missing-suspected" => "누락 의심·보존", "returned" => "재등장", "metadata-changed" => "메타데이터", var text => text }));
    public IReadOnlyList<ReviewWarning> Warnings => Raw.Field("warnings").Rows().Select(w => new ReviewWarning(w.Field("code").Text(), w.Field("severity").Text())).ToArray();
    public bool CanApprove => Warnings.All(w => w.Severity != "error");
    public string WarningText => Warnings.Count == 0 ? "자동검사 오류 없음 · 관리자 의미 검토 필요" : string.Join(Environment.NewLine, Warnings.Select(w => w.Display));
    public string BeforeEnglish => First(Raw.Field("previousEnglish").Field("text").Text(), Raw.Field("before").Field("textEn").Text(), "—");
    public string AfterEnglish => First(Raw.Field("after").Field("textEn").Text(), "—");
    public string BeforeKorean => First(Raw.Field("previousTranslation").Field("textKo").Text(), Raw.Field("before").Field("textKo").Text(), Raw.Field("before").Field("sourceKorean").Field("text").Text(), "—");
    public string AfterKorean => First(Raw.Field("proposal").Field("textKo").Text(), Raw.Field("after").Field("textKo").Text(), Raw.Field("after").Field("sourceKorean").Field("text").Text(), "—");
    public string BeforeMetadata => Describe(Raw.Field("before"));
    public string AfterMetadata => Describe(Raw.Field("after")) + Environment.NewLine + "번역 출처/검증:" + Environment.NewLine
        + Raw.Field("proposal").Pretty();
    public ReviewItem(JsonElement raw) { Raw = raw.Clone(); }
    private static string First(params string[] values) => values.First(v => !string.IsNullOrEmpty(v));
    private static string Describe(JsonElement card) => card.ValueKind != JsonValueKind.Object ? "기존 카드 없음" :
        $"영문 이름: {card.Field("nameEn").Text()}\n한국어 이름: {card.Field("nameKo").Text()}\n상태: {card.Field("status").Text()}\n"
        + $"비용: {card.Field("cost").Pretty()}\n능력치: {card.Field("stats").Pretty()}\n기호: {card.Field("symbols").Pretty()}\n키워드: {card.Field("keywordsEn").Pretty()}\n"
        + $"출처: {card.Field("source").Pretty()}\n공개 근거: {card.Field("publication").Pretty()}\n에라타: {card.Field("errata").Text()}";
}
public sealed record BundleSummary(string Id, string CandidateId, int Revision, string Status, int ItemCount)
{
    public override string ToString() => $"{CandidateId[..Math.Min(22, CandidateId.Length)]}… · {ItemCount}항목 · {Status}";
    public static BundleSummary From(JsonElement value) => new(value.Field("id").Text(), value.Field("candidateId").Text(), value.Field("revision").Number(), value.Field("status").Text(), value.Field("itemCount").Number());
}
public sealed record ReviewPackage(string Id, string Digest, string ReleaseId, string BaseReleaseId, int ValidRevision, int Approved, int Excluded)
{
    public string Description => $"{ReleaseId}\n복귀 기준: {BaseReleaseId}\n승인 {Approved} / 제외 {Excluded}\nmanifest SHA-256: {Digest}";
    public override string ToString() => $"승인 {Approved} / 제외 {Excluded} · {ReleaseId[..Math.Min(24, ReleaseId.Length)]}…";
    public static ReviewPackage From(JsonElement value) => new(value.Field("id").Text(), value.Field("digest").Text(), value.Field("releaseId").Text(), value.Field("baseReleaseId").Text(),
        value.Field("validAtRevision").Number(), value.Field("approved").Rows().Count(), value.Field("excluded").Rows().Count());
}
public sealed record PendingIntent(string Id, string Action, string From, string Target, string Reason)
{
    public string Description => $"{Action}: {From} → {Target}\n사유: {Reason}\n의도 ID: {Id}";
    public static PendingIntent Read(JsonElement value) => new(value.Field("id").Text(), value.Field("action").Text(), value.Field("from").Text(), value.Field("target").Text(), value.Field("reason").Text());
}
public sealed record ReviewSnapshot(string BundleId, int Revision, string Status, string StaleReason, int Total, int Offset,
    IReadOnlyList<ReviewItem> Items, IReadOnlyList<ReviewPackage> Packages, IReadOnlyList<PendingIntent> PendingIntents)
{
    public static ReviewSnapshot Read(JsonElement value, int offset) => new(value.Field("bundleId").Text(), value.Field("revision").Number(), value.Field("status").Text(), value.Field("staleReason").Text(), value.Field("total").Number(), offset,
        value.Field("items").Rows().Select(i => new ReviewItem(i)).ToArray(),
        value.Field("packages").ValueKind == JsonValueKind.Object ? value.Field("packages").EnumerateObject().Select(p => ReviewPackage.From(p.Value)).ToArray() : [],
        value.Field("pendingIntents").Rows().Select(PendingIntent.Read).ToArray());
}
public sealed record StagePlan(string BundleId, int Revision, IReadOnlyList<string> ExcludedIds, int ApprovedCount)
{
    public string Description => $"승인 {ApprovedCount}개 항목만 구성합니다.\n미승인 {ExcludedIds.Count}개는 기존 자료 유지 또는 신규 제외입니다.\n" + string.Join(Environment.NewLine, ExcludedIds);
}
public sealed record AuditRow(int Sequence, string Actor, string At, string Type, string Reason, string RequestId)
{
    public static AuditRow Read(JsonElement v)
    {
        var reason = v.Field("reason").Text(); var decisions = v.Field("decisions");
        // Bulk decision reasons are nested per item in the existing audit contract.
        if (reason.Length == 0 && decisions.ValueKind == JsonValueKind.Object)
            reason = string.Join(" · ", decisions.EnumerateObject().Select(p => $"{p.Name}: {p.Value.Field("decision").Text()} — {p.Value.Field("reason").Text()}"));
        return new(v.Field("sequence").Number(), v.Field("actor").Text(), v.Field("at").Text(), v.Field("type").Text(), reason, v.Field("requestId").Text());
    }
}
public sealed record FinalApproval(string TypedPhrase, string Reason, bool RisksAcknowledged)
{
    public void Validate(string action)
    {
        var required = action switch { "activate" => "개발 자료 활성화", "rollback" => "개발 자료 되돌리기", "recover" => "복구 상태 확인", _ => throw new ControlException("client-action") };
        if (TypedPhrase != required || !RisksAcknowledged) throw new ControlException("client-confirmation-required");
        ReviewCoordinator.ValidateReason(Reason);
    }
}
public sealed record FeatureModule(string Id, string Title, string State, string Description);
public static class FeatureCatalog
{
    public static IReadOnlyList<FeatureModule> Modules { get; } = [
        new("cards", "카드 검토", "로컬 MVP", "합성 카드 검토·승인·감사"),
        new("manager", "기존 관리자 전체 기능", "확장 예정", "서버/AI 설정 통합은 아직 연결하지 않았습니다."),
        new("azure", "Azure 원격 관리", "미연결", "원격 주소·인증·서버 제어는 구현하지 않았습니다."),
        new("usage", "API 비용·사용량", "미연결", "실제 과금/사용량을 조회하지 않습니다."),
        new("reports", "오류 제보 분석", "미연결", "운영 사용자 기록을 읽지 않습니다."),
        new("codex", "Codex 수정 요청", "미연결", "자동 코드 변경/메시지 전송은 없습니다."),
        new("github", "GitHub 배포·롤백", "미연결", "push/merge/운영 배포를 실행하지 않습니다.") ];
}
