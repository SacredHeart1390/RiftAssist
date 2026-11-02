using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;
using RiftAssist.ControlCenter;
using RiftAssist.ControlCenter.Core;

internal static class PhaseFiveSmoke
{
    public static void Run(Application app)
    {
        var root=Path.Combine(Path.GetTempPath(),"riftassist-phase5-ui-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(root);
        OperationsView? view=null;Window? window=null;
        try{
            var store=new ManualReportStore(Path.Combine(root,"reports"),new WindowsReportProtection());
            OperationsModel Make()=>new(settingsStore:new SshProfileStore(Path.Combine(root,"Settings")),manualReportStore:store);
            var model=Make();view=new OperationsView(model);window=new Window{Content=view,Width=1250,Height=900};window.Show();Idle(app);
            Check(!((Button)view.FindName("ProductionStartButton")).IsEnabled&&!model.ProductionChangesEnabled);
            var draft=new ManualReportDraft{Title="합성 대면 제보",Category="번역",Question="합성 질문",ActualAnswer="합성 AI 답변",Error="합성 오류",Expected="합성 올바른 판정",RuleEvidence="합성 규칙 근거",OccurredVersion="synthetic",Channel="대면",MemorySummary=true};
            var editor=new ManualReportEditor(window,draft);editor.Show();Idle(app);
            ((TextBox)editor.FindName("TitleInput")).Text="합성 편집 제목";Idle(app);Check(editor.Draft.Title=="합성 편집 제목");editor.Close();
            model.Reports.Add(new("12345678-1234-1234-1234-123456789abc","ruling","received","","", "Azure · 운영"));
            model.SaveManualReport(editor.Draft);Check(model.Reports.Count==2);var row=model.Reports.Single(r=>r.Source=="수동 · 로컬");Check(row.Title=="합성 편집 제목");
            ((TabControl)view.FindName("OperationsTabs")).SelectedIndex=3;((DataGrid)view.FindName("ReportsGrid")).SelectedItem=row;Idle(app);
            Check(model.ReportDetail.Contains("합성 AI 답변",StringComparison.Ordinal)&&model.ReportDetail.Contains("기억에 근거한 요약",StringComparison.Ordinal));
            var first=model.ReadManualReport(row);model.SaveManualReport(first.Draft with{Status="triaged",AdminNote="합성 처리 메모"},first.Id,first.Revision);
            Check(model.LocalEvents.All(e=>!e.Contains("합성 처리 메모",StringComparison.Ordinal)&&!e.Contains("합성 AI 답변",StringComparison.Ordinal)));
            // Recreate model/store as a new launch; persistent DPAPI, not the in-memory collection.
            var reopened=new OperationsModel(settingsStore:new SshProfileStore(Path.Combine(root,"Settings")),manualReportStore:new ManualReportStore(Path.Combine(root,"reports"),new WindowsReportProtection()));
            var saved=reopened.Reports.Single(r=>r.Source=="수동 · 로컬");Check(saved.Status=="triaged"&&saved.Revision==2);
            reopened.SelectReportAsync(saved).GetAwaiter().GetResult();Check(reopened.ReportDetail.Contains("합성 처리 메모",StringComparison.Ordinal));
            reopened.DisposeAsync().AsTask().GetAwaiter().GetResult();
            Check(view.FindName("NewManualReportButton")is Button&&view.FindName("EditManualReportButton")is Button);
            using var confirmation=new DisposableWindow(new ActionConfirmation(window,"합성 앱 중지","격리 개발 관리자",AdminChangeContract.Plan("stop",new{}).Impact));
            confirmation.Value.Show();Idle(app);Check(confirmation.Value.CancelButton.IsDefault&&confirmation.Value.ConfirmButton.Content.ToString()=="예, 실행");
        }finally{window?.Close();view?.DisposeAsync().AsTask().GetAwaiter().GetResult();Directory.Delete(root,true);}
    }
    private static void Idle(Application app)=>app.Dispatcher.Invoke(()=>{},DispatcherPriority.ApplicationIdle);
    private static void Check(bool pass){if(!pass)throw new InvalidOperationException("Phase five native UI assertion failed");}
    private sealed class DisposableWindow(ActionConfirmation window):IDisposable{public ActionConfirmation Value=>window;public void Dispose()=>window.Close();}
}
