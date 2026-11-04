using System.Security.Cryptography;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace RiftAssist.ControlCenter.Core;

public sealed record DeploymentCandidate(string Branch,string Commit,string Title,bool TestsPassed,long[] RunIds)
{public override string ToString()=>Commit[..7]+" · "+Title+" · "+(TestsPassed?"CI 통과":"CI 미확인");}
public static class DeploymentPolicy
{
    public const string Target="synthetic-only";
    public static void RequireTarget(string target){if(target!=Target)throw new ControlException("client-deploy-production-disabled");}
    public static PrivacyPacket Preview(JsonElement plan)
    {var text="대상: 격리 합성 환경 (Azure 아님)\n"+(plan.Field("kind").Text()=="rollback"?"이전 앱/라우팅으로 복귀합니다. 버전별 DB·키·제보는 덮어쓰거나 삭제하지 않습니다.":"현재 합성 버전 백업·복원 검사 → 별도 새 릴리스/포트 검증 → 라우팅 전환을 승인합니다. 기존 자료는 보존합니다.")+"\n정확한 작업/버전/백업·전환 대상\n"+plan.GetRawText();return new(text,PrivacyPacket.Hash(text),0);}
}
public interface IDeploymentClient
{Task<JsonElement> CallAsync(string method,object payload,CancellationToken c,Action<string>? progress=null);}
public sealed class LocalDeploymentClient(string root,BackendLayout backend,string deploymentDirectory,string manifest,IToolRunner runner):IDeploymentClient
{
    public async Task<JsonElement> CallAsync(string method,object payload,CancellationToken c,Action<string>? progress=null)
    {
        if(!new[]{"init","status","reconcile","plan","deploy","rollback-plan","rollback","verify-backup"}.Contains(method))throw new ControlException("client-deploy-protocol");
        SafePath.NoLinks(root);SafePath.NoLinks(deploymentDirectory);SafePath.NoLinks(manifest);
        if(!Guid.TryParseExact(Path.GetFileName(root),"D",out _)||Path.GetFileName(Path.GetDirectoryName(root))!="DeploymentLabs")throw new ControlException("client-deploy-owner");
        if(method=="init"){var parent=Path.GetDirectoryName(root)!;Directory.CreateDirectory(parent);if(OperatingSystem.IsWindows())DpapiAdminCredentialVault.ProtectDirectory(parent);}
        using(var m=JsonDocument.Parse(File.ReadAllBytes(manifest))){if(m.RootElement.Field("scope").Text()!="synthetic-only"||m.RootElement.GetProperty("schemaVersion").GetInt32()!=1)throw new ControlException("client-backend-integrity");foreach(var required in new[]{"control.cjs","lab.cjs","ubuntu-contract.cjs"})if(!m.RootElement.GetProperty("files").TryGetProperty(required,out _))throw new ControlException("client-backend-integrity");foreach(var file in m.RootElement.GetProperty("files").EnumerateObject()){
            RepairScope.PathValid(file.Name);var path=RepairScope.Resolve(deploymentDirectory,file.Name);if(Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(path)))!=file.Value.GetString())throw new ControlException("client-backend-integrity");}}
        var request=JsonSerializer.SerializeToElement(payload,ProtocolJson.Options);var data=new Dictionary<string,object?>{{"protocol","riftassist-deployment-1"},{"target",DeploymentPolicy.Target},{"root",Path.GetFullPath(root)},{"method",method}};
        foreach(var p in request.EnumerateObject()){if(data.ContainsKey(p.Name))throw new ControlException("client-deploy-protocol");data[p.Name]=p.Value;}
        JsonElement? result=null;string? error=null;
        void Line(string line){using var d=JsonDocument.Parse(line);var p=d.RootElement;if(p.Field("type").Text()=="phase")progress?.Invoke("합성 배포: "+p.Field("phase").Text());else if(p.Field("type").Text()=="result"){if(result is not null||error is not null)throw new ControlException("client-deploy-protocol");if(p.GetProperty("ok").GetBoolean())result=p.GetProperty("result").Clone();else error=p.Field("code").Text();}else throw new ControlException("client-deploy-protocol");}
        var output=await runner.RunAsync(new(backend.Node,[Path.Combine(deploymentDirectory,"control.cjs")],deploymentDirectory,JsonSerializer.Serialize(data,ProtocolJson.Options),120,2097152,Line),c);
        if(output.Exit!=0||error is not null||result is null)throw new ControlException(error=="production-disabled"?"client-deploy-production-disabled":error=="busy"?"client-deploy-busy":error=="stale"?"client-deploy-stale":error is "package" or "package-path" or "package-hash" or "backup-integrity"?"client-deploy-"+error:"client-deploy-failed");return result.Value;
    }
}
public sealed class DeploymentCoordinator(IDeploymentClient client)
{
    public async Task<JsonElement> ExecuteAsync(string target,JsonElement plan,AnalysisConsent approval,object? package,CancellationToken c,Action<string>? progress=null)
    {
        DeploymentPolicy.RequireTarget(target);var kind=plan.Field("kind").Text();approval.Require(kind=="rollback"?"lab-rollback":"lab-deploy",DeploymentPolicy.Preview(plan));
        if(kind is not("rollback" or "deploy"))throw new ControlException("client-deploy-protocol");
        return await client.CallAsync(kind,new{plan,package,approval=plan.Field("digest").Text()},c,progress);
    }
}
public sealed class DeploymentCatalog(string gh,string directory,IToolRunner runner)
{
    private async Task<JsonElement> Get(string suffix,CancellationToken c){var r=await runner.RunAsync(new(gh,["api","--hostname","github.com","repos/"+RepairScope.Repository+"/"+suffix],directory,Seconds:60,OutputLimit:16777216),c);if(r.Exit!=0)throw new ControlException("client-real-github");try{return JsonDocument.Parse(r.Output).RootElement.Clone();}catch{throw new ControlException("client-real-github");}}
    public async Task<DeploymentCandidate[]> ListAsync(CancellationToken c)
    {
        var commits=await Get("commits?sha="+Uri.EscapeDataString(RepairScope.BaseBranch)+"&per_page=10",c);var result=new List<DeploymentCandidate>();
        foreach(var p in commits.EnumerateArray()){
            var sha=p.Field("sha").Text();if(!Regex.IsMatch(sha,"^[a-f0-9]{40}$"))throw new ControlException("client-real-github");
            var runs=await Get("actions/runs?head_sha="+sha+"&per_page=100",c);var rows=runs.GetProperty("workflow_runs").EnumerateArray().Where(r=>r.Field("head_sha").Text()==sha&&r.Field("head_branch").Text()==RepairScope.BaseBranch&&r.Field("conclusion").Text()=="success").ToArray();
            var ok=new[]{".github/workflows/control-center.yml",".github/workflows/rules-tests.yml"}.All(path=>rows.Any(r=>r.Field("path").Text()==path));
            var title=PrivacyPacket.Create(p.Field("commit").Field("message").Text().Split('\n')[0]).Text;result.Add(new(RepairScope.BaseBranch,sha,title,ok,rows.Select(r=>r.GetProperty("id").GetInt64()).ToArray()));
        }return result.ToArray();
    }
    public async Task<JsonElement> PackageAsync(DeploymentCandidate selected,CancellationToken c)
    {
        if(selected.Branch!=RepairScope.BaseBranch||!selected.TestsPassed)throw new ControlException("client-deploy-tests");
        var fresh=(await ListAsync(c)).SingleOrDefault(x=>x.Commit==selected.Commit&&x.TestsPassed)??throw new ControlException("client-deploy-tests");
        var source=await new GitHubRepairAdapter(gh,directory,runner).PrepareCommitAsync(fresh.Commit,c);return BuildPackage(source.Files,fresh.Commit,"github-actions",fresh.RunIds);
    }
    public static JsonElement BundledPackage(BackendLayout backend)
    {
        // The packaged developer build is explicitly synthetic evidence, never a production release approval.
        var files=backend.VerifiedPaths.Select(p=>new SourceBlob(RepairScope.Prefix+"releases/v0.3.0/"+p,File.ReadAllBytes(RepairScope.Resolve(backend.Root,p)))).ToArray();
        return BuildPackage(files,new('0',40),"synthetic",[]);
    }
    private static JsonElement BuildPackage(SourceBlob[] files,string commit,string evidence,long[] runs)
    {
        const string prefix=RepairScope.Prefix+"releases/v0.3.0/";var entries=new SortedDictionary<string,object>(StringComparer.Ordinal);
        foreach(var f in files.Where(f=>f.Path.StartsWith(prefix,StringComparison.Ordinal))){var name=f.Path[prefix.Length..];if(name!="app-release.json"&&!new[]{"src/","public/","manager-ui/","dev-fixtures/","scripts/"}.Any(p=>name.StartsWith(p,StringComparison.Ordinal))||!RepairScope.Exportable(f.Path))continue;RepairScope.InspectBytes(f.Path,f.Bytes);entries.Add(name,new{sha256=Convert.ToHexStringLower(SHA256.HashData(f.Bytes)),content=Convert.ToBase64String(f.Bytes)});}
        var body=JsonSerializer.SerializeToElement(new{schemaVersion=1,version="v0.3.0",branch=RepairScope.BaseBranch,commit,scope="development-only",ready=false,tests=new{status="success",commit,kind=evidence,runIds=runs},files=entries},ProtocolJson.Options);
        // Node JSON.stringify serializes raw UTF8 consistently; package includes ASCII/base64 only.
        var digest=PrivacyPacket.Hash(body.GetRawText());return ProtocolJson.Element(new{schemaVersion=1,version="v0.3.0",branch=RepairScope.BaseBranch,commit,scope="development-only",ready=false,tests=new{status="success",commit,kind=evidence,runIds=runs},files=entries,digest});
    }
}
