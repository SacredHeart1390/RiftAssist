using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace RiftAssist.ControlCenter.Core;

public sealed record ToolPaths(string Codex,string Git,string Gh,string Node);
public sealed record ToolCommand(string Executable,string[] Arguments,string Directory,string? Input=null,int Seconds=30,int OutputLimit=2097152,Action<string>? Line=null,IReadOnlyDictionary<string,string>? Variables=null);
public sealed record ToolResult(int Exit,string Output,string AuthKind="unknown");
public interface IToolRunner { Task<ToolResult> RunAsync(ToolCommand command,CancellationToken cancellation); }

// No shell, credential-valued environment, command echo, stderr log or automatic retry.
public sealed class NativeToolRunner(string? processLeaseRoot=null):IToolRunner
{
    public async Task<ToolResult> RunAsync(ToolCommand command,CancellationToken cancellation)
    {
        cancellation.ThrowIfCancellationRequested();
        if(!Path.IsPathFullyQualified(command.Executable)||!File.Exists(command.Executable))throw new ControlException("client-real-tool-missing");
        SafePath.NoLinks(command.Executable);SafePath.NoLinks(command.Directory);
        if(OperatingSystem.IsWindows()&&!command.Executable.EndsWith(".exe",StringComparison.OrdinalIgnoreCase))throw new ControlException("client-real-tool-missing");
        var start=new ProcessStartInfo(command.Executable){WorkingDirectory=command.Directory,UseShellExecute=false,CreateNoWindow=true,RedirectStandardInput=true,RedirectStandardOutput=true,RedirectStandardError=true,StandardInputEncoding=ProtocolJson.Utf8,StandardOutputEncoding=ProtocolJson.Utf8};
        start.Environment.Clear();
        foreach(var name in new[]{"SystemRoot","WINDIR","PATH","PATHEXT","USERPROFILE","LOCALAPPDATA","APPDATA","HOME"})if(Environment.GetEnvironmentVariable(name)is{}v)start.Environment[name]=v;
        start.Environment["GH_HOST"]="github.com";start.Environment["GH_PROMPT_DISABLED"]="1";start.Environment["GIT_TERMINAL_PROMPT"]="0";
        start.Environment["GIT_CONFIG_NOSYSTEM"]="1";start.Environment["GIT_CONFIG_GLOBAL"]=OperatingSystem.IsWindows()?"NUL":"/dev/null";
        start.Environment["GIT_PAGER"]="cat";start.Environment["NO_COLOR"]="1";start.Environment["GH_NO_UPDATE_NOTIFIER"]="1";
        if(command.Variables is not null)foreach(var pair in command.Variables){if(pair.Key is not("TEMP" or "TMP" or "RIFTASSI_TEST_RELEASE"))throw new ControlException("client-real-process");start.Environment[pair.Key]=pair.Value;}
        foreach(var arg in command.Arguments)start.ArgumentList.Add(arg);
        using var timeout=CancellationTokenSource.CreateLinkedTokenSource(cancellation);timeout.CancelAfter(TimeSpan.FromSeconds(command.Seconds));
        using var process=Process.Start(start)??throw new ControlException("client-real-process");using var job=WindowsOwnedProcess.Attach(process,command.Executable,command.Directory,processLeaseRoot);using var stop=timeout.Token.Register(()=>ChildProcess.Stop(process));
        try{
            var authKind="unknown";
            async Task Lines(StreamReader reader,int max,Action<string> accept)
            {
                try{var pending=new StringBuilder();var buffer=new char[4096];int count;
                    while((count=await reader.ReadAsync(buffer.AsMemory(),timeout.Token))>0){
                        for(var i=0;i<count;i++){
                            if(buffer[i]=='\n'){accept(pending.ToString().TrimEnd('\r'));pending.Clear();}
                            else{if(pending.Length>=max)throw new ControlException("client-real-output-limit");pending.Append(buffer[i]);}
                        }
                    }
                    if(pending.Length>0)accept(pending.ToString().TrimEnd('\r'));
                }catch{ChildProcess.Stop(process);throw;}
            }
            var errors=Lines(process.StandardError,262144,line=>{if(line.Contains("Logged in using ChatGPT",StringComparison.OrdinalIgnoreCase))authKind="chatgpt";if(line.Contains("API key",StringComparison.OrdinalIgnoreCase))authKind="api-key";});
            var output=new StringBuilder();
            Task Read()=>Lines(process.StandardOutput,command.Line is null?command.OutputLimit:262144,line=>{
                if(output.Length+line.Length+1>command.OutputLimit)throw new ControlException("client-real-output-limit");output.Append(line).Append('\n');command.Line?.Invoke(line);
            });
            var read=Read();await process.StandardInput.WriteAsync((command.Input??"").AsMemory(),timeout.Token);process.StandardInput.Close();
            await Task.WhenAll(read,process.WaitForExitAsync(timeout.Token),errors);timeout.Token.ThrowIfCancellationRequested();return new(process.ExitCode,output.ToString(),authKind);
        }catch(OperationCanceledException){throw new ControlException(cancellation.IsCancellationRequested?"client-real-cancelled":"client-real-timeout");}
        catch(ControlException){throw;}catch{throw new ControlException(cancellation.IsCancellationRequested?"client-real-cancelled":timeout.IsCancellationRequested?"client-real-timeout":"client-real-process");}
        finally{ChildProcess.Stop(process);}
    }
}

