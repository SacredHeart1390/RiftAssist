using RiftAssist.ControlCenter.Core;

namespace RiftAssist.ControlCenter;

public sealed partial class OperationsModel
{
    public string ProductionControlNotice => "운영 변경은 이번 버전에서 차단됩니다. 시작/중지/재시작은 systemd가 아닌 기존 관리자 앱 제어 계약입니다. 별도 활성화 승인과 프로세스 소유 관계 확인이 필요합니다.";
    public bool ProductionChangesEnabled => false;
    private string manualReportFeedback = "로컬 수동 제보 · 암호화 저장";
    public string ManualReportFeedback { get => manualReportFeedback; private set { manualReportFeedback = value; Changed(); } }
    private void TryReloadManualReports() { try { ReloadManualReports(); } catch (Exception e) { ManualReportFeedback = UserErrors.Explain(e); Log("manual-list", "client-manual-protection"); } }
    public void ReloadManualReports()
    {
        var rows=manualReports.List(); // Fail before altering a good list if decrypt/validation fails.
        foreach(var old in Reports.Where(r=>r.Source=="수동 · 로컬").ToArray())Reports.Remove(old);
        ManualReportFeedback = $"로컬 암호화 수동 제보 {rows.Count}개 · Azure DB에는 저장하지 않습니다.";
        foreach(var d in rows)Reports.Add(new(d.Id,d.Draft.Category,d.Draft.Status,"",d.CreatedAt.ToLocalTime().ToString("yyyy-MM-dd HH:mm"),"수동 · 로컬",d.Draft.Title,d.Revision));
    }
    public ManualReportDocument ReadManualReport(OperationsReport report)
    { if(report.Source!="수동 · 로컬")throw new ControlException("client-manual-validation");return manualReports.Read(report.Id); }
    public void SaveManualReport(ManualReportDraft draft,string? id=null,int? revision=null)
    {
        var saved=manualReports.Save(draft,id,revision);TryReloadManualReports();ReportDetail=saved.Detail();
        Log("manual-report",$"로컬 제보 {saved.Id} · r{saved.Revision} 저장 완료");
    }
    private void ReloadChangeAudit()
    {
        if(changeControl is null)return;
        foreach(var item in changeControl.Audit.Where(a=>a.Outcome!="started").TakeLast(1))
            Log("admin-change",$"{item.OperationId} · {item.Action} · {item.Outcome} · {item.Reason}");
    }
}
