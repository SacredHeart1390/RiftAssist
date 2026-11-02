using System.Diagnostics;
using System.Net.Sockets;
using System.Text.Json;
using RiftAssist.ControlCenter.Core;

internal static class PhaseFourProofs
{
    internal const string Id = "12345678-1234-1234-1234-123456789abc";
    public static async Task RunAsync(ProofSuite suite, string node, string temporary)
    {
        suite.Check("production admin allows only existing login and exact read routes", () => {
            foreach(var path in new[]{"/api/status","/api/reports","/api/reports/"+Id}) AdminReadPolicy.Require(HttpMethod.Get,path);
            foreach(var path in new[]{"/api/start","/api/stop","/api/ai","/api/limits","/api/backup","/api/knowledge","/api/reports/"+Id+"?x=1","/api/reports/../status","https://example.invalid","/api/login"})
                ProofSuite.Throws(()=>AdminReadPolicy.Require(HttpMethod.Get,path));
            foreach(var method in new[]{HttpMethod.Post,HttpMethod.Delete,HttpMethod.Put,HttpMethod.Patch})
                foreach(var path in new[]{"/api/start","/api/reports/"+Id,"/api/status","/api/hosting"}) ProofSuite.Throws(()=>AdminReadPolicy.Require(method,path));
        });
        suite.Check("SSH admin stdin bridge is fixed to remote loopback 3100 without listener or remote exec", () => {
            var profile=new SshProfile("example.invalid","synthetic_user",22,"",Path.Combine(temporary,"known_hosts"),"https://example.invalid");
            var args=AdminReadPolicy.SshArguments(profile);AdminReadPolicy.ValidateSsh(profile,args);
            foreach(var value in new[]{"-W","127.0.0.1:3100","StrictHostKeyChecking=yes","BatchMode=yes","ClearAllForwardings=yes"}) ProofSuite.True(args.Contains(value));
            ProofSuite.True(!args.Any(a=>a is "-L" or "-R" or "-D" or "sh -s"));
            ProofSuite.Throws(()=>AdminReadPolicy.ValidateSsh(profile,[..args,"echo bad"]));
        });
        await using var server=await ManagerFixture.Start(node,Path.Combine(temporary,"admin-api"),"normal");
        await suite.CheckAsync("unchanged manager rejects untrusted Host Origin and missing cookie", async () => {
            foreach (var pair in new[] {
                ("GET /api/status HTTP/1.1\r\nHost: example.invalid\r\nConnection: close\r\n\r\n", "403"),
                ("GET /api/status HTTP/1.1\r\nHost: 127.0.0.1:3100\r\nConnection: close\r\n\r\n", "401"),
                ("POST /api/login HTTP/1.1\r\nHost: 127.0.0.1:3100\r\nOrigin: https://example.invalid\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}", "403")
            }) {
                using var tcp=new TcpClient(); await tcp.ConnectAsync("127.0.0.1",server.Port);
                var stream=tcp.GetStream(); await stream.WriteAsync(System.Text.Encoding.ASCII.GetBytes(pair.Item1));
                using var reader=new StreamReader(stream); var line=await reader.ReadLineAsync(); ProofSuite.True(line!.Contains(pair.Item2,StringComparison.Ordinal));
            }
        });
        var connector=new TcpConnector(server.Port);
        await using var client=new RemoteAdminReader(connector);
        await suite.CheckAsync("admin read before login cannot create even a loopback connection",async()=>{
            await ProofSuite.ThrowsAsync(()=>client.ReadAsync("/api/status"));ProofSuite.Equal(connector.Calls,0);
        });
        await suite.CheckAsync("unchanged v017 router rejects wrong key with sanitized authentication code",async()=>{
            try{await client.LoginAsync("invalid-test-credential");throw new InvalidOperationException();}catch(ControlException e){ProofSuite.Equal(e.Code,"client-admin-authentication");}
        });
        await suite.CheckAsync("existing login Origin Host and memory cookie authenticate real v017 router",async()=>{
            await client.LoginAsync("synthetic-token");ProofSuite.True(client.Authenticated);
            var view=RemoteAdminData.Status(await client.ReadAsync("/api/status"));ProofSuite.True(view.Ai.Contains("13회",StringComparison.Ordinal));ProofSuite.Equal(view.Limits["generations"],80);
        });
        await suite.CheckAsync("real readonly router returns synthetic report and linked Korean question answer",async()=>{
            var reports=RemoteAdminData.Reports(await client.ReadAsync("/api/reports"));ProofSuite.Equal(reports.Single().Id,Id);
            var detail=RemoteAdminData.Detail(await client.ReadAsync("/api/reports/"+Id),Id);
            ProofSuite.True(detail.Contains("합성 질문",StringComparison.Ordinal)&&detail.Contains("합성 답변",StringComparison.Ordinal));
            ProofSuite.True(!detail.Contains("synthetic-token",StringComparison.Ordinal)&&!detail.Contains("trace",StringComparison.Ordinal));
        });
        suite.Check("status projector never renders upstream error credentials or paths",()=>{
            var value=ProtocolJson.Element(new{appRunning=true,error="synthetic-token /private/synthetic",stats=new{day="2026-11-02",limits=OperationsPolicy.LimitLabels.Keys.ToDictionary(k=>k,k=>1),aiEnabled=false,calls=Array.Empty<object>()}});
            var view=RemoteAdminData.Status(value);ProofSuite.True(!view.Summary.Contains("synthetic-token",StringComparison.Ordinal)&&!view.Summary.Contains("/private",StringComparison.Ordinal));
        });
        await suite.CheckAsync("blocked route never reaches HTTP transport after authenticated reads",async()=>{
            var count=connector.Calls;await ProofSuite.ThrowsAsync(()=>client.ReadAsync("/api/start"));ProofSuite.Equal(connector.Calls,count);
            using var log=JsonDocument.Parse(File.ReadAllText(Path.Combine(server.Root,"requests.json")));
            var logText=File.ReadAllText(Path.Combine(server.Root,"requests.json"));
            ProofSuite.True(!logText.Contains("synthetic-token",StringComparison.Ordinal)&&!logText.Contains("rift_admin",StringComparison.Ordinal)&&!logText.Contains("합성 질문",StringComparison.Ordinal));
            ProofSuite.True(log.RootElement.EnumerateArray().All(r=>r.GetProperty("method").GetString()=="GET"||r.GetProperty("path").GetString()=="/api/login"));
        });
        foreach(var (mode,code) in new[]{("expired","client-admin-authentication"),("redirect","client-admin-http"),("bad-json","client-admin-response"),("oversize","client-admin-response"),("disconnect","client-admin-disconnected")})
            await suite.CheckAsync("admin HTTP failure clears cookie without sensitive response: "+mode,async()=>{
                await using var fixture=await ManagerFixture.Start(node,Path.Combine(temporary,"admin-"+mode),mode);
                await using var reader=new RemoteAdminReader(new TcpConnector(fixture.Port));await reader.LoginAsync("synthetic-token");
                try{await reader.ReadAsync("/api/status");throw new InvalidOperationException();}catch(ControlException e){ProofSuite.Equal(e.Code,code);ProofSuite.True(!e.ToString().Contains("synthetic-sensitive-output",StringComparison.Ordinal));}
                ProofSuite.True(!reader.Authenticated);
            });
        await suite.CheckAsync("admin HTTP cancellation stops read and invalidates cookie",async()=>{
            await using var fixture=await ManagerFixture.Start(node,Path.Combine(temporary,"admin-hang"),"hang");
            await using var reader=new RemoteAdminReader(new TcpConnector(fixture.Port));await reader.LoginAsync("synthetic-token");
            using var cancel=new CancellationTokenSource(100);
            try{await reader.ReadAsync("/api/status",cancel.Token);throw new InvalidOperationException();}catch(ControlException e){ProofSuite.Equal(e.Code,"client-admin-cancelled");}
            ProofSuite.True(!reader.Authenticated);
        });
        if(Environment.GetEnvironmentVariable("RIFTASSIST_CC_LOOPBACK_PYTHON") is {Length:>0} python)
            foreach(var mode in new[]{"admin-proxy","admin-denied"}) await suite.CheckAsync("real OpenSSH -W readonly API bridge: "+mode,async()=>{
                var root=Path.Combine(temporary,mode);Directory.CreateDirectory(root);
                var info=new ProcessStartInfo(python){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true};
                foreach(var arg in new[]{Path.Combine(AppContext.BaseDirectory,"fixtures/ssh-loopback.py"),root,mode,server.Port.ToString()})info.ArgumentList.Add(arg);
                using var ssh=Process.Start(info)!;var errors=ssh.StandardError.ReadToEndAsync();
                try{
                    using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(20));
                    using var json=JsonDocument.Parse((await ssh.StandardOutput.ReadLineAsync(timeout.Token))!);
                    var profile=new SshProfile("127.0.0.1","synthetic_user",json.RootElement.GetProperty("port").GetInt32(),Path.Combine(root,"synthetic key.pem"),Path.Combine(root,"known hosts"),"https://example.invalid");
                    await using var reader=new RemoteAdminReader(new TestSshConnector(profile,root));
                    if(mode=="admin-denied"){
                        try{await reader.LoginAsync("synthetic-token",timeout.Token);throw new InvalidOperationException();}catch(ControlException e){if(e.Code is not ("client-admin-forward-denied" or "client-admin-forward-failed"))throw new ControlException("fixture-admin-denied-got-"+e.Code);}
                    }else{
                        await reader.LoginAsync("synthetic-token",timeout.Token);var status=RemoteAdminData.Status(await reader.ReadAsync("/api/status",timeout.Token));
                        ProofSuite.True(status.Ai.Contains("13회",StringComparison.Ordinal));
                        var detail=RemoteAdminData.Detail(await reader.ReadAsync("/api/reports/"+Id,timeout.Token),Id);ProofSuite.True(detail.Contains("합성 답변",StringComparison.Ordinal));
                    }
                }finally{if(!ssh.HasExited)ssh.Kill(true);await ssh.WaitForExitAsync();await errors;}
            });
    }
    internal sealed class TcpConnector(int port):IAdminStreamConnector
    {
        public int Calls{get;private set;}
        public async ValueTask<Stream> ConnectAsync(CancellationToken cancellation){Calls++;var tcp=new TcpClient();try{await tcp.ConnectAsync("127.0.0.1",port,cancellation);return tcp.GetStream();}catch{tcp.Dispose();throw;}}
    }
    private sealed class TestSshConnector(SshProfile profile,string root):IAdminStreamConnector
    {
        public ValueTask<Stream> ConnectAsync(CancellationToken cancellation){
            var args=AdminReadPolicy.SshArguments(profile);AdminReadPolicy.ValidateSsh(profile,args);
            var exe=OperatingSystem.IsWindows()?WindowsOpenSshRunner.Executable(profile):"/usr/bin/ssh";
            var info=WindowsOpenSshRunner.ProcessInfo(exe,args);
            if(!OperatingSystem.IsWindows()){File.WriteAllText(Path.Combine(root,"NUL"),"");info.WorkingDirectory=root;}
            return ValueTask.FromResult<Stream>(new SshAdminStream(info));
        }
    }
    internal sealed class ManagerFixture(Process process,string root,int port):IAsyncDisposable
    {
        public string Root=>root;public int Port=>port;
        public static async Task<ManagerFixture> Start(string node,string root,string mode){
            Directory.CreateDirectory(root);var info=new ProcessStartInfo(node){UseShellExecute=false,CreateNoWindow=true,RedirectStandardOutput=true,RedirectStandardError=true};info.Environment.Clear();
            foreach(var k in new[]{"SystemRoot","WINDIR","TEMP","TMP"})if(Environment.GetEnvironmentVariable(k)is{}v)info.Environment[k]=v;
            foreach(var a in new[]{Path.Combine(AppContext.BaseDirectory,"fixtures/manager-readonly.cjs"),root,mode})info.ArgumentList.Add(a);
            var p=Process.Start(info)!;using var timeout=new CancellationTokenSource(TimeSpan.FromSeconds(10));
            try{using var json=JsonDocument.Parse((await p.StandardOutput.ReadLineAsync(timeout.Token))!);return new(p,root,json.RootElement.GetProperty("port").GetInt32());}catch{if(!p.HasExited)p.Kill(true);p.Dispose();throw;}
        }
        public async ValueTask DisposeAsync(){if(!process.HasExited)process.Kill(true);await process.WaitForExitAsync();await process.StandardError.ReadToEndAsync();process.Dispose();}
    }
}