public sealed record ToolReadiness(string CodexVersion,bool ChatGpt,bool GitHub,bool Git,string Summary);
public sealed class ExternalToolInspector(ToolPaths tools,IToolRunner runner)
{
    public async Task<ToolReadiness> InspectAsync(string directory,CancellationToken c)
    {
        async Task<ToolResult> Run(string exe,params string[] args){try{return await runner.RunAsync(new(exe,args,directory),c);}catch(ControlException){c.ThrowIfCancellationRequested();return new(-1,"");}}
        var version=await Run(tools.Codex,"--version");var match=Regex.Match(version.Output,@"\bcodex(?:-cli)?\s+(\d+\.\d+\.\d+)\b");
        var v=match.Success?match.Groups[1].Value:"미설치/확인 불가";
        var login=await Run(tools.Codex,"login","status");
        var chat=login.Exit==0&&(login.AuthKind=="chatgpt"||login.Output.Contains("Logged in using ChatGPT",StringComparison.OrdinalIgnoreCase))&&login.AuthKind!="api-key"&&!login.Output.Contains("API key",StringComparison.OrdinalIgnoreCase);
        var git=await Run(tools.Git,"--version");var gh=await Run(tools.Gh,"auth","status","--hostname","github.com");
        return new(v,chat,gh.Exit==0,git.Exit==0,$"Codex {v} · ChatGPT 로그인 {(chat?"확인":"필요/확인 불가")} · Git {(git.Exit==0?"확인":"필요")} · GitHub {(gh.Exit==0?"확인":"gh 로그인 필요")}");
    }
}

