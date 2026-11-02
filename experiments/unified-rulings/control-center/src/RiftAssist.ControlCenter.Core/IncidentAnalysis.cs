using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace RiftAssist.ControlCenter.Core;

public sealed record IncidentInput(string ReportId,string Source,string Revision,bool MemorySummary,string Question,string Answer,string Error,string Expected,string AdminNote,string Evidence,string Cards,string AppVersion)
{
    public static IncidentInput Manual(ManualReportDocument d)=>new(d.Id,"local-manual","manual:"+d.Revision,d.Draft.MemorySummary,d.Draft.Question,d.Draft.ActualAnswer,d.Draft.Error,d.Draft.Expected,d.Draft.AdminNote,d.Draft.RuleEvidence,"미입력",d.Draft.OccurredVersion);
    public static IncidentInput Api(JsonElement row,string source)
    {
        var id=row.Field("id").Text();AdminReadPolicy.Require(HttpMethod.Get,"/api/reports/"+id);if(source is not("azure-api" or "synthetic-development"))throw new ControlException("client-analysis-stale");_=RemoteAdminData.Detail(row,id);
        string Clip(string value,int max)=>value.Length<=max?value:value[..max]+"\n[길이 제한으로 생략됨]";
        string Text(JsonElement p,string key,int max=10000){var s=p.Field(key);return s.ValueKind==JsonValueKind.String?Clip(s.GetString()!,max):"";}
        var snapshot=row.Field("snapshot");var q=snapshot.Field("question");var response=snapshot.Field("response");var content=row.Field("content");
        var question=q.ValueKind==JsonValueKind.String?Clip(q.GetString()!,10000):Text(q,"text");
        var input=new IncidentInput(id,source,"",false,question,Text(response,"recommendation",30000)+"\n"+Text(response,"reasoning",10000),content.ValueKind==JsonValueKind.String?content.GetString()!:Text(content,"description",5000),Text(content,"expected",3000),
            string.Join("\n",row.Field("history").Rows().TakeLast(5).Select(h=>Text(h,"note",1000))),
            string.Join("\n",response.Field("evidence").Rows().Take(12).Select(e=>Text(e,"id",120)+" · "+Text(e,"version",120)+" · "+Text(e,"officialTextEn",1000))),
            string.Join("\n",response.Field("cards").Rows().Take(8).Select(c=>Text(c,"id",120)+" · "+Text(c,"nameEn",200)+" · authority="+Text(c,"authority",80))),
            "발생 앱 버전 미기록; knowledge="+Text(response,"knowledgeReleaseId",120)+"; cards="+Text(response,"cardCatalogVersion",120));
        // v017 has no revision counter. Hash the allowlisted snapshot, not session/request identifiers.
        return input with{Revision="api:"+PrivacyPacket.Hash(JsonSerializer.Serialize(new{input,status=row.Field("status").Text(),updated=row.Field("updated").ValueKind==JsonValueKind.Number?row.Field("updated").GetRawText():"미기록"}))};
    }
    public PrivacyPacket Preview()=>PrivacyPacket.Create(JsonSerializer.Serialize(new{source=Source,memorySummary=MemorySummary,question=Question,actualAnswer=Answer,reportedError=Error,expected=Expected,adminNote=AdminNote,reportedRuleEvidence=Evidence,relatedCards=Cards,occurredVersion=AppVersion},new JsonSerializerOptions(ProtocolJson.Options){WriteIndented=true}));
}
public sealed record PrivacyPacket(string Text,string Digest,int Redactions)
{
    public static string Hash(string s)=>Convert.ToHexStringLower(SHA256.HashData(ProtocolJson.Utf8.GetBytes(s)));
    public static PrivacyPacket Create(string input)
    {
        if(input.Length>180000)throw new ControlException("client-analysis-limit");var count=0;
        string Replace(string text,string pattern)=>Regex.Replace(text,pattern,_=>{count++;return "[제거됨]";},RegexOptions.IgnoreCase|RegexOptions.CultureInvariant,TimeSpan.FromSeconds(1));
        // JSON escaped newlines are covered as well as plain PEM lines.
        var text=Replace(input,@"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)");
        text=Replace(text,@"\b(?:sk-(?:proj-|admin-)?[\w-]{12,}|RGAPI-[\w-]{12,}|gh[pousr]_[\w]{12,}|github_pat_[\w]{12,}|eyJ[\w-]+\.[\w-]+\.[\w-]+)\b");
        text=Replace(text,@"\b[a-f0-9]{64}\b");
        text=Replace(text,"(?:[\\\"]?(?:cookie|set-cookie|authorization|session(?:[_-]?id)?|request[_-]?id|admin[_-]?key|manager[_-]?key|api[_-]?key|token|password|owner|user[_-]?id)[\\\"]?\\s*[:=]\\s*)(?:[\\\"][^\\\"\\r\\n]*[\\\"]|[^\\s,;}]+)");
        text=Replace(text,@"[\w.+-]+@[\w.-]+\.[a-z]{2,}");
        text=Replace(text,@"\b(?:\d{1,3}\.){3}\d{1,3}\b|\b\d{8}-\d{4}-\d{4}-\d{4}-\d{12}\b|\b[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\b");
        text=Replace(text,@"(?<!\d)(?:\+?82[ -]?)?0?1[016789][ -]?\d{3,4}[ -]?\d{4}(?!\d)");
        text=Replace(text,@"https?://[^\s""<>\\]+|[A-Z]:[\\/][^\r\n""<>]*|/(?:home|Users|root|workspace|var|etc|tmp)/[^\s""<>\\]*|[^\s""<>\\]*\.(?:sqlite(?:-wal|-shm)?|pem|key|db)\b");
        _=ProtocolJson.Utf8.GetByteCount(text);return new(text,Hash(text),count);
    }
}
public sealed record AnalysisConsent(string Destination,string Digest)
{
    public static AnalysisConsent Approve(string destination,PrivacyPacket packet)=>new(destination,packet.Digest);
    public void Require(string destination,PrivacyPacket packet){if(Destination!=destination||Digest!=packet.Digest)throw new ControlException("client-analysis-consent");}
}
public sealed record AnalysisCost(string Bucket,string Provider,int ExternalCalls,long? InputTokens,long? OutputTokens,decimal? Amount,string Currency);
public sealed record IncidentFinding(string Provider,string Reproduction,string Facts,string Hypotheses,string CauseCategories,string CorrectRulingCandidate,string CodeCandidates,string Confidence,string Unknowns,string V017Urgency,string V020Improvements,string Retrieval,AnalysisCost Cost)
{
    public IncidentFinding Redacted()
    {
        string Safe(string value)=>PrivacyPacket.Create(value).Text;
        return this with{Provider=Safe(Provider),Reproduction=Safe(Reproduction),Facts=Safe(Facts),Hypotheses=Safe(Hypotheses),CauseCategories=Safe(CauseCategories),CorrectRulingCandidate=Safe(CorrectRulingCandidate),CodeCandidates=Safe(CodeCandidates),Confidence=Safe(Confidence),Unknowns=Safe(Unknowns),V017Urgency=Safe(V017Urgency),V020Improvements=Safe(V020Improvements),Retrieval=Safe(Retrieval),Cost=Cost with{Provider=Safe(Cost.Provider)}};
    }
    public string Display()=> $"분석 방식: {Provider}\n재현 가능 여부: {Reproduction}\n\n근거/관찰\n{Facts}\n\n추정 (확정 원인 아님)\n{Hypotheses}\n원인 분류 후보: {CauseCategories}\n\n공식 규칙 기반 판정 후보\n{CorrectRulingCandidate}\n\n코드·데이터·프롬프트 후보\n{CodeCandidates}\n\n신뢰도: {Confidence}\n미확인: {Unknowns}\n\nv0.1.7 긴급 후보: {V017Urgency}\nv0.2.0 개선 후보: {V020Improvements}\n\n로컬 검색 메타데이터\n{Retrieval}\n\n비용: {Cost.Bucket} / {Cost.Provider} · 외부 호출 {Cost.ExternalCalls} · 서비스 API 비용과 별도 (금액 미추정)";
}
public interface IIncidentAnalyzer { Task<IncidentFinding> AnalyzeAsync(PrivacyPacket packet,CancellationToken cancellation); }
public static class IncidentAnalysisPolicy
{
    public static bool ExternalAnalysisEnabled=>false;
    public static bool ExternalCodexEnabled=>false;
    public static void RequireExternal()=>throw new ControlException("client-analysis-external-disabled");
    public static IncidentFinding Conservative(PrivacyPacket packet,string retrieval)=>new("로컬 예비 분석 · LLM 미호출","미실행 · 원래 환경/해당 버전 재현 필요",
        "제보자가 제공한 관찰만 포함합니다. 기억 요약·기대 판정·과거 응답 근거는 현재 공식 판정의 증명이 아닙니다.",
        "검색 누락, 잘못된 근거 선택, 카드/번역 버전, AI 추론 또는 코드 처리 오류를 각각 재현 테스트로 구분해야 합니다.",
        "규칙 검색 실패 / 잘못된 근거 선택 / 카드 데이터 오류 / 번역 오류 / AI 추론 오류 / 코드 결함 (모두 미확정)",
        "보류 · 검증된 현행 공식 규칙/카드 원문이 연결되지 않았으므로 정답을 생성하지 않습니다. 기대 판정은 제보자의 주장으로 취급합니다.",
        "src/retrieval.js · src/answer-quality.js · src/answer-policy.js · src/cards.js · src/card-access.js · src/terminology-ko.js · src/server.js (정적 조사 후보, 수정 필요 확정 아님)",
        "판정 신뢰도 평가 불가", "정확한 재현 입력, 발생 앱 버전, 승인된 현행 자료·카드/번역 버전·검색 trace 확인 필요. 개인정보 자동 제거는 완전하지 않으므로 직접 미리보기를 검토하세요.",
        "미결정 · 실제 서비스 영향/재현 확인 후 별도 긴급 수정 승인 필요", "출처/버전·검색 누락 trace와 재현/회귀 테스트를 검토 후 반영",retrieval,new("analysis-local","offline",0,null,null,null,"미산정"));
}
