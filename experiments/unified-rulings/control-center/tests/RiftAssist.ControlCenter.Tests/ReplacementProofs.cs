using System.Text.Json;
using RiftAssist.ControlCenter.Core;
internal static class ReplacementProofs
{
    public static async Task RunAsync(ProofSuite s,string temporary)
    {
        var p=new SshProfile("127.0.0.1","synthetic_user",2222,"",Path.Combine(temporary,"known_hosts"),"https://example.invalid");
        var install=new StagingActivation(true,true,Guid.NewGuid().ToString("D"),new('c',64),StagingActivation.Bind(p),DateTimeOffset.UtcNow.AddMinutes(15));var runner=new Runner();var payload=ProtocolJson.Element(new{plan=new{id=Guid.NewGuid().ToString("D"),target="v0.2.0"}});var client=new SshReplacementClient(p,install,runner);
        await s.CheckAsync("single-instance deployment is disabled by default regardless of automatic Azure login",async()=>{await ProofSuite.ThrowsAsync(()=>new SshReplacementClient(p,new(),runner).CallAsync("status",ProtocolJson.Element(new{})));ProofSuite.Equal(runner.Calls,0);});
        s.Check("replacement uses a distinct fixed endpoint and preserves strict SSH host validation",()=>{var q=ReplacementSshPolicy.Build(p,"{}");ProofSuite.Equal(q.Arguments.Last(),ReplacementSshPolicy.RemoteCommand);ProofSuite.True(q.Arguments.Contains("StrictHostKeyChecking=yes"));ProofSuite.Throws(()=>ReplacementSshPolicy.Validate(q with{Arguments=["sh -c unsafe"]}));});
        await s.CheckAsync("single-instance reads require no confirmation and correlate Korean UTF8 responses",async()=>{var r=await client.CallAsync("status",ProtocolJson.Element(new{}));ProofSuite.Equal(r.Field("message").Text(),"한 버전만 실행");});
        await s.CheckAsync("replacement requires its own exact impact approval instead of a staging approval",async()=>{var before=runner.Calls;await ProofSuite.ThrowsAsync(()=>client.CallAsync("replace",payload));await ProofSuite.ThrowsAsync(()=>client.CallAsync("replace",payload,AnalysisConsent.Approve("staging-write",client.Preview("replace",payload))));ProofSuite.Equal(runner.Calls,before);await client.CallAsync("replace",payload,AnalysisConsent.Approve("replacement-write",client.Preview("replace",payload)));});
        await s.CheckAsync("lost single-instance write response is uncertain and never automatically resent",async()=>{runner.Lost=true;var before=runner.Calls;try{await client.CallAsync("replace",payload,AnalysisConsent.Approve("replacement-write",client.Preview("replace",payload)));throw new InvalidOperationException();}catch(ControlException e){ProofSuite.True(e.Uncertain);}ProofSuite.Equal(runner.Calls,before+1);runner.Lost=false;});
        await s.CheckAsync("replacement cannot use arbitrary remote commands or uncorrelated results",async()=>{var before=runner.Calls;await ProofSuite.ThrowsAsync(()=>client.CallAsync("exec",payload));ProofSuite.Equal(runner.Calls,before);runner.Wrong=true;await ProofSuite.ThrowsAsync(()=>client.CallAsync("status",ProtocolJson.Element(new{})));});
        await s.CheckAsync("replacement transport exceptions cannot report an unconfirmed write as safe to retry",async()=>{runner.Wrong=false;runner.ControlFailure=true;var before=runner.Calls;try{await client.CallAsync("replace",payload,AnalysisConsent.Approve("replacement-write",client.Preview("replace",payload)));throw new InvalidOperationException();}catch(ControlException e){ProofSuite.True(e.Uncertain);}ProofSuite.Equal(runner.Calls,before+1);});
    }
    private sealed class Runner:IReplacementSshRunner
    {
        public int Calls;public bool Lost,Wrong,ControlFailure;
        public Task<SshProcessResult> RunAsync(ReplacementSshCommand command,CancellationToken c){Calls++;ReplacementSshPolicy.Validate(command);if(Lost)throw new IOException("synthetic lost response");if(ControlFailure)throw new ControlException("client-stage-response");using var doc=JsonDocument.Parse(command.StandardInput);var q=doc.RootElement;return Task.FromResult(new SshProcessResult(0,JsonSerializer.Serialize(new{protocol=ReplacementSshPolicy.Protocol,requestId=Wrong?"wrong":q.Field("requestId").Text(),inventoryHash=q.Field("inventoryHash").Text(),ok=true,result=new{message="한 버전만 실행"}},ProtocolJson.Options),""));}
    }
}
