using System.Diagnostics;
using System.Text.Json;
using RiftAssist.ControlCenter.Core;

internal static class StagingProofs
{
    public static async Task RunAsync(ProofSuite s,string temporary)
    {
        var profile=new SshProfile("127.0.0.1","synthetic_user",2222,"",Path.Combine(temporary,"known hosts"),"https://example.invalid");
        var activation=new StagingActivation(true,true,Guid.NewGuid().ToString("D"),new('a',64),StagingActivation.Bind(profile),DateTimeOffset.UtcNow.AddMinutes(20));
        var runner=new Runner();var empty=ProtocolJson.Element(new{});
        await s.CheckAsync("staging disabled by default before transport and never inherits Azure automatic connection",async()=>{
            await ProofSuite.ThrowsAsync(()=>new SshStagingClient(profile,new(),runner).CallAsync("status",empty));ProofSuite.Equal(runner.Calls,0);
        });
        s.Check("staging activation binds exact SSH profile site inventory and bounded expiry",()=>{
            activation.Require(profile);ProofSuite.Throws(()=>activation.Require(profile with{User="other"}));ProofSuite.Throws(()=>(activation with{ExpiresAt=DateTimeOffset.UtcNow.AddSeconds(-1)}).Require(profile));ProofSuite.Throws(()=>(activation with{InstallationVerified=false}).Require(profile));
        });
        s.Check("staging SSH uses one fixed installed broker command and existing strict host verification",()=>{
            var command=StagingSshPolicy.Build(profile,"{}");ProofSuite.True(command.Arguments.Contains("StrictHostKeyChecking=yes")&&command.Arguments.Contains("ClearAllForwardings=yes")&&command.Arguments.Last()==StagingSshPolicy.RemoteCommand);
            StagingSshPolicy.Validate(command);ProofSuite.Throws(()=>StagingSshPolicy.Validate(command with{Arguments=["sh -c arbitrary"]}));
        });
        s.Check("read-only SSH status avoids health routes that allocate operational SQLite sessions",()=>{
            var command=SshCommandPolicy.Build(profile);ProofSuite.True(!command.StandardInput.Contains("/api/health",StringComparison.Ordinal));ProofSuite.True(command.StandardInput.Contains("http://127.0.0.1:3001/",StringComparison.Ordinal)&&command.StandardInput.Contains(profile.ReadOnlyStatusUrl,StringComparison.Ordinal));
        });
        var client=new SshStagingClient(profile,activation,runner);
        await s.CheckAsync("staging read calls need no operation popup and correlate UTF8 response to request site and inventory",async()=>{
            var result=await client.CallAsync("status",empty);ProofSuite.Equal(result.Field("message").Text(),"합성 응답");ProofSuite.Equal(runner.Calls,1);
        });
        var payload=ProtocolJson.Element(new{plan=new{id=Guid.NewGuid().ToString("D"),digest=new string('b',64)},package=new{}});
        await s.CheckAsync("staging write needs separate exact approval and cannot change approved payload",async()=>{
            var before=runner.Calls;await ProofSuite.ThrowsAsync(()=>client.CallAsync("deploy",payload));var packet=client.Preview("deploy",payload);
            await ProofSuite.ThrowsAsync(()=>client.CallAsync("deploy",payload,AnalysisConsent.Approve("other",packet)));ProofSuite.Equal(runner.Calls,before);
            await client.CallAsync("deploy",payload,AnalysisConsent.Approve("staging-write",packet));ProofSuite.Equal(runner.Calls,before+1);
        });
        await s.CheckAsync("staging lost write response is uncertain with exactly one transmission and no retry",async()=>{
            runner.Lost=true;var before=runner.Calls;var packet=client.Preview("deploy",payload);
            try{await client.CallAsync("deploy",payload,AnalysisConsent.Approve("staging-write",packet));throw new InvalidOperationException();}catch(ControlException e){ProofSuite.True(e.Uncertain&&e.Code=="client-stage-result-uncertain");}
            ProofSuite.Equal(runner.Calls,before+1);runner.Lost=false;await client.CallAsync("inspect",ProtocolJson.Element(new{operationId=Guid.NewGuid().ToString("D")}));ProofSuite.Equal(runner.Calls,before+2);
        });
        await s.CheckAsync("staging early stdin closure cannot masquerade as a confirmed write",async()=>{
            runner.Early=true;var before=runner.Calls;var preview=client.Preview("deploy",payload);
            try{await client.CallAsync("deploy",payload,AnalysisConsent.Approve("staging-write",preview));throw new InvalidOperationException();}catch(ControlException e){ProofSuite.True(e.Uncertain);}
            ProofSuite.Equal(runner.Calls,before+1);runner.Early=false;
        });
        await s.CheckAsync("staging upstream authentication diagnostics never expose secret stderr",async()=>{
            runner.SshFailure=true;try{await client.CallAsync("status",empty);throw new InvalidOperationException();}catch(ControlException e){ProofSuite.True(!e.ToString().Contains("synthetic-sensitive",StringComparison.Ordinal));}runner.SshFailure=false;
        });
        await s.CheckAsync("staging unknown command and wrong response request ID fail closed",async()=>{
            var before=runner.Calls;await ProofSuite.ThrowsAsync(()=>client.CallAsync("restart-production",empty));ProofSuite.Equal(runner.Calls,before);
            runner.WrongId=true;await ProofSuite.ThrowsAsync(()=>client.CallAsync("status",empty));runner.WrongId=false;
        });
        var python=Environment.GetEnvironmentVariable("RIFTASSIST_CC_LOOPBACK_PYTHON");if(!string.IsNullOrEmpty(python))await s.CheckAsync("actual OpenSSH staging transport executes fixed remote protocol against synthetic loopback only",async()=>await Loopback(python,temporary));
    }
    private sealed class Runner:IStagingSshRunner
    {
        public int Calls;public bool Lost,SshFailure,WrongId,Early;
        public Task<SshProcessResult> RunAsync(StagingSshCommand command,CancellationToken c)
        {
            Calls++;StagingSshPolicy.Validate(command);if(Lost)throw new ControlException("client-ssh-session-lost");if(SshFailure)return Task.FromResult(new SshProcessResult(255,"","Permission denied synthetic-sensitive-stderr"));
            using var q=JsonDocument.Parse(command.StandardInput);var p=q.RootElement;
            return Task.FromResult(new SshProcessResult(0,JsonSerializer.Serialize(new{protocol=StagingSshPolicy.Protocol,requestId=WrongId?"wrong":p.Field("requestId").Text(),siteId=p.Field("siteId").Text(),inventoryHash=p.Field("inventoryHash").Text(),ok=true,result=new{message="합성 응답",productionEnabled=false}},ProtocolJson.Options),"",Early));
        }
    }
    private static async Task Loopback(string python,string temporary)
    {
        var root=Path.Combine(temporary,"staging SSH 루프백");Directory.CreateDirectory(root);var info=new ProcessStartInfo(python){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true};
        foreach(var arg in new[]{Path.Combine(AppContext.BaseDirectory,"fixtures/ssh-loopback.py"),root,"staging-json"})info.ArgumentList.Add(arg);
        using var server=Process.Start(info)??throw new InvalidOperationException();var errors=server.StandardError.ReadToEndAsync();
        try{
            using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(25));var line=await server.StandardOutput.ReadLineAsync(timeout.Token);using var json=JsonDocument.Parse(line??"{}");
            var profile=new SshProfile("127.0.0.1","synthetic_user",json.RootElement.GetProperty("port").GetInt32(),Path.Combine(root,"synthetic key.pem"),Path.Combine(root,"known hosts"),"https://example.invalid");
            var activation=new StagingActivation(true,true,Guid.NewGuid().ToString("D"),new('a',64),StagingActivation.Bind(profile),DateTimeOffset.UtcNow.AddMinutes(10));
            IStagingSshRunner runner=OperatingSystem.IsWindows()?new WindowsStagingSshRunner():new LinuxRunner(root);
            var result=await new SshStagingClient(profile,activation,runner).CallAsync("status",ProtocolJson.Element(new{}),c:timeout.Token);
            ProofSuite.Equal(result.Field("message").Text(),"합성 staging SSH");ProofSuite.True(File.Exists(Path.Combine(root,"stdin-verified")));
        }finally{if(!server.HasExited)server.Kill(true);await server.WaitForExitAsync();await errors;}
    }
    private sealed class LinuxRunner(string root):IStagingSshRunner
    {
        public Task<SshProcessResult> RunAsync(StagingSshCommand command,CancellationToken c){if(command.Profile.Host!="127.0.0.1")throw new InvalidOperationException();StagingSshPolicy.Validate(command);File.WriteAllText(Path.Combine(root,"NUL"),"");var info=WindowsOpenSshRunner.ProcessInfo("/usr/bin/ssh",command.Arguments);info.WorkingDirectory=root;return SshProcessIo.RunAsync(info,command.StandardInput,c);}
    }
}
