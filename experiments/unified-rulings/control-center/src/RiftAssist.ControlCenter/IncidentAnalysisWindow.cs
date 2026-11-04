using System.Windows;
using System.Windows.Controls;
using System.Windows.Threading;
using RiftAssist.ControlCenter.Core;

namespace RiftAssist.ControlCenter;

public sealed class IncidentPreview:Window
{
    public TextBox Body{get;}=new(){AcceptsReturn=true,TextWrapping=TextWrapping.Wrap,VerticalScrollBarVisibility=ScrollBarVisibility.Auto};
    public Button Approve{get;}=new(){Content="검토한 내용 승인"};
    public PrivacyPacket? Approved{get;private set;}
    public IncidentPreview(Window owner,PrivacyPacket packet,string purpose)
    {
        Owner=owner;Title="내용 미리보기 · "+purpose;Width=850;Height=720;WindowStartupLocation=WindowStartupLocation.CenterOwner;
        var panel=new DockPanel{Margin=new Thickness(14)};Content=panel;var buttons=new StackPanel{Orientation=Orientation.Horizontal,HorizontalAlignment=HorizontalAlignment.Right};DockPanel.SetDock(buttons,Dock.Bottom);panel.Children.Add(buttons);
        buttons.Children.Add(new Button{Content="아니요",IsCancel=true,IsDefault=true});buttons.Children.Add(Approve);
        var notice=new TextBlock{Text=purpose+"\n자동 제거는 완전하지 않습니다. 이름·상황 등 개인정보를 직접 지우고 확인하세요. 외부 AI/Codex는 기본 비활성이며 실제 작업은 별도 활성화와 내용 승인이 필요합니다. 클립보드 복사는 붙여넣을 외부 서비스에 전송할 내용을 승인하는 단계입니다.",TextWrapping=TextWrapping.Wrap,Margin=new Thickness(0,0,0,10)};DockPanel.SetDock(notice,Dock.Top);panel.Children.Add(notice);panel.Children.Add(Body);Body.Text=packet.Text;
        Approve.Click+=(_,_)=>{try{Approved=PrivacyPacket.Create(Body.Text);DialogResult=true;}catch{MessageBox.Show(this,"내용 크기/형식을 확인하세요.");}};
    }
}
public sealed class IncidentAnalysisWindow:Window
{
    private readonly IncidentInput original;
    private readonly Func<Task<IncidentInput>> fresh;
    private readonly AnalysisLedger store;
    private readonly IIncidentAnalyzer analyzer;
    private readonly RepairCoordinator repair;
    private readonly Action<string> copy;
    private CancellationTokenSource? cancellation;
    private bool busy;
    private string? ownedClipboardHash;
    private readonly bool usesSystemClipboard;
    public ListBox History{get;}=new(){MinHeight=70,MaxHeight=150,DisplayMemberPath=nameof(AnalysisEntry.At)};
    public TextBox Result{get;}=new(){IsReadOnly=true,AcceptsReturn=true,TextWrapping=TextWrapping.Wrap,VerticalScrollBarVisibility=ScrollBarVisibility.Auto};
    public TextBlock Status{get;}=new(){Text="로컬 예비 분석 · 외부 AI/Codex 실행 비활성",TextWrapping=TextWrapping.Wrap};
    public Button Analyze{get;}=new(){Content="AI로 오류 분석 (현재 로컬 예비 분석)"};
    public Button CopyRequest{get;}=new(){Content="Codex에 수정 요청 · 프롬프트 복사"};
    public Button MockRepair{get;}=new(){Content="합성 수정·테스트 흐름 실행"};
    public Button CancelWork{get;}=new(){Content="진행 작업 취소",IsEnabled=false};
    public ComboBox Lane{get;}=new(){ItemsSource=new[]{"v020-improvement","v017-emergency"},SelectedIndex=0,MinWidth=170};
    public AnalysisEntry? Current=>History.SelectedItem as AnalysisEntry;
    public IncidentAnalysisWindow(Window owner,IncidentInput input,Func<Task<IncidentInput>> refresh,AnalysisLedger ledger,IIncidentAnalyzer provider,ISyntheticRepairWorker worker,Action<string>? clipboard=null)
    {
        Owner=owner;original=input;fresh=refresh;store=ledger;analyzer=provider;repair=new(store,worker);copy=clipboard??Clipboard.SetText;usesSystemClipboard=clipboard is null;Title="제보 분석·Codex 수정 후보 · "+input.Source;Width=1040;Height=820;MinHeight=600;WindowStartupLocation=WindowStartupLocation.CenterOwner;
        var root=new DockPanel{Margin=new Thickness(14)};Content=root;
        var head=new StackPanel();DockPanel.SetDock(head,Dock.Top);root.Children.Add(head);
        head.Children.Add(new TextBlock{Text=input.MemorySummary?"기억에 근거한 요약 · 실제 원문 재현 아님":"기록된 제보 · 원문 정확성과 발생 버전은 확인 필요",FontWeight=FontWeights.SemiBold});head.Children.Add(Status);
        var actions=new WrapPanel();foreach(var item in new UIElement[]{Analyze,CopyRequest,Lane,MockRepair,CancelWork})actions.Children.Add(item);head.Children.Add(actions);
        var historyActions=new WrapPanel();var reload=new Button{Content="분석·수정 이력 새로고침"};historyActions.Children.Add(reload);var clearClipboard=new Button{Content="복사한 프롬프트 지우기"};clearClipboard.Click+=(_,_)=>{try{if(usesSystemClipboard&&ownedClipboardHash is not null&&Clipboard.ContainsText()&&PrivacyPacket.Hash(Clipboard.GetText())==ownedClipboardHash)Clipboard.Clear();ownedClipboardHash=null;}catch{Status.Text="클립보드를 지우지 못했습니다. Windows에서 직접 확인하세요.";}};historyActions.Children.Add(clearClipboard);var real=new Button{Content="Codex로 수정하기 · 실제 연동"};real.Click+=async(_,_)=>{try{await CurrentRevision();new RealRepairWindow(this,original,fresh).Show();}catch(Exception e){Status.Text=UserErrors.Explain(e);}};historyActions.Children.Add(real);head.Children.Add(historyActions);head.Children.Add(History);root.Children.Add(Result);
        Analyze.Click+=async(_,_)=>await AnalyzeAsync();CopyRequest.Click+=async(_,_)=>await CopyAsync();MockRepair.Click+=async(_,_)=>await RunMockAsync();CancelWork.Click+=(_,_)=>cancellation?.Cancel();reload.Click+=(_,_)=>ReadHistory();History.SelectionChanged+=(_,_)=>Render();Closed+=(_,_)=>cancellation?.Cancel();ReadHistory();
    }
    private async Task CurrentRevision()
    {var now=await fresh();if(now.ReportId!=original.ReportId||now.Source!=original.Source||now.Revision!=original.Revision)throw new ControlException("client-analysis-stale");}
    private PrivacyPacket? Preview(PrivacyPacket packet,string purpose)
    {var window=new IncidentPreview(this,packet,purpose);return window.ShowDialog()==true?window.Approved:null;}
    private async Task Run(Func<CancellationToken,Task> task)
    {
        if(busy)return;busy=true;Analyze.IsEnabled=CopyRequest.IsEnabled=MockRepair.IsEnabled=Lane.IsEnabled=History.IsEnabled=false;CancelWork.IsEnabled=true;using var cancel=new CancellationTokenSource();cancellation=cancel;
        try{await task(cancel.Token);}catch(Exception e){Status.Text=UserErrors.Explain(e);}finally{cancellation=null;busy=false;Analyze.IsEnabled=CopyRequest.IsEnabled=MockRepair.IsEnabled=Lane.IsEnabled=History.IsEnabled=true;CancelWork.IsEnabled=false;}
    }
    public Task AnalyzeAsync()=>Run(async token=>{
        await CurrentRevision();var packet=Preview(original.Preview(),"로컬 예비 분석·암호화 이력 저장 (외부 전송 없음)");if(packet is null)return;
        await CurrentRevision();Status.Text="로컬 검색 메타데이터 확인 중";var finding=await analyzer.AnalyzeAsync(packet,token);token.ThrowIfCancellationRequested();await CurrentRevision();
        var saved=store.Create(original,packet,finding,AnalysisConsent.Approve("local-analysis",packet));ReadHistory(saved.Id);Status.Text="로컬 예비 분석 완료 · LLM/외부 호출 없음 · 판정/원인 미확정";
    });
    public Task CopyAsync()=>Run(async token=>{
        await CurrentRevision();var selected=Current??throw new ControlException("client-analysis-selection");if(selected.ReportRevision!=original.Revision)throw new ControlException("client-analysis-stale");var lane=(string)Lane.SelectedItem;
        var packet=Preview(CodexBridge.Prompt(selected,lane),"기존 Codex 채팅에 붙여넣을 작업 프롬프트 복사 승인 · 외부 실행/비용 미연동");if(packet is null)return;
        await CurrentRevision();token.ThrowIfCancellationRequested();var latest=store.Read(selected.Id);
        var prepared=repair.PrepareCopy(latest,lane,packet,AnalysisConsent.Approve("clipboard-codex",packet));var job=prepared.Jobs.Single(j=>j.Lane==lane&&j.PacketHash==packet.Digest&&j.Cost.Bucket=="codex-manual");
        using var activity=store.TryJobLock(job.Id)??throw new ControlException("client-analysis-conflict");
        try{copy(packet.Text);ownedClipboardHash=packet.Digest;}catch{repair.CompleteCopy(prepared,job.Id,false);throw new ControlException("client-analysis-clipboard");}
        var saved=job.State=="prompt-copied"?prepared:repair.CompleteCopy(prepared,job.Id,true);ReadHistory(saved.Id);Status.Text="프롬프트 복사 완료 · 클라우드 실행/수정/테스트 결과는 자동 추적하지 않습니다.";
    });
    public Task RunMockAsync()=>Run(async token=>{
        await CurrentRevision();var selected=Current??throw new ControlException("client-analysis-selection");if(selected.ReportRevision!=original.Revision)throw new ControlException("client-analysis-stale");var lane=(string)Lane.SelectedItem;var packet=CodexBridge.Prompt(selected,lane);
        if(!ActionConfirmation.Confirm(this,"합성 수정·테스트 흐름 실행","앱 소유 격리 폴더","모의 Codex 응답과 고정 합성 파일만 사용합니다. 실제 선택 제보의 오류 재현/코드 수정은 실행하지 않습니다."))return;
        await CurrentRevision();var saved=await repair.RunMockAsync(selected.Id,lane,AnalysisConsent.Approve("synthetic-repair",packet),state=>Status.Text="합성 작업: "+state,token);ReadHistory(saved.Id);
    });
    public void ReadHistory(string? selectedId=null)
    {
        if(busy&&selectedId is null)return;
        try{var items=store.List().Where(e=>e.Source==original.Source&&e.ReportId==original.ReportId).Select(repair.Recover).ToArray();History.ItemsSource=items;History.SelectedItem=items.FirstOrDefault(e=>e.Id==selectedId)??items.FirstOrDefault();Render();}
        catch(Exception e){Status.Text=UserErrors.Explain(e);}
    }
    private void Render()
    {
        if(Current is not {}e){Result.Text="분석 이력 없음. 분석 전에 비밀 제거 미리보기를 확인합니다.";return;}
        Result.Text=$"분석 ID {e.Id} · 제보 revision {e.ReportRevision} · {(e.ReportRevision==original.Revision?"현재 입력":"이전 입력 · 새 분석 필요")}\n\n검토 후 저장한 입력\n{e.Preview}\n\n{e.Finding.Display()}\n\n수정 작업 이력\n"+string.Join("\n\n",e.Jobs.Select(j=>$"{j.Id} · {j.Lane} · {j.State}\n{string.Join(" → ",j.Events)}\n수정 파일: {string.Join(", ",j.Files)}\n{j.Tests}\n비용 구분: {j.Cost.Bucket} · 기록된 외부 호출 {j.Cost.ExternalCalls} · 금액/토큰 미산정\n{j.Diff}\n{j.Risks}\n"+(j.State=="ready-for-review"?CodexBridge.PrCandidate(j):"실제 GitHub 게시 없음")));
    }
}
