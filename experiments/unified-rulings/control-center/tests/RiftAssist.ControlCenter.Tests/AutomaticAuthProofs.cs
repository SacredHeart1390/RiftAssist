using System.Diagnostics;
using System.Text;
using System.Text.Json;
using RiftAssist.ControlCenter.Core;

internal static class AutomaticAuthProofs
{
    private static string Key => new('a',64);
    public static async Task RunAsync(ProofSuite suite,string node,string temporary)
    {
        var profile=new SshProfile("example.invalid","synthetic_user",22,"",Path.Combine(temporary,"known hosts"),"https://example.invalid");
        var command=ManagerKeyPolicy.Build(profile);
        suite.Check("manager key SSH command has one immutable file and rejects any script or argument mutation",()=>{
            ManagerKeyPolicy.Validate(command);ProofSuite.True(command.StandardInput.Contains(ManagerKeyPolicy.FixedPath,StringComparison.Ordinal));
            foreach(var flag in new[]{"StrictHostKeyChecking=yes","BatchMode=yes","ForwardAgent=no","ClearAllForwardings=yes"})ProofSuite.True(command.Arguments.Contains(flag));
            ProofSuite.True(!command.Arguments.Contains(ManagerKeyPolicy.FixedPath)&&!command.Arguments.Any(a=>a is "-L" or "-R" or "-D"));
            ProofSuite.Throws(()=>ManagerKeyPolicy.Validate(command with{StandardInput=command.StandardInput+"cat /tmp/other\n"}));
            ProofSuite.Throws(()=>ManagerKeyPolicy.Validate(command with{Arguments=[..command.Arguments,"arbitrary-command"]}));
        });
        suite.Check("secret lease accepts exact hex64 with optional newline and never formats its value",()=>{
            foreach(var suffix in new[]{"","\n","\r\n"}){using var lease=AdminKeyLease.Parse(Encoding.ASCII.GetBytes(Key+suffix));ProofSuite.True(!lease.ToString().Contains(Key,StringComparison.Ordinal));}
            foreach(var bad in new[]{"",new string('a',63),Key+" ",Key+"\r",new string('x',64),new string('a',67),"banner\n"+Key})ProofSuite.Throws(()=>AdminKeyLease.Parse(Encoding.ASCII.GetBytes(bad)));
        });
        await suite.CheckAsync("secret lease authenticates via existing API and disposed bytes cannot be reused",async()=>{
            var reader=new KeyReader();var lease=AdminKeyLease.Parse(Encoding.ASCII.GetBytes(Key));await lease.AuthenticateAsync(reader,default);ProofSuite.True(reader.Authenticated);
            lease.Dispose();await ProofSuite.ThrowsAsync(()=>lease.AuthenticateAsync(reader,default));
        });
        var worker=Path.Combine(temporary,"key-worker.cjs");File.WriteAllText(worker,"""
        const mode=process.argv[2];process.stdin.resume();process.stdin.on('end',()=>{
          if(mode==='good')process.stdout.write('a'.repeat(64));
          else if(mode==='huge'){process.stdout.write('a'.repeat(70000));setInterval(()=>{},1000)}
          else if(mode==='missing')process.exitCode=71;
          else if(mode==='permission')process.exitCode=72;
          else if(mode==='link')process.exitCode=73;
          else if(mode==='format')process.exitCode=74;
          else if(mode==='auth'){process.stderr.write('Permission denied (publickey). synthetic-sensitive-output');process.exitCode=255}
          else if(mode==='hang')setInterval(()=>{},1000);
          else process.stdout.write('invalid key');
        });
        """);
        ProcessStartInfo Info(string mode){var info=WindowsOpenSshRunner.ProcessInfo(node,[worker,mode]);return info;}
        await suite.CheckAsync("bounded child key output is consumed only as a redacted credential",async()=>{
            using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(5));using var lease=await SshManagerKeySource.RunProcessAsync(Info("good"),command.StandardInput,timeout.Token);
            var reader=new KeyReader();await lease.AuthenticateAsync(reader,default);ProofSuite.True(reader.Authenticated);
        });
        foreach(var (mode,expected) in new[]{("missing","client-manager-key-missing"),("permission","client-manager-key-permission"),("link","client-manager-key-file"),("format","client-manager-key-format"),("invalid","client-manager-key-format"),("huge","client-manager-key-format"),("auth","client-ssh-authentication")})
            await suite.CheckAsync("fixed key read sanitizes "+mode,async()=>{
                using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(5));
                try{using var lease=await SshManagerKeySource.RunProcessAsync(Info(mode),command.StandardInput,timeout.Token);throw new InvalidOperationException();}
                catch(ControlException e){ProofSuite.Equal(e.Code,expected);ProofSuite.True(!e.ToString().Contains(Key,StringComparison.Ordinal)&&!e.ToString().Contains("synthetic-sensitive-output",StringComparison.Ordinal));}
            });
        await suite.CheckAsync("key subprocess cancellation closes the process without leaking output",async()=>{
            using var cancel=new CancellationTokenSource(150);
            try{using var lease=await SshManagerKeySource.RunProcessAsync(Info("hang"),command.StandardInput,cancel.Token);throw new InvalidOperationException();}
            catch(ControlException e){ProofSuite.Equal(e.Code,"client-admin-cancelled");}
        });
        await suite.CheckAsync("automatic network retries stop at two with exactly five seconds between attempts",async()=>{
            var calls=0;var delays=new List<TimeSpan>();
            try{await AutomaticReadRetry.RunAsync((_,_)=>{calls++;throw new ControlException("client-ssh-disconnected");},(delay,_)=>{delays.Add(delay);return Task.CompletedTask;},default);throw new InvalidOperationException();}
            catch(ControlException e){ProofSuite.Equal(e.Code,"client-ssh-disconnected");}
            ProofSuite.Equal(calls,2);ProofSuite.True(delays.SequenceEqual(new[]{TimeSpan.FromSeconds(5)}));
        });
        await suite.CheckAsync("host-key and fixed file errors never retry automatically",async()=>{
            foreach(var code in new[]{"client-ssh-host-key-changed","client-ssh-authentication","client-manager-key-missing","client-manager-key-permission","client-manager-key-format"}){
                var calls=0;await ProofSuite.ThrowsAsync(()=>AutomaticReadRetry.RunAsync((_,_)=>{calls++;throw new ControlException(code);},(_,_)=>throw new InvalidOperationException(),default));ProofSuite.Equal(calls,1);
            }
        });
        await suite.CheckAsync("a transient recovery succeeds once and cannot create an unbounded retry loop",async()=>{
            var calls=0;await AutomaticReadRetry.RunAsync((_,_)=>{calls++;if(calls==1)throw new ControlException("client-admin-unavailable");return Task.CompletedTask;},(_,_)=>Task.CompletedTask,default);ProofSuite.Equal(calls,2);
        });
        if(OperatingSystem.IsLinux()){
            var path=Path.Combine(temporary,"synthetic-manager-file");File.WriteAllText(path,Key);
            var localScript=command.StandardInput.Replace(ManagerKeyPolicy.FixedPath,path,StringComparison.Ordinal);
            suite.Check("production policy rejects even the test-only alternate manager file",()=>ProofSuite.Throws(()=>ManagerKeyPolicy.Validate(command with{StandardInput=localScript})));
            await suite.CheckAsync("Ubuntu-compatible fixed script reads bounded local synthetic bytes and reports missing file",async()=>{
                var info=WindowsOpenSshRunner.ProcessInfo("/bin/sh",["-s"]);info.Environment["PATH"]="/usr/bin:/bin";
                using(var lease=await SshManagerKeySource.RunProcessAsync(info,localScript,default)){var reader=new KeyReader();await lease.AuthenticateAsync(reader,default);ProofSuite.True(reader.Authenticated);}
                File.Delete(path);info=WindowsOpenSshRunner.ProcessInfo("/bin/sh",["-s"]);info.Environment["PATH"]="/usr/bin:/bin";
                try{using var lease=await SshManagerKeySource.RunProcessAsync(info,localScript,default);throw new InvalidOperationException();}catch(ControlException e){ProofSuite.Equal(e.Code,"client-manager-key-missing");}
            });
        }
        if(Environment.GetEnvironmentVariable("RIFTASSIST_CC_LOOPBACK_PYTHON") is {Length:>0} python)
            foreach(var (mode,expected) in new (string,string?)[]{("key-good",null),("key-missing","client-manager-key-missing"),("key-invalid","client-manager-key-format")})
                await suite.CheckAsync("actual OpenSSH fixed-key mock: "+mode,async()=>{
                    var root=Path.Combine(temporary,mode);Directory.CreateDirectory(root);
                    var info=new ProcessStartInfo(python){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true};
                    foreach(var arg in new[]{Path.Combine(AppContext.BaseDirectory,"fixtures/ssh-loopback.py"),root,mode})info.ArgumentList.Add(arg);
                    using var server=Process.Start(info)!;var errors=server.StandardError.ReadToEndAsync();
                    try{
                        using var cancel=new CancellationTokenSource(TimeSpan.FromSeconds(15));using var json=JsonDocument.Parse((await server.StandardOutput.ReadLineAsync(cancel.Token))!);
                        var p=profile with{Host="127.0.0.1",Port=json.RootElement.GetProperty("port").GetInt32(),IdentityFile=Path.Combine(root,"synthetic key.pem"),KnownHostsFile=Path.Combine(root,"known hosts")};
                        var keyCommand=ManagerKeyPolicy.Build(p);ManagerKeyPolicy.Validate(keyCommand);File.WriteAllText(Path.Combine(root,"expected-input.txt"),keyCommand.StandardInput,ProtocolJson.Utf8);
                        var exe=OperatingSystem.IsWindows()?WindowsOpenSshRunner.Executable(p):"/usr/bin/ssh";var start=WindowsOpenSshRunner.ProcessInfo(exe,keyCommand.Arguments);
                        if(!OperatingSystem.IsWindows()){File.WriteAllText(Path.Combine(root,"NUL"),"");start.WorkingDirectory=root;}
                        try{using var lease=await SshManagerKeySource.RunProcessAsync(start,keyCommand.StandardInput,cancel.Token);ProofSuite.True(expected is null);var reader=new KeyReader();await lease.AuthenticateAsync(reader,default);ProofSuite.True(reader.Authenticated);
                            await using var manager=await PhaseFourProofs.ManagerFixture.Start(node,Path.Combine(root,"http"),"ssh-automatic");
                            await using var api=new RemoteAdminReader(new PhaseFourProofs.TcpConnector(manager.Port));
                            await lease.AuthenticateAsync(api,cancel.Token);
                            var status=RemoteAdminData.Status(await api.ReadAsync("/api/status",cancel.Token));ProofSuite.True(status.Ai.Contains("13회",StringComparison.Ordinal));
                            var reports=RemoteAdminData.Reports(await api.ReadAsync("/api/reports",cancel.Token));ProofSuite.Equal(reports.Count,1);
                            var detail=RemoteAdminData.Detail(await api.ReadAsync("/api/reports/"+PhaseFourProofs.Id,cancel.Token),PhaseFourProofs.Id);ProofSuite.True(detail.Contains("합성 제보",StringComparison.Ordinal));
                        }
                        catch(ControlException e){if(expected is null)throw;ProofSuite.Equal(e.Code,expected);}
                    }finally{if(!server.HasExited)server.Kill(true);await server.WaitForExitAsync();await errors;}
                });
    }
    private sealed class KeyReader:IRemoteAdminReader
    {
        public bool Authenticated{get;private set;}
        public Task LoginAsync(string key,CancellationToken cancellation=default){ProofSuite.Equal(key,Key);Authenticated=true;return Task.CompletedTask;}
        public Task<JsonElement> ReadAsync(string path,CancellationToken cancellation=default)=>throw new InvalidOperationException();
        public ValueTask DisposeAsync(){Authenticated=false;return ValueTask.CompletedTask;}
    }
}
