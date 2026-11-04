using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Nodes;

namespace RiftAssist.ControlCenter.Core;

public sealed record WorkspaceResult(ChangedSource[] Changes,string Diff,string Digest);
public interface IRepairWorkspace
{
    string Source{get;}
    string Before{get;}
    string TestBefore{get;}
    string Verify{get;}
    string Temp{get;}
    Task<Dictionary<string,string>> CreateAsync(RepositorySource repository,CancellationToken c);
    Task<WorkspaceResult> InspectAsync(RealRepairJob job,CancellationToken c);
    Task PrepareTestsAsync(RealRepairJob job,CancellationToken c);
}
public sealed class RepairWorkspace(string jobRoot,string git,IToolRunner runner):IRepairWorkspace
{
    public string Source=>Path.Combine(jobRoot,"Source");
    public string Before=>Path.Combine(jobRoot,"Before");
    public string TestBefore=>Path.Combine(jobRoot,"BeforeTest");
    public string Verify=>Path.Combine(jobRoot,"Verify");
    public string Temp=>Path.Combine(jobRoot,"Temp");
    private string Metadata=>Path.Combine(jobRoot,"BrokerGit");
    private async Task<ToolResult> Git(string[] arguments,CancellationToken c,int limit=2097152)
    {
        var args=new[]{"--no-pager","--git-dir="+Metadata,"--work-tree="+Source,"-c","core.hooksPath="+Path.Combine(jobRoot,"NoHooks"),"-c","credential.helper=","-c","commit.gpgSign=false"}.Concat(arguments).ToArray();
        var result=await runner.RunAsync(new(git,args,Source,Seconds:60,OutputLimit:limit),c);if(result.Exit!=0)throw new ControlException("client-real-git");return result;
    }
    public async Task<Dictionary<string,string>> CreateAsync(RepositorySource repository,CancellationToken c)
    {
        SafePath.NoLinks(jobRoot);if(Directory.Exists(Source))throw new ControlException("client-real-workspace");Directory.CreateDirectory(Source);Directory.CreateDirectory(Before);Directory.CreateDirectory(Temp);Directory.CreateDirectory(Path.Combine(jobRoot,"NoHooks"));
        var hashes=new Dictionary<string,string>(StringComparer.Ordinal);
        foreach(var f in repository.Files){c.ThrowIfCancellationRequested();if(!RepairScope.Exportable(f.Path)||hashes.Keys.Contains(f.Path,StringComparer.OrdinalIgnoreCase))throw new ControlException("client-real-scope");RepairScope.InspectBytes(f.Path,f.Bytes);foreach(var root in new[]{Source,Before}){var target=RepairScope.Resolve(root,f.Path);Directory.CreateDirectory(Path.GetDirectoryName(target)!);File.WriteAllBytes(target,f.Bytes);}hashes.Add(f.Path,Convert.ToHexStringLower(SHA256.HashData(f.Bytes)));}
        var init=await runner.RunAsync(new(git,["init","--bare",Metadata],jobRoot),c);if(init.Exit!=0)throw new ControlException("client-real-git");
        await Git(["add","--all"],c);await Git(["-c","user.name=RiftAssist Control Center","-c","user.email=local-control-center@invalid","commit","-m","Isolated source baseline"],c);
        Directory.CreateDirectory(RepairScope.Resolve(Source,RepairScope.Prefix+"tests/incident-tests"));return hashes;
    }
    private Dictionary<string,byte[]> Files(string root)
    {
        var result=new Dictionary<string,byte[]>(StringComparer.Ordinal);long total=0;var pending=new Stack<string>();pending.Push(root);
        while(pending.TryPop(out var directory)){
            SafePath.NoLinks(directory);foreach(var path in Directory.EnumerateFileSystemEntries(directory)){
                SafePath.NoLinks(path);if(Directory.Exists(path)){pending.Push(path);continue;}
                var rel=Path.GetRelativePath(root,path).Replace('\\','/');RepairScope.PathValid(rel);if(!RepairScope.Exportable(rel)||result.Count>=1200||new FileInfo(path).Length>524288)throw new ControlException("client-real-scope");
                var bytes=File.ReadAllBytes(path);RepairScope.InspectBytes(rel,bytes);total+=bytes.Length;if(total>33554432)throw new ControlException("client-real-source-limit");result.Add(rel,bytes);
            }
        }return result;
    }
    private void VerifyBaseline(RealRepairJob job)
    {var files=Files(Before);if(files.Count!=job.Baseline.Count||files.Any(p=>!job.Baseline.TryGetValue(p.Key,out var hash)||hash!=Convert.ToHexStringLower(SHA256.HashData(p.Value))))throw new ControlException("client-real-baseline");}
    private void DeriveManifests(Dictionary<string,byte[]> files)
    {
        var appPath=RepairScope.Derived[0];var backendPath=RepairScope.Derived[1];
        if(!files.ContainsKey(appPath)||!files.ContainsKey(backendPath))throw new ControlException("client-real-baseline");
        var observed=RepairScope.Derived.ToDictionary(p=>p,p=>files[p]);
        var appBytes=File.ReadAllBytes(RepairScope.Resolve(Before,appPath));var backendBytes=File.ReadAllBytes(RepairScope.Resolve(Before,backendPath));
        var app=JsonNode.Parse(appBytes)!.AsObject();if(app["ready"]?.GetValue<bool>()!=false)throw new ControlException("client-real-baseline");
        var hashes=app["hashes"]!.AsObject();var release=RepairScope.Prefix+"releases/v0.2.0/";
        foreach(var key in hashes.Select(p=>p.Key).ToArray()){if(!files.TryGetValue(release+key,out var bytes)){if(File.Exists(RepairScope.Resolve(Before,release+key)))hashes.Remove(key);continue;}hashes[key]=Convert.ToHexStringLower(SHA256.HashData(bytes));}
        foreach(var pair in files.Where(p=>p.Key.StartsWith(release+"src/",StringComparison.Ordinal)))hashes[pair.Key[release.Length..]]=Convert.ToHexStringLower(SHA256.HashData(pair.Value));
        var options=new JsonSerializerOptions(ProtocolJson.Options){WriteIndented=true,NewLine="\n"};files[appPath]=ProtocolJson.Utf8.GetBytes(app.ToJsonString(options)+"\n");
        var backend=JsonNode.Parse(backendBytes)!.AsObject();var inventory=backend["files"]!.AsObject();
        var names=inventory.Select(p=>p.Key).Concat(files.Keys.Where(p=>p.StartsWith(release+"src/",StringComparison.Ordinal)).Select(p=>p[release.Length..])).Distinct().Order(StringComparer.Ordinal);
        var next=new JsonObject();foreach(var name in names)if(files.TryGetValue(release+name,out var bytes))next[name]=Convert.ToHexStringLower(SHA256.HashData(bytes));backend["files"]=next;files[backendPath]=ProtocolJson.Utf8.GetBytes(backend.ToJsonString(options)+"\n");
        foreach(var path in RepairScope.Derived){var original=File.ReadAllBytes(RepairScope.Resolve(Before,path));if(!observed[path].SequenceEqual(original)&&!observed[path].SequenceEqual(files[path]))throw new ControlException("client-real-scope");File.WriteAllBytes(RepairScope.Resolve(Source,path),files[path]);}
    }
    public async Task<WorkspaceResult> InspectAsync(RealRepairJob job,CancellationToken c)
    {
        VerifyBaseline(job);var files=Files(Source);
        foreach(var path in files.Keys.Concat(job.Baseline.Keys).Distinct()){
            var hash=files.TryGetValue(path,out var bytes)?Convert.ToHexStringLower(SHA256.HashData(bytes)):"";
            if(job.Baseline.GetValueOrDefault(path,"")==hash)continue;
            if(!RepairScope.Editable(path)&&!RepairScope.Derived.Contains(path))throw new ControlException("client-real-scope");
        }
        DeriveManifests(files);var changes=new List<ChangedSource>();
        foreach(var path in files.Keys.Concat(job.Baseline.Keys).Distinct().Order(StringComparer.Ordinal)){
            var bytes=files.GetValueOrDefault(path);var after=bytes is null?"":Convert.ToHexStringLower(SHA256.HashData(bytes));var before=job.Baseline.GetValueOrDefault(path,"");
            if(before==after)continue;if(!RepairScope.Editable(path)&&!RepairScope.Derived.Contains(path))throw new ControlException("client-real-scope");changes.Add(new(path,bytes is null?null:ProtocolJson.Utf8.GetString(bytes),before,after));
        }
        if(changes.Count==0||changes.Count>80||changes.Sum(f=>f.Content?.Length??0)>700000)throw new ControlException("client-real-no-changes");
        await Git(["add","--all"],c);var diff=(await Git(["diff","--cached","--no-ext-diff","--no-textconv","--","."],c)).Output;if(diff.Length>700000)throw new ControlException("client-real-output-limit");
        return new(changes.ToArray(),diff,PrivacyPacket.Hash(JsonSerializer.Serialize(changes,ProtocolJson.Options)));
    }
    public Task PrepareTestsAsync(RealRepairJob job,CancellationToken c)
    {
        VerifyBaseline(job);var updated=Files(Source);if(!updated.ContainsKey(RepairScope.Repro))throw new ControlException("client-real-repro-required");
        if(Directory.Exists(Verify))throw new ControlException("client-real-workspace");Directory.CreateDirectory(Verify);
        // Trusted baseline tests overlaid on changed code; generated reproduction is run against both revisions.
        foreach(var file in updated){c.ThrowIfCancellationRequested();var bytes=file.Value;if(file.Key.StartsWith(RepairScope.Prefix+"tests/",StringComparison.Ordinal)&&job.Baseline.ContainsKey(file.Key))bytes=File.ReadAllBytes(RepairScope.Resolve(Before,file.Key));var path=RepairScope.Resolve(Verify,file.Key);Directory.CreateDirectory(Path.GetDirectoryName(path)!);File.WriteAllBytes(path,bytes);}
        if(Directory.Exists(TestBefore))throw new ControlException("client-real-workspace");Directory.CreateDirectory(TestBefore);
        foreach(var file in Files(Before)){var path=RepairScope.Resolve(TestBefore,file.Key);Directory.CreateDirectory(Path.GetDirectoryName(path)!);File.WriteAllBytes(path,file.Value);}
        var beforeRepro=RepairScope.Resolve(TestBefore,RepairScope.Repro);Directory.CreateDirectory(Path.GetDirectoryName(beforeRepro)!);File.WriteAllBytes(beforeRepro,updated[RepairScope.Repro]);return Task.CompletedTask;
    }
}
