using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Controls;
using RiftAssist.ControlCenter.Core;

namespace RiftAssist.ControlCenter;

public sealed class DeploymentView:UserControl
{
    public Button Initialize{get;}=new(){Content="새 합성 배포 환경"};
    public Button Deploy{get;}=new(){Content="선택 버전 배포 (합성)"};
    public Button Rollback{get;}=new(){Content="선택 배포의 이전 버전으로 롤백 (합성)"};
    public Button Production{get;}=new(){Content="Azure 라이브 배포 · 구성/설치/별도 승인 필요",IsEnabled=false};
    public TextBox Result{get;}=new(){IsReadOnly=true,AcceptsReturn=true,TextWrapping=TextWrapping.Wrap,VerticalScrollBarVisibility=ScrollBarVisibility.Auto};
    public TextBlock Status{get;}=new(){Text="실제 라이브: v0.1.7 (사용자 확인). 이번 화면은 격리 합성 대상만 지원합니다. Azure 상태는 기존 서버·운영 화면에서 조회하세요.",TextWrapping=TextWrapping.Wrap};
    public ComboBox Candidates{get;}=new(){MinWidth=400};
    public ComboBox Labs{get;}=new(){MinWidth=300};
    public ListBox History{get;}=new(){MaxHeight=110};
    public ListBox Backups{get;}=new(){MaxHeight=70};
    public ComboBox Fault{get;}=new(){ItemsSource=new[]{"none","precheck","backup","transfer","start","health","route","post-health","rollback","backup-corrupt","response-loss"},SelectedIndex=0};
    private readonly Func<string,IDeploymentClient> client;
    private readonly Func<JsonElement> bundled;
    private readonly Func<Task<DeploymentCandidate[]>> list;
    private readonly Func<DeploymentCandidate,Task<JsonElement>> package;
    private readonly string catalog;
    private readonly Func<string,string,bool>? confirm;
    private JsonElement? selectedPackage;
    private JsonElement? pending;
    private bool busy;
    private CancellationTokenSource? cancel;
    public DeploymentView():this(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"RiftAssist","ControlCenter","DeploymentLabs"),null,null,null,null,null){}
    public DeploymentView(string folder,Func<string,IDeploymentClient>? factory,Func<JsonElement>? bundledPackage,Func<Task<DeploymentCandidate[]>>? candidates,Func<DeploymentCandidate,Task<JsonElement>>? getPackage,Func<string,string,bool>? confirmation)
    {
        catalog=folder;confirm=confirmation;
        BackendLayout Backend()=>BackendLayout.Installed(AppContext.BaseDirectory);
        client=factory??(root=>new LocalDeploymentClient(root,Backend(),Path.Combine(AppContext.BaseDirectory,"deployment"),Path.Combine(AppContext.BaseDirectory,"deployment-manifest.json"),new NativeToolRunner()));
        bundled=bundledPackage??(()=>DeploymentCatalog.BundledPackage(Backend()));
        DeploymentCatalog Remote(){var tools=RealRepairOptionsStore.Local().Load();return new(tools.Gh,Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),new NativeToolRunner());}
        list=candidates??(()=>Remote().ListAsync(CancellationToken.None));package=getPackage??(c=>Remote().PackageAsync(c,CancellationToken.None));
        var root=new DockPanel{Margin=new Thickness(12)};Content=root;var top=new StackPanel();DockPanel.SetDock(top,Dock.Top);root.Children.Add(top);top.Children.Add(Status);
        top.Children.Add(new TextBlock{Text="운영 관리자/systemd 제어와 별도인 배포 대상입니다. 백업·데이터·키는 이 PC의 합성 환경에만 저장하며 GitHub/모델에 전송하지 않습니다.",TextWrapping=TextWrapping.Wrap});
        top.Children.Add(new TextBlock{Text="Ubuntu staging 전용 어댑터·브로커는 별도 준비되어 있습니다. 이 화면은 합성 전용이며 실제 서버 설치·연결·쓰기 승인은 활성화하지 않습니다.",TextWrapping=TextWrapping.Wrap});
        var setup=new WrapPanel();var refresh=new Button{Content="현재 상태·이력 조회"};refresh.Click+=async(_,_)=>await RefreshAsync();var reconcile=new Button{Content="중단·미확정 작업 재조회"};reconcile.Click+=async(_,_)=>await Run(async c=>Render(await Current().CallAsync("reconcile",new{},c)));setup.Children.Add(Initialize);setup.Children.Add(Labs);setup.Children.Add(refresh);setup.Children.Add(reconcile);top.Children.Add(setup);
        top.Children.Add(new TextBlock{Text="선택 브랜치: "+RepairScope.BaseBranch+" (버전 분리 정책 · 이 화면에서 브랜치 자동 생성 없음)"});
        var select=new WrapPanel();var remote=new Button{Content="GitHub 개발 브랜치·CI 조회"};remote.Click+=async(_,_)=>await Run(async _=>{Candidates.ItemsSource=await list();Candidates.SelectedIndex=0;Status.Text="GitHub 조회 완료 · 아직 배포/패키지 준비 없음";});var prepare=new Button{Content="선택 커밋 패키지 준비"};prepare.Click+=async(_,_)=>await Run(async _=>{if(Candidates.SelectedItem is not DeploymentCandidate c)throw new ControlException("client-deploy-tests");selectedPackage=await package(c);pending=null;Status.Text="개발 코드 패키지 생성·해시 확인 · 합성 배포만 가능";});var local=new Button{Content="번들 코드로 합성 연습"};local.Click+=(_,_)=>{try{selectedPackage=bundled();pending=null;Status.Text="번들 패키지 준비 · GitHub CI 증거/운영 릴리스 아님";}catch(Exception e){Status.Text=UserErrors.Explain(e);}};select.Children.Add(remote);select.Children.Add(Candidates);select.Children.Add(prepare);select.Children.Add(local);top.Children.Add(select);
        var actions=new WrapPanel();var check=new Button{Content="배포 전 점검·계획"};check.Click+=async(_,_)=>await PlanAsync();var stop=new Button{Content="진행 작업 취소"};stop.Click+=(_,_)=>cancel?.Cancel();var verify=new Button{Content="선택 백업 복원 검증"};verify.Click+=async(_,_)=>await Run(async c=>{var backup=Backups.SelectedItem is BackupItem b?b.Value.Field("id").Text():History.SelectedItem is OperationItem item?item.Value.Field("backupId").Text():"";{if(backup.Length>0)Result.Text=(await Current().CallAsync("verify-backup",new{backupId=backup},c)).GetRawText();}});foreach(var b in new UIElement[]{new TextBlock{Text="합성 장애 주입:"},Fault,check,Deploy,Rollback,verify,stop,Production})actions.Children.Add(b);top.Children.Add(actions);top.Children.Add(History);top.Children.Add(new TextBlock{Text="사용 가능한 암호화 백업 · 검증 메타데이터"});top.Children.Add(Backups);root.Children.Add(Result);
        Initialize.Click+=async(_,_)=>await InitializeAsync();Deploy.Click+=async(_,_)=>await DeployAsync();Rollback.Click+=async(_,_)=>await RollbackAsync();Labs.SelectionChanged+=(_,_)=>{pending=null;};History.SelectionChanged+=(_,_)=>{if(History.SelectedItem is OperationItem i)Result.Text=i.Value.GetRawText();};Loaded+=(_,_)=>{var owner=Window.GetWindow(this);if(owner is not null)owner.Closed+=(_,_)=>cancel?.Cancel();};ReloadLabs();
    }
    private IDeploymentClient Current()=>Labs.SelectedItem is string id?client(Path.Combine(catalog,id)):throw new ControlException("client-deploy-owner");
    private void ReloadLabs(string? select=null){SafePath.NoLinks(catalog);Labs.ItemsSource=Directory.Exists(catalog)?Directory.EnumerateDirectories(catalog).Select(Path.GetFileName).Where(x=>Guid.TryParseExact(x,"D",out _)).ToArray():[];Labs.SelectedItem=select;if(Labs.SelectedIndex<0)Labs.SelectedIndex=0;}
    private bool Ask(string action,string scope)=>confirm?.Invoke(action,scope)??ActionConfirmation.Confirm(Window.GetWindow(this),action,"격리 합성 대상",scope);
    private async Task Run(Func<CancellationToken,Task> action){if(busy)return;busy=true;Labs.IsEnabled=Candidates.IsEnabled=Fault.IsEnabled=false;using var c=new CancellationTokenSource();cancel=c;try{await action(c.Token);}catch(Exception e){Status.Text=UserErrors.Explain(e)+" 중단된 쓰기는 자동 재시도하지 않습니다. 미확정 작업 재조회로 상태를 확인하세요.";}finally{cancel=null;busy=false;Labs.IsEnabled=Candidates.IsEnabled=Fault.IsEnabled=true;}}
    public Task InitializeAsync()=>Run(async c=>{if(!Ask("새 합성 배포 환경","독립 DB·키·모의 v0.1.7 기준 자료를 새로 생성합니다. 운영 자료는 사용하지 않습니다."))return;SafePath.NoLinks(catalog);Directory.CreateDirectory(catalog);if(OperatingSystem.IsWindows())new WindowsReportProtection().SecureDirectory(catalog);var id=Guid.NewGuid().ToString("D");var result=await client(Path.Combine(catalog,id)).CallAsync("init",new{},c);ReloadLabs(id);selectedPackage=bundled();Render(result);});
    public Task RefreshAsync()=>Run(async c=>Render(await Current().CallAsync("status",new{},c)));
    public Task PlanAsync()=>Run(async c=>{if(selectedPackage is not{}p)throw new ControlException("client-deploy-tests");pending=await Current().CallAsync("plan",new{package=p,fault=Fault.SelectedItem as string??"none"},c);Result.Text=DeploymentPolicy.Preview(pending.Value).Text;Status.Text="계획 준비 완료 · 아직 백업/서비스/라우팅 변경 없음";});
    public Task DeployAsync()=>Run(async c=>{if(pending is not{}p||selectedPackage is not{}pkg)throw new ControlException("client-deploy-tests");var preview=DeploymentPolicy.Preview(p);if(!Ask("선택 합성 버전 배포",preview.Text))return;var result=await new DeploymentCoordinator(Current()).ExecuteAsync(DeploymentPolicy.Target,p,AnalysisConsent.Approve("lab-deploy",preview),pkg,c,x=>Status.Text=x);pending=null;Render(await Current().CallAsync("status",new{},c));Result.Text=result.GetRawText();Status.Text="합성 배포 결과: "+result.Field("state").Text();});
    public Task RollbackAsync()=>Run(async c=>{if(History.SelectedItem is not OperationItem item)throw new ControlException("client-deploy-tests");var p=await Current().CallAsync("rollback-plan",new{operationId=item.Value.Field("id").Text()},c);var preview=DeploymentPolicy.Preview(p);if(!Ask("이전 합성 앱·라우팅으로 롤백",preview.Text))return;var r=await new DeploymentCoordinator(Current()).ExecuteAsync(DeploymentPolicy.Target,p,AnalysisConsent.Approve("lab-rollback",preview),null,c);Render(await Current().CallAsync("status",new{},c));Result.Text=r.GetRawText();Status.Text="합성 롤백 결과: "+r.Field("state").Text();pending=null;});
    private void Render(JsonElement r){Status.Text="합성 현재 버전: "+r.Field("route").Field("version").Text()+" · 라우팅 세대 "+r.Field("route").Field("generation").GetRawText()+" · 운영 배포 차단";Backups.ItemsSource=r.Field("backups").Rows().Select(x=>new BackupItem(x.Clone())).ToArray();History.ItemsSource=r.Field("operations").EnumerateArray().Select(p=>new OperationItem(p.Clone())).Reverse().ToArray();Result.Text=r.GetRawText();}
    private sealed record BackupItem(JsonElement Value){public override string ToString()=>Value.Field("id").Text()+" · "+Value.Field("release").Text()+" · restoreVerified="+Value.Field("restoreVerified").GetRawText();}
    private sealed record OperationItem(JsonElement Value){public override string ToString()=>Value.Field("id").Text()+" · "+Value.Field("kind").Text()+" · "+Value.Field("state").Text();}
}
