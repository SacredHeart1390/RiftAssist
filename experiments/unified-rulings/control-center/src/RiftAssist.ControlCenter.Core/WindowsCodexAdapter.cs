using System.Net;
using System.Net.NetworkInformation;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace RiftAssist.ControlCenter.Core;

public sealed record IsolationTicket(string Workspace,string CliHash,DateTimeOffset Expires);
public sealed record CodexRunResult(string Summary,long? InputTokens,long? OutputTokens);
public sealed record RealTestReport(bool Passed,string Summary);
public interface IRealCodex
{
    Task<IsolationTicket> ProbeAsync(IRepairWorkspace workspace,CancellationToken c);
    Task<CodexRunResult> ExecuteAsync(IRepairWorkspace workspace,IsolationTicket ticket,PrivacyPacket packet,Action<string> progress,CancellationToken c);
    Task<RealTestReport> TestAsync(IRepairWorkspace workspace,RealRepairJob job,CancellationToken c);
}
public sealed class WindowsCodexAdapter(ToolPaths tools,IToolRunner runner):IRealCodex
{
    public static string ToolHash(string path)=>Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(path)));
    private static string Quote(string value)=>JsonSerializer.Serialize(value,ProtocolJson.Options);
    public static string[] Policy(IRepairWorkspace work,string node,string root)
    {
        var a=new List<string>{"--strict-config","-a","never"};
        void Set(string key,string value){a.Add("-c");a.Add(key+"="+value);}
        Set("windows.sandbox","\"elevated\"");Set("forced_login_method","\"chatgpt\"");Set("web_search","\"disabled\"");
        foreach(var name in new[]{"apps","plugins","hooks","codex_hooks","plugin_hooks","remote_plugin","in_app_browser","in_app_local_automation"})Set("features."+name,"false");
        Set("model_provider","\"openai\"");
        Set("default_permissions","\"riftassist\"");Set("permissions.riftassist.filesystem.\":root\"","\"deny\"");Set("permissions.riftassist.filesystem.\":minimal\"","\"read\"");
        Set("permissions.riftassist.filesystem.\":tmpdir\"","\"deny\"");Set("permissions.riftassist.filesystem.\":slash_tmp\"","\"deny\"");
        Set("permissions.riftassist.filesystem."+Quote(root),"\"read\"");Set("permissions.riftassist.filesystem."+Quote(Path.GetDirectoryName(node)!),"\"read\"");
        Set("permissions.riftassist.filesystem."+Quote(work.Temp),"\"write\"");
        if(root==work.Source)foreach(var relative in RepairScope.WritableDirectories)Set("permissions.riftassist.filesystem."+Quote(RepairScope.Resolve(root,relative)),"\"write\"");
        Set("permissions.riftassist.network.enabled","false");return a.ToArray();
    }
    private ToolCommand Sandbox(IRepairWorkspace work,string root,string[] command,int seconds=60)
    {return new(tools.Codex,Policy(work,tools.Node,root).Concat(new[]{"sandbox","--include-managed-config","--permission-profile","riftassist","--"}).Concat(command).ToArray(),root,Seconds:seconds,OutputLimit:16777216,Variables:new Dictionary<string,string>{{"TEMP",work.Temp},{"TMP",work.Temp}});}
    public async Task<IsolationTicket> ProbeAsync(IRepairWorkspace work,CancellationToken c)
    {
        if(!OperatingSystem.IsWindowsVersionAtLeast(10,0,19045))throw new ControlException("client-real-isolation");
        var ready=await new ExternalToolInspector(tools,runner).InspectAsync(work.Source,c);
        if(!Version.TryParse(ready.CodexVersion,out var version)||version<new Version(0,162,0)||!ready.ChatGpt||!ready.Git||!ready.GitHub)throw new ControlException("client-real-auth");
        // Managed/user MCP tools are not part of this OS sandbox boundary. Fail closed instead of inheriting them.
        var mcp=await runner.RunAsync(new(tools.Codex,["mcp","list","--json"],work.Source),c);
        try{using var d=JsonDocument.Parse(mcp.Output);if(mcp.Exit!=0||d.RootElement.ValueKind!=JsonValueKind.Array||d.RootElement.GetArrayLength()!=0)throw new IOException();}catch{throw new ControlException("client-real-isolation");}
        var outside=Path.Combine(Path.GetDirectoryName(work.Source)!,"outside-canary.txt");var marker=Guid.NewGuid().ToString("N");File.WriteAllText(outside,marker,ProtocolJson.Utf8);
        var write=outside+".write";SafePath.NoLinks(write);
        var address=NetworkInterface.GetAllNetworkInterfaces().Where(n=>n.OperationalStatus==OperationalStatus.Up).SelectMany(n=>n.GetIPProperties().UnicastAddresses).Select(a=>a.Address).FirstOrDefault(a=>a.AddressFamily==AddressFamily.InterNetwork&&!IPAddress.IsLoopback(a));
        if(address is null)throw new ControlException("client-real-isolation");
        var listener=new TcpListener(IPAddress.Any,0);listener.Start();
        try{
            var port=((IPEndPoint)listener.LocalEndpoint).Port;
            const string script="const fs=require('node:fs'),net=require('node:net');let read=false,write=false;try{read=fs.readFileSync(process.argv[1],'utf8')===process.argv[3]}catch{}try{fs.writeFileSync(process.argv[2],'public-canary');write=true}catch{}const socket=net.connect({host:process.argv[4],port:+process.argv[5]});let done=false;function end(network){if(done)return;done=true;socket.destroy();console.log(JSON.stringify({read,write,network}));}socket.on('connect',()=>end(true));socket.on('error',()=>end(false));setTimeout(()=>end(false),2000);";
            var args=new[]{"-e",script,outside,write,marker,address.ToString(),port.ToString()};
            var positive=await runner.RunAsync(new(tools.Node,args,work.Source,Seconds:10),c);using(var json=JsonDocument.Parse(positive.Output)){var p=json.RootElement;if(positive.Exit!=0||!p.GetProperty("read").GetBoolean()||!p.GetProperty("write").GetBoolean()||!p.GetProperty("network").GetBoolean())throw new ControlException("client-real-isolation");}File.Delete(write);
            var negative=await runner.RunAsync(Sandbox(work,work.Source,new[]{tools.Node}.Concat(args).ToArray()),c);
            using(var json=JsonDocument.Parse(negative.Output)){var p=json.RootElement;if(negative.Exit!=0||p.GetProperty("read").GetBoolean()||p.GetProperty("write").GetBoolean()||p.GetProperty("network").GetBoolean()||File.Exists(write))throw new ControlException("client-real-isolation");}
            // Verify both an allowed write and an immutable baseline-test write, not merely command startup.
            var allowed=Path.Combine(RepairScope.Resolve(work.Source,RepairScope.Prefix+"tests/incident-tests"),"probe.json");
            var denied=RepairScope.Resolve(work.Source,RepairScope.Prefix+"tests/sandbox-denied.json");
            const string permissions="const f=require('node:fs');let allow=false,deny=false;try{f.writeFileSync(process.argv[1],'{}');allow=true}catch{}try{f.writeFileSync(process.argv[2],'{}');deny=true}catch{}console.log(JSON.stringify({allow,deny}));";
            var result=await runner.RunAsync(Sandbox(work,work.Source,[tools.Node,"-e",permissions,allowed,denied]),c);using(var json=JsonDocument.Parse(result.Output))if(result.Exit!=0||!json.RootElement.GetProperty("allow").GetBoolean()||json.RootElement.GetProperty("deny").GetBoolean())throw new ControlException("client-real-isolation");
            if(File.Exists(allowed))File.Delete(allowed);if(File.Exists(denied))throw new ControlException("client-real-isolation");
            return new(work.Source,ToolHash(tools.Codex),DateTimeOffset.UtcNow.AddMinutes(5));
        }catch(ControlException){throw;}catch{throw new ControlException("client-real-isolation");}
        finally{listener.Stop();if(File.Exists(outside))File.Delete(outside);if(File.Exists(write))File.Delete(write);}
    }
    public async Task<CodexRunResult> ExecuteAsync(IRepairWorkspace work,IsolationTicket ticket,PrivacyPacket packet,Action<string> progress,CancellationToken c)
    {
        if(!OperatingSystem.IsWindows()||ticket.Workspace!=work.Source||ticket.Expires<DateTimeOffset.UtcNow||ticket.CliHash!=ToolHash(tools.Codex))throw new ControlException("client-real-isolation");
        var summary="";long? input=null,output=null;var finished=false;
        void Line(string line){var state=CodexBridge.EventState(line);progress(state);using var d=JsonDocument.Parse(line);var root=d.RootElement;
            if(state=="failed")throw new ControlException("client-real-codex-failed");
            if(root.Field("type").Text()=="item.completed"&&root.Field("item").Field("type").Text()=="agent_message")summary=PrivacyPacket.Create(root.Field("item").Field("text").Text()[..Math.Min(root.Field("item").Field("text").Text().Length,30000)]).Text;
            if(root.Field("type").Text()=="turn.completed"){finished=true;var u=root.Field("usage");if(u.Field("input_tokens").ValueKind==JsonValueKind.Number&&u.Field("input_tokens").TryGetInt64(out var a)&&a>=0)input=a;if(u.Field("output_tokens").ValueKind==JsonValueKind.Number&&u.Field("output_tokens").TryGetInt64(out var b)&&b>=0)output=b;}}
        var args=Policy(work,tools.Node,work.Source).Concat(new[]{"--permission-profile","riftassist","exec","--ignore-user-config","--json","--ephemeral","--skip-git-repo-check","-"}).ToArray();
        var result=await runner.RunAsync(new(tools.Codex,args,work.Source,packet.Text,1200,16777216,Line,new Dictionary<string,string>{{"TEMP",work.Temp},{"TMP",work.Temp}}),c);
        if(result.Exit!=0||!finished)throw new ControlException("client-real-codex-interrupted");return new(summary,input,output);
    }
    public async Task<RealTestReport> TestAsync(IRepairWorkspace work,RealRepairJob job,CancellationToken c)
    {
        if(!OperatingSystem.IsWindows())throw new ControlException("client-real-isolation");
        async Task<ToolResult> Test(string root,string[] args)=>await runner.RunAsync(Sandbox(work,root,new[]{tools.Node}.Concat(args).ToArray(),180),c);
        static (int Tests,int Fail) Counts(ToolResult r){var tests=Regex.Match(r.Output,@"(?m)^# tests (\d+)\s*$");var fail=Regex.Match(r.Output,@"(?m)^# fail (\d+)\s*$");return tests.Success&&fail.Success?(int.Parse(tests.Groups[1].Value),int.Parse(fail.Groups[1].Value)):(0,-1);}
        static string Failures(ToolResult r)=>PrivacyPacket.Create(string.Join("\n",r.Output.Split('\n').Where(l=>l.StartsWith("not ok ",StringComparison.Ordinal)).Take(15))).Text;
        var relative=RepairScope.Repro;var before=await Test(work.TestBefore,["--test","--test-reporter=tap","--test-concurrency=1",relative]);var after=await Test(work.Verify,["--test","--test-reporter=tap","--test-concurrency=1",relative]);
        if(before.Exit==0||Counts(before).Tests<1||Counts(before).Fail<1||after.Exit!=0||Counts(after).Tests<1||Counts(after).Fail!=0)return new(false,"재현 테스트 전후 확인 실패\n"+Failures(before)+"\n"+Failures(after));
        var tests=new[]{"ruling-regression.test.cjs","legal-operations.test.cjs","card-access.test.cjs","v020-environment.test.cjs","card-translation.test.cjs","card-sync.test.cjs","card-review.test.cjs","control-center.test.cjs","control-center-operations.test.cjs"}.Select(p=>RepairScope.Prefix+"tests/"+p).ToArray();
        var regression=await Test(work.Verify,new[]{"--test","--test-reporter=tap","--test-concurrency=1"}.Concat(tests).ToArray());
        if(regression.Exit!=0||Counts(regression).Tests<132||Counts(regression).Fail!=0)return new(false,"고정 Node 회귀 실패\n"+Failures(regression));
        var legacy=Sandbox(work,work.Verify,[tools.Node,"--test","--test-reporter=tap","--test-concurrency=1",RepairScope.Prefix+"tests/ruling-regression.test.cjs"],180);
        legacy=legacy with{Variables=new Dictionary<string,string>{{"TEMP",work.Temp},{"TMP",work.Temp},{"RIFTASSI_TEST_RELEASE","v0.1.7"}}};
        var old=await runner.RunAsync(legacy,c);if(old.Exit!=0||Counts(old).Tests<11||Counts(old).Fail!=0)return new(false,"v0.1.7 호환성 실패\n"+Failures(old));
        return new(true,"재현: baseline 실패 / 수정 후 통과. 변경 전 고정한 Node 회귀9개 suite와 v0.1.7 호환성 통과. WPF/브라우저 E2E/실제 Riot·OpenAI·Azure 검증은 미실행. 정답/배포 승인을 의미하지 않음.");
    }
}
