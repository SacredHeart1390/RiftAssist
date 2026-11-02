using System.Security.AccessControl;
using System.Security.Principal;
using System.Text.Json;
using RiftAssist.ControlCenter.Core;

internal static class SavedLoginProofs
{
    private static string Key => new('a', 64); // Generated nonfunctional synthetic key only.
    public static async Task RunAsync(ProofSuite suite, string temporary)
    {
        var profile = new SshProfile("example.invalid", "synthetic_user", 22, "", Path.Combine(temporary,"known_hosts"), "https://example.invalid");
        var reference = AdminCredentialReference.For(profile);
        var root = Path.Combine(temporary,"saved-login"); var vault = new MemoryVault(); var preferences = new AdminLoginPreferences(root); var service = new SavedAdminLogin(vault,preferences);
        var authentications = 0; Task Accept(string key) { ProofSuite.Equal(key,Key); authentications++; return Task.CompletedTask; }
        suite.Check("credential identity survives ZIP updates and SSH key-path rotation but isolates targets/schemes",()=>{
            ProofSuite.Equal(reference,AdminCredentialReference.For(profile with {IdentityFile=Path.Combine(temporary,"new SSH file")}));
            ProofSuite.True(reference!=AdminCredentialReference.For(profile with {Host="other.invalid"}));
            ProofSuite.True(reference!=AdminCredentialReference.For(profile with {User="other_user"}));
            ProofSuite.True(reference!=AdminCredentialReference.For(profile,"server-readonly-key-v1"));
        });
        await suite.CheckAsync("fresh login defaults have no secret read and startup cannot authenticate",async()=>{
            ProofSuite.True(!service.Preference(reference).Remember&&!service.Preference(reference).AutoConnect);
            await ProofSuite.ThrowsAsync(()=>service.AuthenticateSavedAsync(reference,Accept,startup:true));
            ProofSuite.Equal(vault.Reads,0);ProofSuite.Equal(authentications,0);
        });
        await suite.CheckAsync("successful unchecked login never stores a key or enables startup",async()=>{
            await service.AuthenticateManualAsync(reference,Key,false,true,Accept);ProofSuite.Equal(vault.Writes,0);ProofSuite.True(!Directory.Exists(root));
            ProofSuite.True(!service.Preference(reference).Remember&&!service.Preference(reference).AutoConnect);
        });
        await suite.CheckAsync("remember option saves only after authentication and startup remains separate",async()=>{
            await service.AuthenticateManualAsync(reference,Key,true,false,Accept);ProofSuite.Equal(vault.Writes,1);
            ProofSuite.True(service.Preference(reference).Remember&&!service.Preference(reference).AutoConnect);
            var reads=vault.Reads;await ProofSuite.ThrowsAsync(()=>service.AuthenticateSavedAsync(reference,Accept,startup:true));ProofSuite.Equal(vault.Reads,reads);
            await service.AuthenticateSavedAsync(reference,Accept);ProofSuite.Equal(vault.Reads,reads+1);
        });
        await suite.CheckAsync("failed first authentication never writes a remembered credential", async () => {
            var rejectedVault = new MemoryVault(); var rejectedPreferences = new AdminLoginPreferences(Path.Combine(temporary, "failed-first")); var rejected = new SavedAdminLogin(rejectedVault, rejectedPreferences);
            await ProofSuite.ThrowsAsync(() => rejected.AuthenticateManualAsync(reference, Key, true, true, _ => throw new ControlException("client-admin-authentication")));
            ProofSuite.Equal(rejectedVault.Writes, 0); ProofSuite.True(!rejectedPreferences.Read(reference).Remember && !rejectedPreferences.Read(reference).AutoConnect);
        });
        await suite.CheckAsync("protected storage failure cannot enable auto connect or fall back to plaintext", async () => {
            var brokenVault = new MemoryVault { FailWrite = true }; var brokenPreferences = new AdminLoginPreferences(Path.Combine(temporary, "failed-save")); var broken = new SavedAdminLogin(brokenVault, brokenPreferences);
            try { await broken.AuthenticateManualAsync(reference, Key, true, true, _ => Task.CompletedTask); throw new InvalidOperationException(); }
            catch (ControlException e) { ProofSuite.Equal(e.Code, "client-credential-save"); }
            ProofSuite.True(brokenVault.Value is null && !brokenPreferences.Read(reference).AutoConnect);
        });
        suite.Check("login JSON contains only version binding scheme and opt-in booleans",()=>{
            var data=File.ReadAllText(Path.Combine(root,reference.ProfileId+".local.json"));using var json=JsonDocument.Parse(data);
            ProofSuite.Equal(json.RootElement.EnumerateObject().Count(),5);ProofSuite.True(!data.Contains(Key,StringComparison.Ordinal)&&!data.Contains("cookie",StringComparison.OrdinalIgnoreCase));
        });
        await suite.CheckAsync("explicit auto opt-in permits one startup authentication with stored data",async()=>{
            service.SetAutoConnect(reference,true);var before=authentications;await service.AuthenticateSavedAsync(reference,Accept,startup:true);ProofSuite.Equal(authentications,before+1);
        });
        await suite.CheckAsync("changed admin key rejects saved credential and deletes it without retry",async()=>{
            try{await service.AuthenticateSavedAsync(reference,_=>throw new ControlException("client-admin-authentication"),startup:true);throw new InvalidOperationException();}
            catch(ControlException e){ProofSuite.Equal(e.Code,"client-admin-authentication");}
            ProofSuite.True(vault.Value is null&&!service.Preference(reference).Remember&&!service.Preference(reference).AutoConnect);
        });
        await suite.CheckAsync("network failure retains protected credential but disarms automatic startup",async()=>{
            await service.AuthenticateManualAsync(reference,Key,true,true,Accept);
            await ProofSuite.ThrowsAsync(()=>service.AuthenticateSavedAsync(reference,_=>throw new ControlException("client-ssh-disconnected"),startup:true));
            ProofSuite.True(vault.Value==Key&&service.Preference(reference).Remember&&!service.Preference(reference).AutoConnect);
        });
        suite.Check("forget clears credential and opt-in even after recreated preferences instance",()=>{
            service.Forget(reference);ProofSuite.True(vault.Value is null);
            var reopened=new AdminLoginPreferences(root);ProofSuite.True(!reopened.Read(reference).Remember&&!reopened.Read(reference).AutoConnect);
        });
        suite.Check("tampered or credential-bearing options fail closed",()=>{
            var path=Path.Combine(root,reference.ProfileId+".local.json");
            File.WriteAllText(path,JsonSerializer.Serialize(new{version=1,profileId=reference.ProfileId,scheme=reference.Scheme,remember=true,autoConnect=true,key="synthetic-token"}));
            ProofSuite.Throws(()=>preferences.Read(reference));File.Delete(path);
        });
        const string id="12345678-1234-1234-1234-123456789abc";
        suite.Check("actual v017 structured report content renders description expected tags and linked response",()=>{
            var detail=RemoteAdminData.Detail(ProtocolJson.Element(new{id,category="ruling",status="received",content=new{description="합성 문제 설명",expected="합성 기대 답변",tags=new[]{"wrong-answer"},language="ko",token="synthetic-token"},snapshot=new{question=new{text="합성 질문"},response=new{recommendation="합성 판정",reasoning="합성 근거"},trace=new{token="synthetic-token"}},history=new[]{new{status="received",note="접수"}}}),id);
            foreach(var text in new[]{"합성 문제 설명","합성 기대 답변","wrong-answer","합성 질문","합성 판정","합성 근거"})ProofSuite.True(detail.Contains(text,StringComparison.Ordinal));
            ProofSuite.True(!detail.Contains("synthetic-token",StringComparison.Ordinal)&&!detail.Contains("trace",StringComparison.Ordinal));
        });
        suite.Check("report strings empty snapshots and null optional fields remain compatible",()=>{
            var detail=RemoteAdminData.Detail(ProtocolJson.Element(new{id,category="app",status="received",content="합성 이전 형식",snapshot=(object?)null,history=Array.Empty<object>()}),id);
            ProofSuite.True(detail.Contains("합성 이전 형식",StringComparison.Ordinal)&&detail.Contains("미보관/없음",StringComparison.Ordinal));
        });
        suite.Check("malformed report tags and oversized descriptions remain rejected",()=>{
            foreach(var value in new[]{ProtocolJson.Element(new{id,content=new{description=new string('x',5001),expected="",tags=Array.Empty<string>()}}),ProtocolJson.Element(new{id,content=new{description="합성 정상 길이",expected="",tags=new[]{"unexpected"}}})})ProofSuite.Throws(()=>RemoteAdminData.Detail(value,id));
        });
        if(OperatingSystem.IsWindows()){
            var path=Path.Combine(temporary,"native-dpapi");var native=new DpapiAdminCredentialVault(path);
            suite.Check("native current-user DPAPI ciphertext survives reopened vault without plaintext on disk",()=>{
                native.Write(reference,Key);var bytes=File.ReadAllBytes(Path.Combine(path,reference.ProfileId+".dpapi"));
                ProofSuite.True(!System.Text.Encoding.UTF8.GetString(bytes).Contains(Key,StringComparison.Ordinal)&&!System.Text.Encoding.Unicode.GetString(bytes).Contains(Key,StringComparison.Ordinal));
                ProofSuite.Equal(new DpapiAdminCredentialVault(path).Read(reference),Key);
            });
            suite.Check("native DPAPI profile entropy blocks copied credentials for a different target",()=>{
                var other=AdminCredentialReference.For(profile with {Host="other.invalid"});File.Copy(Path.Combine(path,reference.ProfileId+".dpapi"),Path.Combine(path,other.ProfileId+".dpapi"));
                ProofSuite.Throws(()=>native.Read(other));native.Delete(other);
            });
            suite.Check("native credential directory ACL is restricted to current Windows user and delete removes file",()=>{
                if (!OperatingSystem.IsWindows()) throw new InvalidOperationException();
                var sid=WindowsIdentity.GetCurrent().User!;var acl=FileSystemAclExtensions.GetAccessControl(new DirectoryInfo(path));
                ProofSuite.True(acl.AreAccessRulesProtected);
                foreach (FileSystemAccessRule rule in acl.GetAccessRules(true,true,typeof(SecurityIdentifier))) ProofSuite.True(rule.IdentityReference.Equals(sid));
                native.Delete(reference);ProofSuite.True(native.Read(reference) is null);
            });
        }
    }
    private sealed class MemoryVault:IAdminCredentialVault
    {
        public string? Value;public int Reads,Writes;public bool FailWrite;
        public string? Read(AdminCredentialReference reference){Reads++;return Value;}
        public void Write(AdminCredentialReference reference,string key){Writes++;if(FailWrite)throw new ControlException("client-credential-protection");Value=key;}
        public void Delete(AdminCredentialReference reference){Value=null;}
    }
}
