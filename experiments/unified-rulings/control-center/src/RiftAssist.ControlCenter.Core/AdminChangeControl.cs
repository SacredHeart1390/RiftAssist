using System.Text.Json;

namespace RiftAssist.ControlCenter.Core;

public sealed record AdminApiStep(string Method, string Route);
public sealed record AdminChangePlan(string Action, JsonElement Parameters, IReadOnlyList<AdminApiStep> Steps, string Impact);
public static class AdminChangeContract
{
    public static readonly string[] Actions = ["start","stop","restart","ai","limits","update-report"];
    public static bool ProductionChangesEnabled => false; // Not a setting, CLI switch or approval checkbox.
    public static AdminChangePlan Plan(string action, object parameters)
    {
        try {
            var p=ProtocolJson.Element(parameters);var keys=p.EnumerateObject().Select(x=>x.Name).Order().ToArray();
            void Keys(params string[] expected){if(!keys.SequenceEqual(expected.Order()))throw new FormatException();}
            string route="/api/"+action;
            switch(action){
                case "start":case "stop":case "restart":Keys();break;
                case "ai":Keys("enabled");_=p.GetProperty("enabled").GetBoolean();break;
                case "limits":Keys("limits");OperationsPolicy.ValidateLimits(p.GetProperty("limits").EnumerateObject().ToDictionary(x=>x.Name,x=>x.Value.GetInt32()));break;
                case "update-report":Keys("id","status","note");var id=p.GetProperty("id").GetString();AdminReadPolicy.Require(HttpMethod.Get,"/api/reports/"+id);
                    if(!OperationsPolicy.ReportStates.Contains(p.GetProperty("status").GetString())||p.GetProperty("note").GetString() is not {} note||note.Length>3000)throw new FormatException();route="/api/reports/"+id;break;
                default:throw new FormatException();
            }
            var steps=action=="restart"?new[]{new AdminApiStep("POST","/api/stop"),new AdminApiStep("GET","/api/status"),new AdminApiStep("POST","/api/start"),new AdminApiStep("GET","/api/status")}:new[]{new AdminApiStep("POST",route),new AdminApiStep("GET",action=="update-report"?route:"/api/status")};
            var impact=action switch {"stop"=>"앱과 관리자가 소유한 공개 연결을 중지합니다. 웹사이트와 진행 중 요청이 중단될 수 있습니다. systemd 서비스 제어와는 다릅니다.","restart"=>"앱 중지 확인 뒤 다시 시작합니다. 사이트 중단이 발생하며 시작 실패 시 중지 상태가 유지될 수 있습니다.","start"=>"관리자가 앱을 시작합니다. 기존 관리자의 시작 경로에는 자료 모니터 기동도 포함되므로 운영 활성화 전 부수효과 확인이 필요합니다.","ai"=>"새 AI 판정 허용 상태를 변경합니다. 이미 진행 중인 요청 취소 API는 아닙니다.","limits"=>"기존 8개 호출 한도를 변경합니다. 사용량 초기화나 과금 한도 설정은 아닙니다.",_=>"선택 제보의 처리 상태를 변경하고 관리자 메모를 이력에 추가합니다. 원문 질문/답변을 수정하지 않습니다."};
            return new(action,p,steps,impact);
        }catch{throw new ControlException("client-admin-plan");}
    }
}
public interface IAdminChangeBackend
{
    Task<JsonElement> StatusAsync(CancellationToken cancellation);
    Task ChangeAsync(string method, JsonElement parameters, string reason, CancellationToken cancellation);
    Task<JsonElement> ReportAsync(string id, CancellationToken cancellation);
}
public sealed class DevelopmentAdminChangeBackend(DevelopmentOperations operations):IAdminChangeBackend
{
    public Task<JsonElement> StatusAsync(CancellationToken c)=>operations.ReadAsync("status",cancellation:c);
    public async Task ChangeAsync(string m,JsonElement p,string reason,CancellationToken c)=>_=await operations.ChangeAsync(m,p,reason,true,c);
    public Task<JsonElement> ReportAsync(string id,CancellationToken c)=>operations.ReadAsync("report",new{id},c);
}
public sealed record AdminChangeAudit(string OperationId, DateTimeOffset At, string Action, string Outcome, string Reason);
public sealed class AdminChangeCoordinator(IAdminChangeBackend backend, OperationsTarget target)
{
    private readonly SemaphoreSlim serial=new(1,1);
    private readonly List<AdminChangeAudit> audit=[];
    public IReadOnlyList<AdminChangeAudit> Audit=>audit.ToArray();
    public bool NeedsRefresh{get;private set;}=true;
    private void Require(){if(target!=OperationsTarget.IsolatedDevelopment)throw new ControlException("client-production-control-blocked");}
    private void Record(string id,string action,string outcome,string reason){audit.Add(new(id,DateTimeOffset.UtcNow,action,outcome,reason));if(audit.Count>200)audit.RemoveAt(0);}
    public async Task<JsonElement> RefreshAsync(CancellationToken c=default)
    {
        Require();if(!await serial.WaitAsync(0,c))throw new ControlException("client-admin-change-busy");
        try{NeedsRefresh=true;var status=await backend.StatusAsync(c);_=RemoteAdminData.Status(status);NeedsRefresh=false;return status;}finally{serial.Release();}
    }
    public async Task ExecuteAsync(string action,object parameters,bool confirmed,CancellationToken c=default)
    {
        Require();var plan=AdminChangeContract.Plan(action,parameters);
        if(!confirmed||NeedsRefresh)throw new ControlException("client-admin-change-refresh");
        if(!await serial.WaitAsync(0,c))throw new ControlException("client-admin-change-busy");
        var id=Guid.NewGuid().ToString("D");var reason=UserInteraction.AuditReason(action,"격리 합성 관리자"+(action=="update-report"?" / "+plan.Parameters.Field("id").Text():""));
        try{
            if(NeedsRefresh)throw new ControlException("client-admin-change-refresh");NeedsRefresh=true;Record(id,action,"started",reason);
            var p=plan.Parameters;
            if(action=="restart"){
                await backend.ChangeAsync("stop",ProtocolJson.Element(new{}),reason,c);
                var stopped=await backend.StatusAsync(c);_=RemoteAdminData.Status(stopped);if(stopped.GetProperty("appRunning").GetBoolean())throw new ControlException("client-admin-change-verification");
                await backend.ChangeAsync("start",ProtocolJson.Element(new{}),reason,c);
            }else await backend.ChangeAsync(action,p,reason,c);
            var status=await backend.StatusAsync(c);_=RemoteAdminData.Status(status);
            var valid=action switch{
                "start" or "restart"=>status.GetProperty("appRunning").GetBoolean(),"stop"=>!status.GetProperty("appRunning").GetBoolean(),
                "ai"=>status.GetProperty("stats").GetProperty("aiEnabled").GetBoolean()==p.GetProperty("enabled").GetBoolean(),
                "limits"=>p.GetProperty("limits").EnumerateObject().All(x=>status.GetProperty("stats").GetProperty("limits").GetProperty(x.Name).GetInt32()==x.Value.GetInt32()),_=>true};
            if(action=="update-report"){
                var report=await backend.ReportAsync(p.Field("id").Text(),c);_=RemoteAdminData.Detail(report,p.Field("id").Text());
                valid=report.Field("status").Text()==p.Field("status").Text() && report.Field("history").Rows().Any(h=>h.Field("status").Text()==p.Field("status").Text()&&h.Field("note").Text()==p.Field("note").Text());
            }
            if(!valid)throw new ControlException("client-admin-change-verification");
            Record(id,action,"verified",reason);NeedsRefresh=false;
        }catch{Record(id,action,"uncertain-refresh-required",reason);throw new ControlException("client-admin-change-uncertain",true);}
        finally{serial.Release();}
    }
}
