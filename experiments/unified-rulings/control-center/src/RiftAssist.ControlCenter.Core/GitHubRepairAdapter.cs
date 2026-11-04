using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace RiftAssist.ControlCenter.Core;

public interface IRepairGitHub
{
    Task<RepositorySource> PrepareAsync(CancellationToken c);
    Task<string> PublishAsync(RealRepairJob job,Action<string> progress,CancellationToken c);
    Task<string?> FindPrAsync(RealRepairJob job,CancellationToken c);
    Task<bool> CanResumeAsync(RealRepairJob job,CancellationToken c);
}

// Auth stays in gh/GCM's OS-backed client context. No token extraction, repository clone or credentials in agent files.
public sealed class GitHubRepairAdapter(string gh,string directory,IToolRunner runner):IRepairGitHub
{
    private const string Repo="repos/"+RepairScope.Repository;
    private async Task<(int Status,JsonElement Body)> Request(string method,string endpoint,object? body,CancellationToken c)
    {
        if(endpoint!=Repo&&!endpoint.StartsWith(Repo+"/",StringComparison.Ordinal)&&endpoint!="user")throw new ControlException("client-real-github");
        var args=new List<string>{"api","--hostname","github.com","--include","--method",method,endpoint};if(body is not null)args.AddRange(["--input","-"]);
        var result=await runner.RunAsync(new(gh,args.ToArray(),directory,body is null?null:JsonSerializer.Serialize(body,new JsonSerializerOptions(ProtocolJson.Options){DefaultIgnoreCondition=System.Text.Json.Serialization.JsonIgnoreCondition.Never}),60,16777216),c);
        var match=Regex.Match(result.Output,@"\AHTTP/\S+\s+(\d{3})");var split=result.Output.IndexOf("\n\n",StringComparison.Ordinal);
        if(!match.Success||split<0)throw new ControlException("client-real-github");
        try{using var doc=JsonDocument.Parse(result.Output[(split+2)..]);return(int.Parse(match.Groups[1].Value),doc.RootElement.Clone());}catch{throw new ControlException("client-real-github");}
    }
    private static JsonElement Success((int Status,JsonElement Body) response)
    {if(response.Status is <200 or >=300)throw new ControlException(response.Status is 401 or 403?"client-real-github-auth":"client-real-github");return response.Body;}
    private async Task<JsonElement> Get(string endpoint,CancellationToken c)=>Success(await Request("GET",endpoint,null,c));
    private static string Sha(JsonElement p,string key="sha"){var value=p.GetProperty(key).GetString()??"";if(!Regex.IsMatch(value,@"\A[a-f0-9]{40}\z"))throw new ControlException("client-real-github");return value;}
    private async Task<(string Actor,long Id)> Authorize(CancellationToken c)
    {
        var repo=await Get(Repo,c);if(!repo.GetProperty("permissions").GetProperty("push").GetBoolean())throw new ControlException("client-real-github-auth");
        var actor=await Get("user",c);var login=actor.GetProperty("login").GetString()??"";var id=actor.GetProperty("id").GetInt64();
        if(!Regex.IsMatch(login,@"\A[A-Za-z0-9-]{1,39}\z")||id<1)throw new ControlException("client-real-github-auth");return(login,id);
    }
    private async Task<string> BaseHead(CancellationToken c)=>Sha((await Get(Repo+"/git/ref/heads/"+RepairScope.BaseBranch,c)).GetProperty("object"));
    public async Task<RepositorySource> PrepareAsync(CancellationToken c)
    {
        var actor=await Authorize(c);var commit=await BaseHead(c);var info=await Get(Repo+"/git/commits/"+commit,c);var tree=Sha(info.GetProperty("tree"));
        var list=await Get(Repo+"/git/trees/"+tree+"?recursive=1",c);if(list.GetProperty("truncated").GetBoolean())throw new ControlException("client-real-source-limit");
        var files=new List<SourceBlob>();var seen=new HashSet<string>(StringComparer.OrdinalIgnoreCase);long total=0;
        foreach(var entry in list.GetProperty("tree").EnumerateArray()){
            var path=entry.GetProperty("path").GetString()??"";if(!RepairScope.Exportable(path))continue;
            var mode=entry.GetProperty("mode").GetString();if(entry.GetProperty("type").GetString()!="blob"||mode is not("100644" or "100755")||RepairScope.Editable(path)&&mode!="100644"||!seen.Add(path))throw new ControlException("client-real-scope");
            if(files.Count>=1200||entry.GetProperty("size").GetInt64()>524288)throw new ControlException("client-real-source-limit");
            var sha=Sha(entry);var blob=await Get(Repo+"/git/blobs/"+sha,c);if(blob.GetProperty("encoding").GetString()!="base64")throw new ControlException("client-real-github");
            var bytes=Convert.FromBase64String(blob.GetProperty("content").GetString()??"");if(GitHash("blob",bytes)!=sha)throw new ControlException("client-real-github");RepairScope.InspectBytes(path,bytes);total+=bytes.Length;if(total>33554432)throw new ControlException("client-real-source-limit");files.Add(new(path,bytes));
        }
        if(!files.Any(f=>f.Path==RepairScope.Prefix+"tests/ruling-regression.test.cjs")||!files.Any(f=>f.Path==RepairScope.Prefix+"releases/v0.2.0/src/server.js"))throw new ControlException("client-real-source-limit");
        return new(commit,tree,actor.Actor,actor.Id,files.ToArray());
    }
    public static string GitHash(string type,byte[] bytes)
    {var head=Encoding.ASCII.GetBytes(type+" "+bytes.Length+"\0");var joined=new byte[head.Length+bytes.Length];head.CopyTo(joined,0);bytes.CopyTo(joined,head.Length);return Convert.ToHexStringLower(SHA1.HashData(joined));}
    private static string Message(RealRepairJob job)=>"RiftAssist incident "+job.Id+"\n\nReview candidate for "+RepairScope.BaseBranch+"; no merge or deployment.\n";
    public static string CommitHash(RealRepairJob job,string tree)
    {
        var identity=job.Actor+" <"+job.ActorId+"+"+job.Actor+"@users.noreply.github.com> "+job.Created.ToUnixTimeSeconds()+" +0000";
        return GitHash("commit",ProtocolJson.Utf8.GetBytes("tree "+tree+"\nparent "+job.BaseCommit+"\nauthor "+identity+"\ncommitter "+identity+"\n\n"+Message(job)));
    }
    public async Task<string?> FindPrAsync(RealRepairJob job,CancellationToken c)
    {
        var result=await Get(Repo+"/pulls?state=all&head=SacredHeart1390:"+job.Branch+"&base="+Uri.EscapeDataString(RepairScope.BaseBranch),c);
        var rows=result.EnumerateArray().ToArray();if(rows.Length>1)throw new ControlException("client-real-github-conflict");if(rows.Length==0)return null;
        var pr=rows[0];var url=pr.GetProperty("html_url").GetString()??"";
        var body=pr.GetProperty("body").GetString()??"";
        if(!Regex.IsMatch(url,@"\Ahttps://github\.com/SacredHeart1390/RiftAssist/pull/\d+\z")||!body.Contains("riftassist-job:"+job.Id,StringComparison.Ordinal)||!body.Contains("Review digest: "+job.ReviewHash,StringComparison.Ordinal)||pr.GetProperty("base").GetProperty("ref").GetString()!=RepairScope.BaseBranch||pr.GetProperty("head").GetProperty("ref").GetString()!=job.Branch)throw new ControlException("client-real-github-conflict");await VerifyCommit(job,Sha(pr.GetProperty("head")),c);return url;
    }
    private async Task VerifyCommit(RealRepairJob job,string sha,CancellationToken c)
    {
        var commit=await Get(Repo+"/git/commits/"+sha,c);var parents=commit.GetProperty("parents").EnumerateArray().ToArray();
        if(parents.Length!=1||Sha(parents[0])!=job.BaseCommit||CommitHash(job,Sha(commit.GetProperty("tree")))!=sha)throw new ControlException("client-real-github-conflict");
        var comparison=await Get(Repo+"/compare/"+job.BaseCommit+"..."+sha,c);var files=comparison.GetProperty("files").EnumerateArray().ToArray();
        if(files.Length!=job.Changes.Length||comparison.GetProperty("total_commits").GetInt32()!=1)throw new ControlException("client-real-github-conflict");
        foreach(var file in files){var change=job.Changes.SingleOrDefault(x=>x.Path==file.GetProperty("filename").GetString())??throw new ControlException("client-real-github-conflict");
            if(change.Content is null){if(file.GetProperty("status").GetString()!="removed")throw new ControlException("client-real-github-conflict");}
            else if(Sha(file)!=GitHash("blob",ProtocolJson.Utf8.GetBytes(change.Content)))throw new ControlException("client-real-github-conflict");}
    }
    public async Task<bool> CanResumeAsync(RealRepairJob job,CancellationToken c)
    {
        var actor=await Authorize(c);if(actor.Actor!=job.Actor||actor.Id!=job.ActorId||await BaseHead(c)!=job.BaseCommit)return false;
        var reference=await Request("GET",Repo+"/git/ref/heads/"+job.Branch,null,c);if(reference.Status==404)return true;await VerifyCommit(job,Sha(Success(reference).GetProperty("object")),c);return true;
    }
    public async Task<string> PublishAsync(RealRepairJob job,Action<string> progress,CancellationToken c)
    {
        var actor=await Authorize(c);if(actor.Actor!=job.Actor||actor.Id!=job.ActorId)throw new ControlException("client-real-github-auth");
        var existing=await FindPrAsync(job,c);if(existing is not null)return existing;
        if(await BaseHead(c)!=job.BaseCommit)throw new ControlException("client-real-base-moved");
        var entries=new List<object>();foreach(var change in job.Changes){if(!RepairScope.Editable(change.Path)&&!RepairScope.Derived.Contains(change.Path))throw new ControlException("client-real-scope");if(change.Content is not null)RepairScope.InspectBytes(change.Path,ProtocolJson.Utf8.GetBytes(change.Content));entries.Add(change.Content is null?new{path=change.Path,mode="100644",type="blob",sha=(string?)null}:(object)new{path=change.Path,mode="100644",type="blob",content=change.Content});}
        progress("원격 tree 생성");var tree=Sha(Success(await Request("POST",Repo+"/git/trees",new{base_tree=job.BaseTree,tree=entries},c)));
        var expected=CommitHash(job,tree);progress("결정적 커밋 생성");
        var who=new{name=job.Actor,email=job.ActorId+"+"+job.Actor+"@users.noreply.github.com",date=job.Created.UtcDateTime.ToString("yyyy-MM-ddTHH:mm:ssZ")};
        var commit=Success(await Request("POST",Repo+"/git/commits",new{message=Message(job),tree,parents=new[]{job.BaseCommit},author=who,committer=who},c));if(Sha(commit)!=expected)throw new ControlException("client-real-github-conflict");
        var reference=await Request("GET",Repo+"/git/ref/heads/"+job.Branch,null,c);
        if(reference.Status==404){progress("작업 브랜치 게시");Success(await Request("POST",Repo+"/git/refs",new{@ref="refs/heads/"+job.Branch,sha=expected},c));}
        else if(Sha(Success(reference).GetProperty("object"))!=expected)throw new ControlException("client-real-github-conflict");
        existing=await FindPrAsync(job,c);if(existing is not null)return existing;
        progress("Draft PR 생성");var body="riftassist-job:"+job.Id+"\n\nBase: `"+RepairScope.BaseBranch+"` @ "+job.BaseCommit+". Integration PR #1 remains open.\n\n"+PrivacyPacket.Create(job.Tests).Text+"\n\nChanged files:\n"+string.Join("\n",job.Changes.Select(f=>"- "+f.Path))+"\n\nUser review required. No automatic merge or Azure deployment.\nReview digest: "+job.ReviewHash;
        Success(await Request("POST",Repo+"/pulls",new{title="[incident] "+job.Id,head=job.Branch,@base=RepairScope.BaseBranch,draft=true,body},c));
        return await FindPrAsync(job,c)??throw new ControlException("client-real-github");
    }
}
