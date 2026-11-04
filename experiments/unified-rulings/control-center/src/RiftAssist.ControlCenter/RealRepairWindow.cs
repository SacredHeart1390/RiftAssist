using System.Diagnostics;
using System.IO;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Win32;
using RiftAssist.ControlCenter.Core;

namespace RiftAssist.ControlCenter;

public sealed class RealRepairWindow:Window
{
    private readonly IncidentInput original;
    private readonly Func<Task<IncidentInput>> refresh;
    private readonly RealRepairOptionsStore settings;
    private readonly RealRepairStore store;
    private readonly Func<ToolPaths,RealRepairCoordinator> create;
    private readonly Func<ToolPaths,Task<ToolReadiness>> inspect;
    private readonly string node;
    private CancellationTokenSource? cancellation;
    private bool busy;
    public TextBox CodexPath{get;}=new();public TextBox GitPath{get;}=new();public TextBox GhPath{get;}=new();
    public CheckBox EnableExecution{get;}=new(){Content="실제 Codex 기능 활성화 (기본 꺼짐)"};
    public CheckBox EnablePublication{get;}=new(){Content="GitHub 게시 기능 활성화 (별도 승인 필요)"};
    public Button Start{get;}=new(){Content="Codex로 수정하기"};
    public Button Publish{get;}=new(){Content="수정 결과 승인 · GitHub PR 만들기"};
    public Button Cancel{get;}=new(){Content="작업 취소",IsEnabled=false};
    public Button Requery{get;}=new(){Content="기존 PR 재조회"};
    public TextBlock Status{get;}=new(){Text="도구/로그인을 확인하고 명시적으로 활성화하세요. 실제 실행은 격리 검사 통과 시에만 허용됩니다.",TextWrapping=TextWrapping.Wrap};
    public TextBox Result{get;}=new(){IsReadOnly=true,AcceptsReturn=true,TextWrapping=TextWrapping.Wrap,VerticalScrollBarVisibility=ScrollBarVisibility.Auto};
    public ListBox Jobs{get;}=new(){MaxHeight=120,DisplayMemberPath=nameof(RealRepairJob.State)};
    public RealRepairWindow(Window owner,IncidentInput input,Func<Task<IncidentInput>> fresh):this(owner,input,fresh,RealRepairOptionsStore.Local(),RealRepairStore.Local(),BackendLayout.Installed(AppContext.BaseDirectory).Node,null,null){}
    public RealRepairWindow(Window owner,IncidentInput input,Func<Task<IncidentInput>> fresh,RealRepairOptionsStore options,RealRepairStore storage,string nodePath,Func<ToolPaths,RealRepairCoordinator>? factory,Func<ToolPaths,Task<ToolReadiness>>? inspector)
    {
        Owner=owner;original=input;refresh=fresh;settings=options;store=storage;node=nodePath;Title="실제 Codex 수정·GitHub Draft PR · v0.2.0";Width=1100;Height=850;MinHeight=600;WindowStartupLocation=WindowStartupLocation.CenterOwner;
        create=factory??(tools=>{var runner=new NativeToolRunner();return new(store,new GitHubRepairAdapter(tools.Gh,store.Root,runner),new WindowsCodexAdapter(tools,runner),path=>new RepairWorkspace(path,tools.Git,runner));});
        inspect=inspector??(tools=>new ExternalToolInspector(tools,new NativeToolRunner()).InspectAsync(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),CancellationToken.None));
        var root=new DockPanel{Margin=new Thickness(14)};Content=root;var head=new StackPanel();DockPanel.SetDock(head,Dock.Top);root.Children.Add(head);
        head.Children.Add(new TextBlock{Text="대상: "+RepairScope.Repository+" · PR base: "+RepairScope.BaseBranch+" · 운영 v0.1.7/배포/Merge 금지",TextWrapping=TextWrapping.Wrap});
        var setup=new StackPanel();void Tool(string label,TextBox box){setup.Children.Add(new TextBlock{Text=label});var row=new DockPanel();var browse=new Button{Content="찾기"};DockPanel.SetDock(browse,Dock.Right);row.Children.Add(browse);row.Children.Add(box);setup.Children.Add(row);browse.Click+=(_,_)=>{var dialog=new OpenFileDialog{Filter="Windows native executable|*.exe",CheckFileExists=true};if(dialog.ShowDialog(this)==true)box.Text=dialog.FileName;};}
        Tool("Codex native codex.exe (cmd/bat shim 사용 안 함)",CodexPath);Tool("Git git.exe",GitPath);Tool("GitHub CLI gh.exe",GhPath);setup.Children.Add(EnableExecution);setup.Children.Add(EnablePublication);
        var save=new Button{Content="도구/활성화 설정 저장"};save.Click+=(_,_)=>SaveSettings();setup.Children.Add(save);
        var docs=new Button{Content="설치·로그인·Windows 샌드박스 공식 안내"};docs.Click+=(_,_)=>Process.Start(new ProcessStartInfo("https://developers.openai.com/codex/windows"){UseShellExecute=true});setup.Children.Add(docs);
        setup.Children.Add(new TextBlock{Text="필요 시 공식 Codex CLI/Git/GitHub CLI를 직접 설치하고 codex login, gh auth login을 수행하세요. 설치/로그인/권한 부여를 자동 실행하지 않습니다. 모델명은 강제 지정하지 않으며 격리된 CLI 기본값을 사용합니다.",TextWrapping=TextWrapping.Wrap});
        var processes=new WrapPanel();var inspectProcesses=new Button{Content="실행/잔존 프로세스 조회"};var cleanProcesses=new Button{Content="소유한 잔존 작업 정리"};
        void Owned(bool cleanup){try{if(cleanup&&!ActionConfirmation.Confirm(this,"소유한 잔존 작업 정리","종료된 Control Center의 전용 Job Object만","다른 창에서 실행 중인 작업은 보존합니다. 미확정 수정/게시를 재실행하지 않습니다."))return;Status.Text=string.Join("\n",WindowsOwnedProcess.Inspect(cleanup).Select(x=>x.Id+" · "+x.State));if(Status.Text.Length==0)Status.Text="정리할 소유 프로세스 기록이 없습니다.";}catch(Exception e){Status.Text=UserErrors.Explain(e);}}
        inspectProcesses.Click+=(_,_)=>Owned(false);cleanProcesses.Click+=(_,_)=>Owned(true);processes.Children.Add(inspectProcesses);processes.Children.Add(cleanProcesses);head.Children.Add(processes);
        head.Children.Add(new Expander{Header="최초 도구 준비·인증·활성화",Content=setup,IsExpanded=true});head.Children.Add(Status);
        var actions=new WrapPanel();var check=new Button{Content="도구·로그인 상태 확인"};check.Click+=async(_,_)=>await CheckAsync();var history=new Button{Content="이력/미확정 작업 조회"};history.Click+=(_,_)=>Reload();var reject=new Button{Content="수정 후보 거절"};reject.Click+=(_,_)=>{try{if(Jobs.SelectedItem is RealRepairJob j&&ActionConfirmation.Confirm(this,"수정 후보 거절",j.Id)){create(Paths()).Reject(j);Reload();}}catch(Exception e){Status.Text=UserErrors.Explain(e);}};
        foreach(var control in new UIElement[]{check,Start,Cancel,Publish,reject,Requery,history})actions.Children.Add(control);head.Children.Add(actions);head.Children.Add(Jobs);root.Children.Add(Result);
        Start.Click+=async(_,_)=>await StartAsync();Publish.Click+=async(_,_)=>await PublishAsync();Cancel.Click+=(_,_)=>cancellation?.Cancel();Requery.Click+=async(_,_)=>await RequeryAsync();Jobs.SelectionChanged+=(_,_)=>Render();Closed+=(_,_)=>cancellation?.Cancel();
        try{var saved=settings.Load();CodexPath.Text=saved.Codex;GitPath.Text=saved.Git;GhPath.Text=saved.Gh;EnableExecution.IsChecked=saved.ExecutionEnabled;EnablePublication.IsChecked=saved.PublicationEnabled;}catch{Status.Text="도구 설정을 불러오지 못했습니다. 비밀 없이 경로만 다시 지정하세요.";}Reload();
    }
    private ToolPaths Paths()=>new(CodexPath.Text,GitPath.Text,GhPath.Text,node);
    private void SaveSettings(){try{if(!ActionConfirmation.Confirm(this,"도구/활성화 설정 저장","이 Windows 계정","실제 Codex는 ChatGPT 플랜 사용량이 발생할 수 있습니다. 활성화만으로 작업/게시를 시작하지 않습니다."))return;settings.Save(new(CodexPath.Text,GitPath.Text,GhPath.Text,EnableExecution.IsChecked==true,EnablePublication.IsChecked==true));Status.Text="설정 저장 완료 · 각 실제 실행/게시에는 별도 내용 승인이 필요합니다.";}catch(Exception e){Status.Text=UserErrors.Explain(e);}}
    private async Task CurrentRevision(){var current=await refresh();if(current.ReportId!=original.ReportId||current.Revision!=original.Revision||current.Source!=original.Source)throw new ControlException("client-analysis-stale");}
    private void Progress(string message){if(IsLoaded)Status.Text=message.StartsWith("client-",StringComparison.Ordinal)?UserErrors.Explain(new ControlException(message)):message;}
    private async Task Run(Func<CancellationToken,Task> action)
    {if(busy)return;busy=true;Start.IsEnabled=Publish.IsEnabled=Requery.IsEnabled=Jobs.IsEnabled=false;Cancel.IsEnabled=true;using var source=new CancellationTokenSource();cancellation=source;try{await action(source.Token);}catch(Exception e){Status.Text=UserErrors.Explain(e);}finally{cancellation=null;busy=false;Start.IsEnabled=Publish.IsEnabled=Requery.IsEnabled=Jobs.IsEnabled=true;Cancel.IsEnabled=false;}}
    public Task CheckAsync()=>Run(async _=>{var ready=await inspect(Paths());Status.Text=ready.Summary+" · 격리 검사는 실행 직전에 별도 수행합니다.";});
    public Task StartAsync()=>Run(async c=>{
        if(EnableExecution.IsChecked!=true)throw new ControlException("client-real-disabled");await CurrentRevision();
        var preview=new IncidentPreview(this,RealRepairCoordinator.ExecutionPreview(original),"실제 Codex 외부 전송/수정 승인 · GitHub에서 개발 소스 준비 · ChatGPT 플랜 사용량 적용");if(preview.ShowDialog()!=true||preview.Approved is not {}packet)return;
        await CurrentRevision();var job=await create(Paths()).StartAsync(original,packet,AnalysisConsent.Approve("real-codex",packet),true,Progress,c);Reload(job.Id);
    });
    public Task PublishAsync()=>Run(async c=>{
        if(EnablePublication.IsChecked!=true)throw new ControlException("client-real-publication-disabled");await CurrentRevision();var job=Jobs.SelectedItem as RealRepairJob??throw new ControlException("client-real-not-reviewed");
        if(job.ReportRevision!=original.Revision)throw new ControlException("client-analysis-stale");
        var preview=RealRepairCoordinator.PublicationPreview(job);if(!ActionConfirmation.Confirm(this,"수정 결과 승인 · GitHub Draft PR 생성",RepairScope.Repository+" / "+job.Actor,preview.Text))return;
        await CurrentRevision();var saved=await create(Paths()).PublishAsync(job.Id,AnalysisConsent.Approve("real-github",preview),true,Progress,c);Reload(saved.Id);
    });
    public Task RequeryAsync()=>Run(async c=>{if(Jobs.SelectedItem is RealRepairJob job){var saved=await create(Paths()).RequeryAsync(job.Id,c);Reload(saved.Id);}});
    public void Reload(string? id=null)
    {if(busy&&id is null)return;try{var jobs=create(Paths()).History(original.ReportId);Jobs.ItemsSource=jobs;Jobs.SelectedItem=jobs.FirstOrDefault(j=>j.Id==id)??jobs.FirstOrDefault();Render();}catch(Exception e){Status.Text=UserErrors.Explain(e);}}
    private void Render()
    {if(Jobs.SelectedItem is not RealRepairJob j){Result.Text="실제 작업 이력 없음. 기본 수정 범위는 v0.2.0 src와 incident-tests뿐입니다. v0.1.7 긴급 건은 기존 프롬프트 복사/제안 경로를 사용하세요.";return;}
        Result.Text=$"작업 {j.Id} · {j.State}\n제보 revision {j.ReportRevision} · 현재 {original.Revision}\n기준 {j.BaseCommit}\nGitHub 계정 {j.Actor}\n브랜치 {j.Branch} → {RepairScope.BaseBranch}\nPR {j.PrUrl??"미생성/확인 필요"}\n\n진행\n{string.Join("\n",j.Events)}\n\nCodex 분석/수정 요약 (모델 주장 · 검토 필요)\n{j.ModelSummary}\n\n검증\n{j.Tests}\nCLI 보고 토큰 입력 {j.InputTokens?.ToString()??"미확인"} / 출력 {j.OutputTokens?.ToString()??"미확인"} · 서비스 API 비용과 별도/과금 미산정\n\n변경 파일\n{string.Join("\n",j.Changes.Select(f=>f.Path))}\n\nGit diff\n{j.Diff}\n\n검토 해시 {j.ReviewHash}\n실제 Windows10/Codex 격리·의미 정확성·WPF/E2E·배포는 별도 확인입니다. 승인 없는 Merge/배포는 실행하지 않습니다.";
    }
}
