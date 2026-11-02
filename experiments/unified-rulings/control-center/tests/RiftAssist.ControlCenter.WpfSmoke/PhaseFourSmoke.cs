using System.Runtime.InteropServices;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Interop;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using RiftAssist.ControlCenter;
using RiftAssist.ControlCenter.Core;

internal static class PhaseFourSmoke
{
    [DllImport("user32.dll")] private static extern IntPtr SendMessage(IntPtr hwnd,uint message,IntPtr wParam,IntPtr lParam);
    public static void Run(Application app,Window owner)
    {
        Check(owner.Icon is not null);
        var hwnd=new WindowInteropHelper(owner).Handle;
        Check(SendMessage(hwnd,0x007F,(IntPtr)1,IntPtr.Zero)!=IntPtr.Zero);
        Check(SendMessage(hwnd,0x007F,IntPtr.Zero,IntPtr.Zero)!=IntPtr.Zero);
        var resource=Application.GetResourceStream(new Uri("pack://application:,,,/RiftAssist.ControlCenter;component/Assets/RiftAssist.ico"));
        var decoder=new IconBitmapDecoder(resource.Stream,BitmapCreateOptions.PreservePixelFormat,BitmapCacheOption.OnLoad);
        foreach(var size in new[]{16,24,32,48,256}) Check(decoder.Frames.Any(f=>f.PixelWidth==size&&f.PixelHeight==size));
        var home=System.IO.Path.Combine(System.IO.Path.GetTempPath(),"riftassist-phase4-ui-"+Guid.NewGuid().ToString("N"));System.IO.Directory.CreateDirectory(home);
        var reader=new FakeAdmin();var model=new OperationsModel(settingsStore:new SshProfileStore(home),remoteAdminFactory:_=>reader);var view=new OperationsView(model);
        var window=new Window{Content=view,Width=1120,Height=850};
        try{
            window.Show();model.SetModeAsync(true).GetAwaiter().GetResult();
            model.Host="example.invalid";model.User="synthetic_user";model.KnownHostsFile=System.IO.Path.Combine(home,"known_hosts");model.HttpsOrigin="https://example.invalid";
            Idle(app);Check(reader.Calls==0);
            var password=(PasswordBox)view.FindName("AdminKeyInput");password.Password="synthetic-token";
            ((Button)view.FindName("ConnectAdminButton")).RaiseEvent(new RoutedEventArgs(Button.ClickEvent));Idle(app);
            Check(password.Password.Length==0&&model.CanReadAdmin&&!model.CanControl);
            Check(model.Ai.Contains("13회",StringComparison.Ordinal)&&model.Limits.Count==8);
            Check(((DataGrid)view.FindName("LimitsGrid")).IsReadOnly);
            var tabs=(TabControl)view.FindName("OperationsTabs");tabs.SelectedIndex=3;Idle(app);
            ((Button)view.FindName("ReadAdminReportsButton")).RaiseEvent(new RoutedEventArgs(Button.ClickEvent));Idle(app);
            Check(model.Reports.Count==1);((DataGrid)view.FindName("ReportsGrid")).SelectedIndex=0;Idle(app);
            Check(model.ReportDetail.Contains("합성 질문",StringComparison.Ordinal)&&model.ReportDetail.Contains("합성 답변",StringComparison.Ordinal));
            Check(model.LocalEvents.All(e=>!e.Contains("synthetic-token",StringComparison.Ordinal)&&!e.Contains("합성 질문",StringComparison.Ordinal)));
            Check(!app.Windows.OfType<ActionConfirmation>().Any());
            reader.Authenticated=false;model.ExpireAdminIfNeeded();Idle(app);
            Check(model.Reports.Count==0&&!model.ReportDetail.Contains("합성 질문",StringComparison.Ordinal)&&!model.CanReadAdmin&&reader.Disposed);
        }finally{window.Close();view.DisposeAsync().AsTask().GetAwaiter().GetResult();System.IO.Directory.Delete(home,true);}
    }
    private static void Idle(Application app)=>app.Dispatcher.Invoke(()=>{},DispatcherPriority.ApplicationIdle);
    private static void Check(bool value){if(!value)throw new InvalidOperationException("Phase4 native UI assertion failed");}
    private sealed class FakeAdmin:IRemoteAdminReader
    {
        public bool Authenticated{get;set;}public bool Disposed{get;private set;}public int Calls{get;private set;}
        public Task LoginAsync(string key,CancellationToken cancellation=default){Calls++;Authenticated=key=="synthetic-token";return Task.CompletedTask;}
        public Task<JsonElement> ReadAsync(string path,CancellationToken cancellation=default){Calls++;
            if(path=="/api/status")return Task.FromResult(ProtocolJson.Element(new{appRunning=true,error="",stats=new{day="2026-11-02",limits=OperationsPolicy.LimitLabels.Keys.ToDictionary(k=>k,k=>1),aiEnabled=true,calls=new[]{new{kind="generation",count=13,inputTokens=1,outputTokens=2,usageUnknown=0}}}}));
            if(path=="/api/reports")return Task.FromResult(ProtocolJson.Element(new{reports=new[]{new{id="12345678-1234-1234-1234-123456789abc",created=1793577600000L,category="other",status="received"}}}));
            return Task.FromResult(ProtocolJson.Element(new{id="12345678-1234-1234-1234-123456789abc",category="other",status="received",content="합성 제보",snapshot=new{question=new{text="합성 질문"},response=new{recommendation="합성 답변"}},history=Array.Empty<object>()}));
        }
        public ValueTask DisposeAsync(){Disposed=true;Authenticated=false;return ValueTask.CompletedTask;}
    }
}
