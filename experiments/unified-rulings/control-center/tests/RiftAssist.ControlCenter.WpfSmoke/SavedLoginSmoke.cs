using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;
using RiftAssist.ControlCenter;
using RiftAssist.ControlCenter.Core;

internal static class SavedLoginSmoke
{
    private static string Key => new('a',64);
    public static void Run(Application app)
    {
        var root=Path.Combine(Path.GetTempPath(),"riftassist-saved-ui-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(root);
        var profile=new SshProfile("example.invalid","synthetic_user",22,"",Path.Combine(root,"known_hosts"),"https://example.invalid");
        var settings=new SshProfileStore(Path.Combine(root,"Settings"));settings.Save(profile);
        var reference=AdminCredentialReference.For(profile);var vault=new Vault();var preferences=new AdminLoginPreferences(Path.Combine(root,"LoginOptions"));var saved=new SavedAdminLogin(vault,preferences);
        saved.AuthenticateManualAsync(reference,Key,true,false,_=>Task.CompletedTask).GetAwaiter().GetResult();
        Window? window=null;OperationsView? view=null;
        try{
            var reader=new Reader();var model=new OperationsModel(settingsStore:settings,remoteAdminFactory:_=>reader,savedAdminLogin:saved);
            view=new OperationsView(model);window=new Window{Content=view,Width=1120,Height=900};window.Show();Idle(app);
            view.TryStartupAdminAsync().GetAwaiter().GetResult();Check(reader.Logins==0&&vault.Reads==0&&!model.AzureMode);
            ((ComboBox)view.FindName("ModeCombo")).SelectedIndex=1;Idle(app);
            ((Button)view.FindName("ConnectSavedAdminButton")).RaiseEvent(new RoutedEventArgs(Button.ClickEvent));Idle(app);
            Check(reader.Logins==1&&model.CanReadAdmin&&!model.CanControl&&((PasswordBox)view.FindName("AdminKeyInput")).Password.Length==0);
            ((CheckBox)view.FindName("AutoConnectAdmin")).IsChecked=true;Idle(app);Check(preferences.Read(reference).AutoConnect);
            Check(model.LocalEvents.All(x=>!x.Contains(Key,StringComparison.Ordinal)));
            window.Close();view.DisposeAsync().AsTask().GetAwaiter().GetResult();window=null;view=null;

            // Simulate a new executable/ZIP with the same Windows user's persistent profile and options.
            var nextReader=new Reader();var nextModel=new OperationsModel(settingsStore:settings,remoteAdminFactory:_=>nextReader,savedAdminLogin:new SavedAdminLogin(vault,new AdminLoginPreferences(Path.Combine(root,"LoginOptions"))));
            view=new OperationsView(nextModel);window=new Window{Content=view,Width=1120,Height=900};window.Show();Idle(app);
            view.TryStartupAdminAsync().GetAwaiter().GetResult();view.TryStartupAdminAsync().GetAwaiter().GetResult();Idle(app);
            Check(nextModel.AzureMode&&nextReader.Logins==1&&nextReader.StatusReads==1&&nextReader.ReportReads==0);
            Check(((PasswordBox)view.FindName("AdminKeyInput")).Password.Length==0&&!nextModel.CanControl);
            ((Button)view.FindName("ForgetSavedAdminButton")).RaiseEvent(new RoutedEventArgs(Button.ClickEvent));Idle(app);
            Check(vault.Value is null&&!preferences.Read(reference).Remember&&!preferences.Read(reference).AutoConnect&&!nextModel.CanReadAdmin);
            window.Close(); view.DisposeAsync().AsTask().GetAwaiter().GetResult(); window=null; view=null;
            saved.AuthenticateManualAsync(reference,Key,true,true,_=>Task.CompletedTask).GetAwaiter().GetResult();
            var failingReader=new Reader { FailStatus=true }; var failingModel=new OperationsModel(settingsStore:settings,remoteAdminFactory:_=>failingReader,savedAdminLogin:saved);
            view=new OperationsView(failingModel); window=new Window{Content=view,Width=1120,Height=900}; window.Show(); Idle(app);
            view.TryStartupAdminAsync().GetAwaiter().GetResult(); Idle(app);
            Check(failingReader.Logins==1&&!preferences.Read(reference).AutoConnect&&preferences.Read(reference).Remember&&vault.Value==Key&&!failingModel.CanReadAdmin);
        }finally{window?.Close();view?.DisposeAsync().AsTask().GetAwaiter().GetResult();Directory.Delete(root,true);}
    }
    private static void Idle(Application app)=>app.Dispatcher.Invoke(()=>{},DispatcherPriority.ApplicationIdle);
    private static void Check(bool value){if(!value)throw new InvalidOperationException("Saved login native UI assertion failed");}
    private sealed class Vault:IAdminCredentialVault
    {
        public string? Value;public int Reads;
        public string? Read(AdminCredentialReference reference){Reads++;return Value;}
        public void Write(AdminCredentialReference reference,string key){Value=key;}
        public void Delete(AdminCredentialReference reference){Value=null;}
    }
    private sealed class Reader:IRemoteAdminReader
    {
        public bool Authenticated{get;private set;}public int Logins,StatusReads,ReportReads;public bool FailStatus;
        public Task LoginAsync(string key,CancellationToken cancellation=default){Check(key==Key);Authenticated=true;Logins++;return Task.CompletedTask;}
        public Task<JsonElement> ReadAsync(string path,CancellationToken cancellation=default){
            if(path!="/api/status"){ReportReads++;throw new InvalidOperationException();}StatusReads++;
            if(FailStatus)throw new ControlException("client-admin-response");
            return Task.FromResult(ProtocolJson.Element(new{appRunning=true,error="",stats=new{day="2026-11-02",limits=OperationsPolicy.LimitLabels.Keys.ToDictionary(k=>k,k=>1),aiEnabled=true,calls=Array.Empty<object>()}}));
        }
        public ValueTask DisposeAsync(){Authenticated=false;return ValueTask.CompletedTask;}
    }
}
