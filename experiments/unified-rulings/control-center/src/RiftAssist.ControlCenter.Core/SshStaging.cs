using System.Text.Json;
using System.Text.RegularExpressions;

namespace RiftAssist.ControlCenter.Core;

// Installation and a per-operation approval are separate from existing read-only Azure login.
// Nothing in the normal startup path creates this activation or calls this adapter.
public sealed record StagingActivation(bool Enabled=false,bool InstallationVerified=false,string SiteId="",string InventoryHash="",string ProfileHash="",DateTimeOffset ExpiresAt=default)
{
    public void Require(SshProfile profile)
    {
        profile.Validate();
        if(!Enabled||!InstallationVerified||!Guid.TryParseExact(SiteId,"D",out _)||SiteId!=SiteId.ToLowerInvariant()
           ||!Regex.IsMatch(InventoryHash,"\\A[a-f0-9]{64}\\z")||ProfileHash!=Bind(profile)||ExpiresAt<=DateTimeOffset.UtcNow||ExpiresAt>DateTimeOffset.UtcNow.AddHours(1))throw new ControlException("client-stage-disabled");
    }
    public static string Bind(SshProfile profile)=>PrivacyPacket.Hash(JsonSerializer.Serialize(profile,ProtocolJson.Options));
}
public sealed record StagingSshCommand(SshProfile Profile,IReadOnlyList<string> Arguments,string StandardInput);
public static class StagingSshPolicy
{
    public const string RemoteCommand="/usr/bin/sudo -n -- /usr/local/libexec/riftassist-stage-broker";
    public const string Protocol="riftassist-staging-1";
    public static readonly string[] Reads=["status","preflight","plan","rollback-plan","verify-backup","inspect"];
    public static readonly string[] Writes=["deploy","rollback"];
    public static StagingSshCommand Build(SshProfile profile,string input)
    {
        // Reuse all Windows OpenSSH host-key/agent/config and forwarding restrictions.
        var args=SshCommandPolicy.Build(profile).Arguments.ToArray();args[^1]=RemoteCommand;
        if(ProtocolJson.Utf8.GetByteCount(input)>20*1024*1024)throw new ControlException("client-stage-limit");
        return new(profile,args,input);
    }
    public static void Validate(StagingSshCommand command)
    {
        var expected=Build(command.Profile,command.StandardInput);
        if(!command.Arguments.SequenceEqual(expected.Arguments,StringComparer.Ordinal))throw new ControlException("client-production-control-blocked");
    }
}
public interface IStagingSshRunner {Task<SshProcessResult> RunAsync(StagingSshCommand command,CancellationToken c);}
public sealed class WindowsStagingSshRunner:IStagingSshRunner
{
    public Task<SshProcessResult> RunAsync(StagingSshCommand command,CancellationToken c)
    {
        StagingSshPolicy.Validate(command);
        var executable=WindowsOpenSshRunner.Executable(command.Profile);
        return SshProcessIo.RunAsync(WindowsOpenSshRunner.ProcessInfo(executable,command.Arguments),command.StandardInput,c);
    }
}
public sealed class SshStagingClient(SshProfile profile,StagingActivation activation,IStagingSshRunner runner)
{
    private static void Method(string method){if(!StagingSshPolicy.Reads.Contains(method)&&!StagingSshPolicy.Writes.Contains(method))throw new ControlException("client-stage-protocol");}
    public PrivacyPacket Preview(string method,JsonElement payload)
    {
        Method(method);activation.Require(profile);
        var hash=PrivacyPacket.Hash(JsonSerializer.Serialize(new{activation.SiteId,activation.InventoryHash,activation.ProfileHash,method,payload},ProtocolJson.Options));
        var text="대상: 별도 Ubuntu staging (운영 배포 아님)\nSSH: "+profile.User+"@"+profile.Host+":"+profile.Port+"\nsite: "+activation.SiteId+"\ninventory: "+activation.InventoryHash+"\n작업: "+method+"\n정확한 요청 해시: "+hash+"\n새 릴리스/DB/키 분리 · 사전 백업/복원 검사 · 실패 시 staging v017 라우팅 복귀. 운영 systemd/Caddy/DB는 대상이 아닙니다.\n실제 Azure에서 실행하기 전 설치·접속·해당 작업의 별도 승인이 필요합니다.";
        if(payload.TryGetProperty("plan",out var plan))text+="\n계획: "+plan.GetRawText();
        return new(text,hash,0);
    }
    public async Task<JsonElement> CallAsync(string method,JsonElement payload,AnalysisConsent? approval=null,CancellationToken c=default)
    {
        Method(method);activation.Require(profile);var write=StagingSshPolicy.Writes.Contains(method);
        if(write){if(approval is null)throw new ControlException("client-stage-approval");approval.Require("staging-write",Preview(method,payload));}
        if(payload.ValueKind!=JsonValueKind.Object)throw new ControlException("client-stage-protocol");
        var requestId=Guid.NewGuid().ToString("D");
        var input=JsonSerializer.Serialize(new{protocol=StagingSshPolicy.Protocol,siteId=activation.SiteId,inventoryHash=activation.InventoryHash,requestId,method,payload},ProtocolJson.Options);
        var command=StagingSshPolicy.Build(profile,input);
        using var timeout=CancellationTokenSource.CreateLinkedTokenSource(c);timeout.CancelAfter(TimeSpan.FromSeconds(240));
        try {
            var result=await runner.RunAsync(command,timeout.Token);
            if(result.InputClosedEarly)throw new ControlException(write?"client-stage-result-uncertain":"client-stage-response",write);
            if(result.ExitCode==255){var reason=SshDiagnostics.FailureCode(result)??"client-stage-ssh";throw new ControlException(write?"client-stage-result-uncertain":reason,write);}
            using var document=JsonDocument.Parse(result.Output);var root=document.RootElement;
            if(root.Field("protocol").Text()!=StagingSshPolicy.Protocol)throw new ControlException("client-stage-response",write);
            if(result.ExitCode!=0||root.Field("ok").ValueKind!=JsonValueKind.True)throw new ControlException(write?"client-stage-result-uncertain":"client-stage-rejected",write);
            if(root.Field("requestId").Text()!=requestId||root.Field("siteId").Text()!=activation.SiteId||root.Field("inventoryHash").Text()!=activation.InventoryHash)throw new ControlException("client-stage-response",write);
            return root.GetProperty("result").Clone();
        } catch(OperationCanceledException){throw new ControlException(write?"client-stage-result-uncertain":c.IsCancellationRequested?"client-stage-cancelled":"client-stage-timeout",write);}
        catch(ControlException e){if(write&&!e.Uncertain)throw new ControlException("client-stage-result-uncertain",true);throw;}
        catch{throw new ControlException(write?"client-stage-result-uncertain":"client-stage-response",write);}
        // Never retry a write. Reconnect and inspect the SAME operation ID first.
    }
}
