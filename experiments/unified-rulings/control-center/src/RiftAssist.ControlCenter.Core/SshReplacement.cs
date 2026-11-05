using System.Text.Json;

namespace RiftAssist.ControlCenter.Core;

// Separate installed endpoint/approval; normal SSH login never enables deployment.
public sealed record ReplacementSshCommand(SshProfile Profile,IReadOnlyList<string> Arguments,string StandardInput);
public static class ReplacementSshPolicy
{
    public const string Protocol="riftassist-replacement-1";
    public const string RemoteCommand="/usr/bin/sudo -n -- /usr/local/libexec/riftassist-replacement-broker";
    public static readonly string[] Reads=["status","preflight","plan","rollback-plan","inspect"];
    public static readonly string[] Writes=["replace","rollback"];
    public static ReplacementSshCommand Build(SshProfile profile,string input)
    {
        if(ProtocolJson.Utf8.GetByteCount(input)>65536)throw new ControlException("client-stage-limit");
        var args=SshCommandPolicy.Build(profile).Arguments.ToArray();args[^1]=RemoteCommand;return new(profile,args,input);
    }
    public static void Validate(ReplacementSshCommand command)
    {
        if(!command.Arguments.SequenceEqual(Build(command.Profile,command.StandardInput).Arguments,StringComparer.Ordinal))throw new ControlException("client-production-control-blocked");
    }
}
public interface IReplacementSshRunner{Task<SshProcessResult> RunAsync(ReplacementSshCommand command,CancellationToken c);}
public sealed class WindowsReplacementSshRunner:IReplacementSshRunner
{
    public Task<SshProcessResult> RunAsync(ReplacementSshCommand command,CancellationToken c)
    {
        ReplacementSshPolicy.Validate(command);return SshProcessIo.RunAsync(WindowsOpenSshRunner.ProcessInfo(WindowsOpenSshRunner.Executable(command.Profile),command.Arguments),command.StandardInput,c);
    }
}
public sealed class SshReplacementClient(SshProfile profile,StagingActivation installation,IReplacementSshRunner runner)
{
    private static void Method(string method){if(!ReplacementSshPolicy.Reads.Contains(method)&&!ReplacementSshPolicy.Writes.Contains(method))throw new ControlException("client-stage-protocol");}
    public PrivacyPacket Preview(string method,JsonElement payload)
    {
        Method(method);installation.Require(profile);
        var hash=PrivacyPacket.Hash(JsonSerializer.Serialize(new{installation.SiteId,installation.InventoryHash,installation.ProfileHash,method,payload},ProtocolJson.Options));
        return new("단일 서비스 교체 · 짧은 사이트 중단\n대상: "+profile.User+"@"+profile.Host+":"+profile.Port+"\n작업: "+method+"\n기존 서비스 중지 → DB/키/설정 백업·독립 복원 검사 → 별도 데이터 사본으로 시작 → HTTPS/기능 점검. Caddy·3001/3100 유지. 한 버전만 실행. 실패 시 구 설정 복귀, 새 기록은 보존.\n계획: "+payload.GetRawText()+"\n실제 설치와 이 작업에 대한 별도 승인이 필요합니다.",hash,0);
    }
    public async Task<JsonElement> CallAsync(string method,JsonElement payload,AnalysisConsent? approval=null,CancellationToken c=default)
    {
        Method(method);installation.Require(profile);if(payload.ValueKind!=JsonValueKind.Object)throw new ControlException("client-stage-protocol");
        var write=ReplacementSshPolicy.Writes.Contains(method);
        if(write){if(approval is null)throw new ControlException("client-stage-approval");approval.Require("replacement-write",Preview(method,payload));}
        var requestId=Guid.NewGuid().ToString("D");var input=JsonSerializer.Serialize(new{protocol=ReplacementSshPolicy.Protocol,requestId,inventoryHash=installation.InventoryHash,method,payload},ProtocolJson.Options);
        using var timeout=CancellationTokenSource.CreateLinkedTokenSource(c);timeout.CancelAfter(TimeSpan.FromMinutes(8));
        try{
            var response=await runner.RunAsync(ReplacementSshPolicy.Build(profile,input),timeout.Token);
            if(response.InputClosedEarly||response.ExitCode!=0)throw new ControlException(write?"client-stage-result-uncertain":"client-stage-response",write);
            using var doc=JsonDocument.Parse(response.Output);var root=doc.RootElement;
            if(root.Field("protocol").Text()!=ReplacementSshPolicy.Protocol||root.Field("requestId").Text()!=requestId||root.Field("inventoryHash").Text()!=installation.InventoryHash||root.Field("ok").ValueKind!=JsonValueKind.True)throw new ControlException(write?"client-stage-result-uncertain":"client-stage-response",write);
            return root.GetProperty("result").Clone();
        }catch(ControlException e){if(write&&!e.Uncertain)throw new ControlException("client-stage-result-uncertain",true);throw;}catch{throw new ControlException(write?"client-stage-result-uncertain":"client-stage-response",write);}
        // No automatic retry, commit, routing change or fallback to the old staging endpoint.
    }
}
