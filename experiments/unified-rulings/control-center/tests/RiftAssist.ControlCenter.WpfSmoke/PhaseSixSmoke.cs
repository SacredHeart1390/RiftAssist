using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;
using RiftAssist.ControlCenter;
using RiftAssist.ControlCenter.Core;

internal static class PhaseSixSmoke
{
    public static void Run(Application app,Window owner)
    {
        var root=Path.Combine(Path.GetTempPath(),"riftassist-phase6-ui-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(root);
        var ledger=new AnalysisLedger(root,new WindowsAnalysisProtection());var revision="manual:1";var copied=new List<string>();
        IncidentInput Input()=>new("12345678-1234-1234-1234-123456789abc","local-manual",revision,true,"합성 질문",new string('b',64),"합성 오류","합성 기대","합성 메모","미검증 합성 근거","미입력","synthetic");
        var window=new IncidentAnalysisWindow(owner,Input(),()=>Task.FromResult(Input()),ledger,new Analyzer(),new Worker(),copied.Add);
        void ApprovePreview(bool approve){_ = app.Dispatcher.BeginInvoke(new Action(()=>{
            var preview=app.Windows.OfType<IncidentPreview>().Single();Check(!preview.Body.Text.Contains(new string('b',64),StringComparison.Ordinal));
            if(approve)preview.Approve.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));else preview.Close();
        }),DispatcherPriority.ApplicationIdle);}
        try{
            window.Show();Idle(app);Check(!ledger.List().Any()&&copied.Count==0);
            ApprovePreview(true);window.AnalyzeAsync().GetAwaiter().GetResult();Idle(app);
            Check(window.Current is not null&&window.Result.Text.Contains("memorySummary",StringComparison.Ordinal)&&window.Result.Text.Contains("합성",StringComparison.Ordinal));
            ApprovePreview(false);window.CopyAsync().GetAwaiter().GetResult();Check(copied.Count==0);
            ApprovePreview(true);window.CopyAsync().GetAwaiter().GetResult();Check(copied.Count==1&&copied[0].Contains("main 병합",StringComparison.Ordinal));
            _=app.Dispatcher.BeginInvoke(new Action(()=>app.Windows.OfType<ActionConfirmation>().Single().ConfirmButton.RaiseEvent(new RoutedEventArgs(Button.ClickEvent))),DispatcherPriority.ApplicationIdle);
            window.RunMockAsync().GetAwaiter().GetResult();Idle(app);Check(window.Current!.Jobs.Any(j=>j.State=="ready-for-review")&&window.Current.Jobs.Any(j=>j.State=="prompt-copied"));
            Check(window.Result.Text.Contains("synthetic/ruling.cjs",StringComparison.Ordinal)&&window.Result.Text.Contains("모의 PR",StringComparison.Ordinal));
            revision="manual:2";window.CopyAsync().GetAwaiter().GetResult();Check(copied.Count==1&&window.Status.Text.Contains("바뀌",StringComparison.Ordinal));
            var reopened=new AnalysisLedger(root,new WindowsAnalysisProtection());Check(reopened.List().Single().Jobs.Length==2);
            Check(!window.Result.Text.Contains(new string('b',64),StringComparison.Ordinal));
        }finally{window.Close();Directory.Delete(root,true);}
    }
    private static void Idle(Application app)=>app.Dispatcher.Invoke(()=>{},DispatcherPriority.ApplicationIdle);
    private static void Check(bool pass){if(!pass)throw new InvalidOperationException("Phase six native UI assertion failed");}
    private sealed class Analyzer:IIncidentAnalyzer
    {public Task<IncidentFinding> AnalyzeAsync(PrivacyPacket packet,CancellationToken c)=>Task.FromResult(IncidentAnalysisPolicy.Conservative(packet,"synthetic mock metadata") with{Provider="mock-response · LLM 미호출"});}
    private sealed class Worker:ISyntheticRepairWorker
    {public Task<SyntheticRepairResult> RunAsync(string root,CancellationToken c)=>Task.FromResult(new SyntheticRepairResult("synthetic diff",["synthetic/ruling.cjs"],"합성 테스트 결과","실제 코드 수정 미실행"));}
}
