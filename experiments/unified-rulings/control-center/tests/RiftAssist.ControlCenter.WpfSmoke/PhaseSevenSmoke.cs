using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;
using RiftAssist.ControlCenter;
using RiftAssist.ControlCenter.Core;

internal static class PhaseSevenSmoke
{
    public static void Run(Application app,Window owner)
    {
        var root=Path.Combine(Path.GetTempPath(),"riftassist-phase7-ui-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(root);
        var revision="manual:1";IncidentInput Input()=>new("12345678-1234-1234-1234-123456789abc","local-manual",revision,true,"합성 질문",new string('b',64),"합성 오류","합성 기대","합성 메모","합성 근거","mock","synthetic");
        var settings=new RealRepairOptionsStore(Path.Combine(root,"settings"));var store=new RealRepairStore(Path.Combine(root,"jobs"),new WindowsRealRepairProtection());var github=new GitHub();var cli=new Codex();var work=new Workspace(root);
        var window=new RealRepairWindow(owner,Input(),()=>Task.FromResult(Input()),settings,store,"synthetic-node.exe",_=>new(store,github,cli,_=>work),_=>Task.FromResult(new ToolReadiness("0.162.0",true,true,true,"synthetic readiness")));
        void Approve(bool yes){_=app.Dispatcher.BeginInvoke(new Action(()=>{var preview=app.Windows.OfType<IncidentPreview>().Single();Check(!preview.Body.Text.Contains(new string('b',64),StringComparison.Ordinal));if(yes)preview.Approve.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));else preview.Close();}),DispatcherPriority.ApplicationIdle);}
        try{
            window.Show();Idle(app);Check(window.EnableExecution.IsChecked==false&&window.EnablePublication.IsChecked==false&&cli.Calls==0&&github.Writes==0);
            window.CheckAsync().GetAwaiter().GetResult();Check(window.Status.Text.Contains("synthetic readiness",StringComparison.Ordinal));
            window.StartAsync().GetAwaiter().GetResult();Check(cli.Calls==0&&window.Status.Text.Contains("비활성",StringComparison.Ordinal));
            window.EnableExecution.IsChecked=true;Approve(false);window.StartAsync().GetAwaiter().GetResult();Check(cli.Calls==0);
            Approve(true);window.StartAsync().GetAwaiter().GetResult();Check(cli.Calls==1&&github.Writes==0&&window.Result.Text.Contains("synthetic diff",StringComparison.Ordinal));
            window.PublishAsync().GetAwaiter().GetResult();Check(github.Writes==0);
            window.EnablePublication.IsChecked=true;
            _=app.Dispatcher.BeginInvoke(new Action(()=>{var confirm=app.Windows.OfType<ActionConfirmation>().Single();confirm.ConfirmButton.RaiseEvent(new RoutedEventArgs(Button.ClickEvent));}),DispatcherPriority.ApplicationIdle);
            window.PublishAsync().GetAwaiter().GetResult();Check(github.Writes==1&&window.Result.Text.Contains("/pull/123",StringComparison.Ordinal));
            window.RequeryAsync().GetAwaiter().GetResult();Check(github.Writes==1);
            revision="manual:2";window.StartAsync().GetAwaiter().GetResult();Check(cli.Calls==1&&window.Status.Text.Contains("바뀌",StringComparison.Ordinal));
            Check(new RealRepairStore(store.Root,new WindowsRealRepairProtection()).List().Single().State=="published");
            // Reopening a current report must not authorize a prior-revision repair from its history.
            var old=store.List().Single();store.Save(old with{State="review"},old.Revision);
            var reopened=new RealRepairWindow(owner,Input(),()=>Task.FromResult(Input()),settings,store,"synthetic-node.exe",_=>new(store,github,cli,_=>work),_=>Task.FromResult(new ToolReadiness("0.162.0",true,true,true,"synthetic")));
            try{reopened.Show();reopened.EnablePublication.IsChecked=true;
                _=app.Dispatcher.BeginInvoke(new Action(()=>{foreach(var dialog in app.Windows.OfType<ActionConfirmation>().ToArray())dialog.Close();}),DispatcherPriority.ApplicationIdle);
                reopened.PublishAsync().GetAwaiter().GetResult();Check(github.Writes==1&&reopened.Status.Text.Contains("바뀌",StringComparison.Ordinal));
            }finally{reopened.Close();}
            Check(!window.Result.Text.Contains(new string('b',64),StringComparison.Ordinal));
        }finally{window.Close();Directory.Delete(root,true);}
    }
    private static void Idle(Application app)=>app.Dispatcher.Invoke(()=>{},DispatcherPriority.ApplicationIdle);
    private static void Check(bool value){if(!value)throw new InvalidOperationException("Phase seven native UI assertion failed");}
    private sealed class Workspace(string root):IRepairWorkspace
    {public string Source=>root;public string Before=>root;public string TestBefore=>root;public string Verify=>root;public string Temp=>root;public Task<Dictionary<string,string>> CreateAsync(RepositorySource r,CancellationToken c)=>Task.FromResult(new Dictionary<string,string>());public Task PrepareTestsAsync(RealRepairJob j,CancellationToken c)=>Task.CompletedTask;public Task<WorkspaceResult> InspectAsync(RealRepairJob j,CancellationToken c)=>Task.FromResult(new WorkspaceResult([new(RepairScope.Prefix+"releases/v0.2.0/src/synthetic.js","// synthetic","before","after")],"synthetic diff","stable"));}
    private sealed class Codex:IRealCodex
    {public int Calls;public Task<IsolationTicket> ProbeAsync(IRepairWorkspace w,CancellationToken c)=>Task.FromResult(new IsolationTicket(w.Source,"synthetic",DateTimeOffset.UtcNow.AddMinutes(5)));public Task<CodexRunResult> ExecuteAsync(IRepairWorkspace w,IsolationTicket t,PrivacyPacket p,Action<string> progress,CancellationToken c){Calls++;progress("synthetic event");return Task.FromResult(new CodexRunResult("synthetic result",1,1));}public Task<RealTestReport> TestAsync(IRepairWorkspace w,RealRepairJob j,CancellationToken c)=>Task.FromResult(new RealTestReport(true,"synthetic tests passed"));}
    private sealed class GitHub:IRepairGitHub
    {public int Writes;private bool published;public Task<RepositorySource> PrepareAsync(CancellationToken c)=>Task.FromResult(new RepositorySource(new('a',40),new('b',40),"synthetic-user",123,[]));public Task<string> PublishAsync(RealRepairJob j,Action<string> p,CancellationToken c){Writes++;published=true;return Task.FromResult("https://github.com/"+RepairScope.Repository+"/pull/123");}public Task<string?> FindPrAsync(RealRepairJob j,CancellationToken c)=>Task.FromResult(published?"https://github.com/"+RepairScope.Repository+"/pull/123":null);public Task<bool> CanResumeAsync(RealRepairJob j,CancellationToken c)=>Task.FromResult(true);}
}