public static class RepairScope
{
    public const string Repository="SacredHeart1390/RiftAssist";
    public const string BaseBranch="develop/v0.3.0";
    public const string Prefix="experiments/unified-rulings/";
    public const string Repro="experiments/unified-rulings/tests/incident-tests/repro.test.cjs";
    public static readonly string[] WritableDirectories=[Prefix+"releases/v0.3.0/src",Prefix+"tests/incident-tests"];
    public static readonly string[] Derived=[Prefix+"releases/v0.3.0/app-release.json",Prefix+"control-center/backend-manifest.json"];
    public static void PathValid(string path)
    {
        if(path.Length>240||path.Contains('\\')||path.Contains(':')||path.Any(char.IsControl)||Path.IsPathRooted(path)||path.Split('/').Any(p=>p is "" or "." or ".."||p.StartsWith('.')&&p is not(".gitignore" or ".gitattributes")))throw new ControlException("client-real-scope");
        if(!Regex.IsMatch(path,@"\A[A-Za-z0-9_./-]+\z"))throw new ControlException("client-real-scope");
    }
    public static bool Exportable(string path)
    {
        try{PathValid(path);}catch{return false;}
        if(path.Split('/').Any(p=>p is "private" or "knowledge-releases" or "source-updates" or "node_modules" or "bin" or "obj" or "logs" or "tmp" or "results" or "Settings" or "RealRepairs" or "ManualReports" or "IncidentAnalysis"))return false;
        if(!Regex.IsMatch(path,@"\.(?:js|cjs|mjs|json|cs|xaml|csproj|props|html|css|md|svg|ico|png|webmanifest)\z",RegexOptions.IgnoreCase)&&!path.EndsWith("/.gitattributes",StringComparison.Ordinal))return false;
        return path.StartsWith(Prefix+"tests/",StringComparison.Ordinal)||path.StartsWith(Prefix+"control-center/",StringComparison.Ordinal)&&!path.Contains("/dist/",StringComparison.Ordinal)
            ||new[]{"v0.1.7","v0.3.0"}.Any(v=>{var prefix=Prefix+"releases/"+v+"/";if(!path.StartsWith(prefix,StringComparison.Ordinal))return false;var relative=path[prefix.Length..];return new[]{"src/","public/","manager-ui/","scripts/","dev-fixtures/","app-release.json"}.Any(p=>relative.StartsWith(p,StringComparison.Ordinal))||!relative.Contains('/')&&(relative.EndsWith(".md",StringComparison.Ordinal)||relative.EndsWith(".example.json",StringComparison.Ordinal)||relative==".gitattributes");});
    }
    public static bool Editable(string path)=>WritableDirectories.Any(p=>path.StartsWith(p+"/",StringComparison.Ordinal))&&Regex.IsMatch(path,@"\.(?:js|cjs|json)\z")&&Exportable(path);
    public static void InspectBytes(string path,byte[] bytes)
    {
        if(bytes.Length>524288||bytes.AsSpan().StartsWith("SQLite format 3"u8))throw new ControlException("client-real-sensitive-source");
        if(path.EndsWith(".ico",StringComparison.OrdinalIgnoreCase)){if(bytes.Length<6||!bytes.AsSpan(0,4).SequenceEqual(new byte[]{0,0,1,0}))throw new ControlException("client-real-sensitive-source");return;}
        if(path.EndsWith(".png",StringComparison.OrdinalIgnoreCase)){if(bytes.Length<8||!bytes.AsSpan(0,8).SequenceEqual(new byte[]{137,80,78,71,13,10,26,10}))throw new ControlException("client-real-sensitive-source");return;}
        string text;try{text=ProtocolJson.Utf8.GetString(bytes);}catch{throw new ControlException("client-real-sensitive-source");}
        text=text.Replace("sk-regression-dummy-not-a-real-key","SYNTHETIC_TEST_CREDENTIAL",StringComparison.Ordinal);
        if(Regex.IsMatch(text,@"\b(?:sk-(?:proj-|admin-)?[A-Za-z0-9_-]{20,}|RGAPI-[\w-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"))throw new ControlException("client-real-sensitive-source");
        if(Regex.IsMatch(text,"(?i)(?:admin[_-]?key|manager[_-]?key|api[_-]?key|secret)\\s*[=:]\\s*[\"'][a-f0-9]{64}[\"']"))throw new ControlException("client-real-sensitive-source");
    }
    public static string Resolve(string root,string relative){PathValid(relative);var p=Path.GetFullPath(Path.Combine(root,relative.Replace('/',Path.DirectorySeparatorChar)));if(!SafePath.IsInside(root,p))throw new ControlException("client-real-scope");SafePath.NoLinks(p);return p;}
}
