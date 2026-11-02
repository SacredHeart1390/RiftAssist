using System.Windows;
using System.Windows.Controls;
using System.Windows.Data;
using RiftAssist.ControlCenter.Core;

namespace RiftAssist.ControlCenter;

public sealed class ManualReportEditor:Window
{
    public ManualReportDraft Draft{get;}
    public ManualReportEditor(Window owner,ManualReportDraft draft)
    {
        NameScope.SetNameScope(this,new NameScope());Owner=owner;Draft=draft with{};DataContext=Draft;Title="수동 오류 제보 · 이 컴퓨터에 암호화 저장";Width=760;Height=790;MinHeight=500;MinWidth=560;WindowStartupLocation=WindowStartupLocation.CenterOwner;
        var root=new DockPanel{Margin=new Thickness(16)};Content=root;
        var actions=new StackPanel{Orientation=Orientation.Horizontal,HorizontalAlignment=HorizontalAlignment.Right};DockPanel.SetDock(actions,Dock.Bottom);root.Children.Add(actions);
        var cancel=new Button{Content="취소",IsCancel=true};var save=new Button{Content="저장",IsDefault=true};actions.Children.Add(cancel);actions.Children.Add(save);
        var fields=new StackPanel();root.Children.Add(new ScrollViewer{Content=fields,VerticalScrollBarVisibility=ScrollBarVisibility.Auto});
        fields.Children.Add(new TextBlock{Text="로컬 수동 제보입니다. Azure DB에 추가하거나 Codex로 전송하지 않습니다.",TextWrapping=TextWrapping.Wrap});
        void Text(string label,string property,int max,bool multi=true){fields.Children.Add(new TextBlock{Text=label,Margin=new Thickness(0,10,0,3)});var box=new TextBox{Name=property+"Input",MaxLength=max,AcceptsReturn=multi,TextWrapping=TextWrapping.Wrap,MinHeight=multi?65:28,MaxHeight=180,VerticalScrollBarVisibility=ScrollBarVisibility.Auto};box.SetBinding(TextBox.TextProperty,new Binding(property){Mode=BindingMode.TwoWay,UpdateSourceTrigger=UpdateSourceTrigger.PropertyChanged});fields.Children.Add(box);RegisterName(box.Name,box);}
        void Choices(string label,string property,string[] values){fields.Children.Add(new TextBlock{Text=label,Margin=new Thickness(0,10,0,3)});var box=new ComboBox{ItemsSource=values};box.SetBinding(ComboBox.SelectedItemProperty,new Binding(property){Mode=BindingMode.TwoWay});fields.Children.Add(box);}
        Text("오류 제목",nameof(Draft.Title),200,false);Choices("분류",nameof(Draft.Category),ManualReportDraft.Categories);Text("사용자 질문",nameof(Draft.Question),10000);Text("AI가 실제로 답변한 내용",nameof(Draft.ActualAnswer),30000);
        var memory=new CheckBox{Content="기억에 근거한 요약 (정확한 원문이 없는 경우)",Margin=new Thickness(0,10,0,0)};memory.SetBinding(CheckBox.IsCheckedProperty,new Binding(nameof(Draft.MemorySummary)){Mode=BindingMode.TwoWay});fields.Children.Add(memory);
        Text("사용자가 지적한 오류",nameof(Draft.Error),5000);Text("기대되는 올바른 판정",nameof(Draft.Expected),5000);Text("공식 규칙 근거 (관리자가 확인한 출처)",nameof(Draft.RuleEvidence),5000);Text("발생 버전",nameof(Draft.OccurredVersion),80,false);Choices("접수 경로",nameof(Draft.Channel),ManualReportDraft.Channels);Choices("처리 상태",nameof(Draft.Status),OperationsPolicy.ReportStates);Text("관리자 메모",nameof(Draft.AdminNote),3000);
        save.Click+=(_,_)=>{try{Draft.Validate();if(ActionConfirmation.Confirm(this,"수동 제보 저장","이 컴퓨터의 암호화 저장소"))DialogResult=true;}catch(Exception e){MessageBox.Show(this,UserErrors.Explain(e),"입력 확인");}};
    }
}
