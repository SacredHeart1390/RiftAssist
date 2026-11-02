using System.IO;
using System.Text;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;
using RiftAssist.ControlCenter;
using RiftAssist.ControlCenter.Core;

internal static class AutomaticConnectionSmoke
{
    private static string Key => new('a',64);
    public static void Run(Application app)
    {
        var root=Path.Combine(Path.GetTempPath(),"riftassist-automatic-ui-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(root);
        var store=new SshProfileStore(Path.Combine(root,"Settings"));
        store.Save(new SshProfile("example.invalid","synthetic_user",22,"",Path.Combine(root,"known_hosts"),"https://example.invalid"));
        Window? window=null;OperationsView? view=null;
        try{
            var ssh=new Ssh();var source=new Keys();var clock=new Clock();var readers=new List<Reader>();var delays=new List<TimeSpan>();
            OperationsModel Make(SshProfileStore settings)=>new(ssh,settings,_=>{var r=new Reader();readers.Add(r);return r;},
                new SavedAdminLogin(new UntouchedVault(),new AdminLoginPreferences(Path.Combine(root,"Options"))),source,(span,_)=>{delays.Add(span);return Task.CompletedTask;},clock);
            var model=Make(store);view=new OperationsView(model);window=new Window{Content=view,Width=1120,Height=900};window.Show();Idle(app);
            Check(ssh.Calls==0&&source.Reads==0);view.TryAutomaticStartupAsync().GetAwaiter().GetResult();view.TryAutomaticStartupAsync().GetAwaiter().GetResult();Idle(app);
            Check(ssh.Calls==1&&source.Reads==1&&readers.Count==1&&readers[0].Logins==1&&readers[0].Reports==1&&model.Reports.Count==1);
            Check(model.AzureMode&&model.CanReadAdmin&&!model.CanControl&&((PasswordBox)view.FindName("AdminKeyInput")).Password.Length==0);
            Check(model.LocalEvents.All(e=>!e.Contains(Key,StringComparison.Ordinal))&&!Directory.Exists(Path.Combine(root,"Options")));
            model.SelectReportAsync(model.Reports[0]).GetAwaiter().GetResult();Check(model.ReportDetail.Contains("합성 설명",StringComparison.Ordinal));
            readers[0].Authenticated=false;clock.Advance(TimeSpan.FromMinutes(11));view.RefreshAutomaticSessionIfNeededAsync().GetAwaiter().GetResult();Idle(app);
            Check(source.Reads==2&&readers.Count==2&&readers[1].Logins==1&&readers[0].Disposed);
            model.DisconnectAsync().GetAwaiter().GetResult();clock.Advance(TimeSpan.FromHours(1));view.RefreshAutomaticSessionIfNeededAsync().GetAwaiter().GetResult();Check(source.Reads==2);
            window.Close();view.DisposeAsync().AsTask().GetAwaiter().GetResult();window=null;view=null;

            // Relaunch with only stored SSH metadata, still no DPAPI login/first-run key input.
            var reopened=Make(store);view=new OperationsView(reopened);window=new Window{Content=view,Width=1120,Height=900};window.Show();view.TryAutomaticStartupAsync().GetAwaiter().GetResult();Idle(app);Check(source.Reads==3&&reopened.Reports.Count==1);
            window.Close();view.DisposeAsync().AsTask().GetAwaiter().GetResult();window=null;view=null;

            ssh.Error="client-ssh-authentication";var previousKeys=source.Reads;var failed=Make(store);view=new OperationsView(failed);window=new Window{Content=view,Width=1120,Height=900};window.Show();view.TryAutomaticStartupAsync().GetAwaiter().GetResult();Idle(app);
            Check(window.IsLoaded&&!failed.CanReadAdmin&&source.Reads==previousKeys&&failed.State.Contains("인증",StringComparison.Ordinal));
            window.Close();view.DisposeAsync().AsTask().GetAwaiter().GetResult();window=null;view=null;ssh.Error=null;

            var unavailable=true;readers.Clear();delays.Clear();
            var down=new OperationsModel(ssh,store,_=>{var r=new Reader { Unavailable=unavailable };readers.Add(r);return r;},new SavedAdminLogin(new UntouchedVault(),new AdminLoginPreferences(Path.Combine(root,"Options"))),source,(span,_)=>{delays.Add(span);return Task.CompletedTask;},clock);
            view=new OperationsView(down);window=new Window{Content=view,Width=1120,Height=900};window.Show();view.TryAutomaticStartupAsync().GetAwaiter().GetResult();Idle(app);
            Check(window.IsLoaded&&readers.Count==2&&delays.SequenceEqual(new[]{TimeSpan.FromSeconds(5)})&&!down.CanReadAdmin);
            clock.Advance(TimeSpan.FromHours(1));view.RefreshAutomaticSessionIfNeededAsync().GetAwaiter().GetResult();Check(readers.Count==2);
            unavailable=false;((Button)view.FindName("RecoverConnectionButton")).RaiseEvent(new RoutedEventArgs(Button.ClickEvent));Idle(app);Check(down.CanReadAdmin&&readers.Count==3);
            window.Close();view.DisposeAsync().AsTask().GetAwaiter().GetResult();window=null;view=null;

            var noSettings=Make(new SshProfileStore(Path.Combine(root,"NotConfigured")));view=new OperationsView(noSettings);window=new Window{Content=view};window.Show();previousKeys=source.Reads;
            view.TryAutomaticStartupAsync().GetAwaiter().GetResult();Check(!noSettings.AzureMode&&source.Reads==previousKeys);
        }finally{window?.Close();view?.DisposeAsync().AsTask().GetAwaiter().GetResult();Directory.Delete(root,true);}
    }
    private static void Idle(Application app)=>app.Dispatcher.Invoke(()=>{},DispatcherPriority.ApplicationIdle);
    private static void Check(bool value){if(!value)throw new InvalidOperationException("Automatic SSH authentication UI assertion failed");}
    private sealed class Clock:TimeProvider { private DateTimeOffset now=DateTimeOffset.UtcNow;public override DateTimeOffset GetUtcNow()=>now;public void Advance(TimeSpan span)=>now+=span; }
    private sealed class UntouchedVault:IAdminCredentialVault
    { public string? Read(AdminCredentialReference reference)=>throw new InvalidOperationException();public void Write(AdminCredentialReference reference,string key)=>throw new InvalidOperationException();public void Delete(AdminCredentialReference reference)=>throw new InvalidOperationException(); }
    private sealed class Keys:IManagerKeySource
    { public int Reads;public Task<AdminKeyLease> ReadAsync(SshProfile profile,CancellationToken cancellation){Reads++;return Task.FromResult(AdminKeyLease.Parse(Encoding.ASCII.GetBytes(Key)));} }
    private sealed class Ssh:ISshRunner
    {
        public int Calls;public string? Error;
        public Task<SshProcessResult> RunAsync(SshCommand command,CancellationToken cancellation){Calls++;SshCommandPolicy.Validate(command);if(Error is not null)throw new ControlException(Error);
            return Task.FromResult(new SshProcessResult(0,"protocol=riftassist-status-1\nuptime_seconds=1000\nmemory_total_kib=4096\nmemory_available_kib=2048\ndisk_total_kib=8192\ndisk_available_kib=4096\ncpu_percent=1.00\nservice=active\napp_http=200\nhttps_http=200\n",""));}
    }
    private sealed class Reader:IRemoteAdminReader
    {
        public bool Authenticated{get;set;}public bool Unavailable,Disposed;public int Logins,Reports;
        public Task LoginAsync(string key,CancellationToken cancellation=default){Check(key==Key);Logins++;if(Unavailable)throw new ControlException("client-admin-unavailable");Authenticated=true;return Task.CompletedTask;}
        public Task<JsonElement> ReadAsync(string path,CancellationToken cancellation=default){
            if(path=="/api/status")return Task.FromResult(ProtocolJson.Element(new{appRunning=true,error="",stats=new{day="2026-11-02",limits=OperationsPolicy.LimitLabels.Keys.ToDictionary(k=>k,k=>1),aiEnabled=true,calls=Array.Empty<object>()}}));
            if(path=="/api/reports"){Reports++;return Task.FromResult(ProtocolJson.Element(new{reports=new[]{new{id="12345678-1234-1234-1234-123456789abc",created=1793577600000L,category="ruling",status="received"}}}));}
            return Task.FromResult(ProtocolJson.Element(new{id="12345678-1234-1234-1234-123456789abc",category="ruling",status="received",content=new{description="합성 설명",expected="합성 기대",tags=Array.Empty<string>()},snapshot=(object?)null,history=Array.Empty<object>()}));
        }
        public ValueTask DisposeAsync(){Disposed=true;Authenticated=false;return ValueTask.CompletedTask;}
    }
}
