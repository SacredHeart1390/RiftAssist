using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Threading;
using RiftAssist.ControlCenter;
using RiftAssist.ControlCenter.Core;

internal static class PhaseEightSmoke
{
    public static void Run(Application app,Window owner)
    {
        var dir=Path.Combine(Path.GetTempPath(),"riftassist-phase8-ui-"+Guid.NewGuid().ToString("N"),"DeploymentLabs");var calls=new Client();bool yes=false;int confirmations=0;
        var view=new DeploymentView(dir,root=>{Directory.CreateDirectory(root);return calls;},()=>ProtocolJson.Element(new{digest="synthetic"}),()=>Task.FromResult(Array.Empty<DeploymentCandidate>()),_=>Task.FromResult(ProtocolJson.Element(new{})),(_,_)=>{confirmations++;return yes;});
        var w=new Window{Owner=owner,Content=view,Width=1200,Height=760,Title="Phase8 synthetic UI"};
        try{w.Show();app.Dispatcher.Invoke(()=>{},DispatcherPriority.ApplicationIdle);Check(!view.Production.IsEnabled&&calls.Writes==0);
            view.InitializeAsync().GetAwaiter().GetResult();Check(calls.Writes==0);yes=true;view.InitializeAsync().GetAwaiter().GetResult();Check(calls.Writes==1);
            var before=confirmations;view.RefreshAsync().GetAwaiter().GetResult();view.PlanAsync().GetAwaiter().GetResult();Check(confirmations==before&&view.Result.Text.Contains("synthetic",StringComparison.Ordinal));
            yes=false;view.DeployAsync().GetAwaiter().GetResult();Check(calls.Writes==1);yes=true;view.DeployAsync().GetAwaiter().GetResult();Check(calls.Writes==2&&view.Status.Text.Contains("completed",StringComparison.Ordinal));
            view.History.SelectedIndex=0;view.RollbackAsync().GetAwaiter().GetResult();Check(calls.Writes==3&&view.Status.Text.Contains("rolled-back",StringComparison.Ordinal));Check(!view.Production.IsEnabled);
        }finally{w.Close();if(Directory.Exists(Path.GetDirectoryName(dir)))Directory.Delete(Path.GetDirectoryName(dir)!,true);}
    }
    private static void Check(bool ok){if(!ok)throw new InvalidOperationException("phase8 WPF assertion");}
    private sealed class Client:IDeploymentClient
    {
        public int Writes;private readonly string id=Guid.NewGuid().ToString("D");private bool deployed;
        private JsonElement Status()=>ProtocolJson.Element(new{route=new{version=deployed?"v0.3.0":"v0.1.7",generation=1},operations=deployed?new[]{new{id,kind="deploy",state="completed",backupId=id}}:Array.Empty<object>(),backups=Array.Empty<object>()});
        public Task<JsonElement> CallAsync(string method,object p,CancellationToken c,Action<string>? progress=null){return Task.FromResult(method switch{
            "init"=>Init(),"status" or "reconcile"=>Status(),"plan"=>ProtocolJson.Element(new{id,kind="deploy",digest="synthetic",target=DeploymentPolicy.Target}),"deploy"=>Deploy(),"rollback-plan"=>ProtocolJson.Element(new{id,kind="rollback",digest="synthetic",target=DeploymentPolicy.Target}),"rollback"=>Rollback(),_=>throw new InvalidOperationException()});}
        private JsonElement Init(){Writes++;return Status();}private JsonElement Deploy(){Writes++;deployed=true;return ProtocolJson.Element(new{id,state="completed"});}private JsonElement Rollback(){Writes++;deployed=false;return ProtocolJson.Element(new{id,state="rolled-back"});}
    }
}
