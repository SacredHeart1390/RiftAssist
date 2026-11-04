using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Text.RegularExpressions;

namespace RiftAssist.ControlCenter.Core;

public sealed record AdminCredentialReference(string ProfileId, string Scheme)
{
    public const string CurrentScheme = "manager-key-v1";
    public static AdminCredentialReference For(SshProfile profile, string scheme = CurrentScheme)
    {
        profile.Validate();
        if (!Regex.IsMatch(scheme, @"\A[a-z0-9-]{1,40}\z")) throw new ControlException("client-credential-settings");
        // Independent of executable/version, key-file location and app install directory. Distinct auth schemes never share a secret.
        var canonical = JsonSerializer.Serialize(new { host = profile.Host.ToLowerInvariant(), profile.Port, profile.User, origin = new Uri(profile.HttpsOrigin).GetLeftPart(UriPartial.Authority).ToLowerInvariant(), scheme });
        return new(Convert.ToHexStringLower(SHA256.HashData(ProtocolJson.Utf8.GetBytes(canonical))), scheme);
    }
    public void Validate()
    { if (!Regex.IsMatch(ProfileId, @"\A[a-f0-9]{64}\z") || !Regex.IsMatch(Scheme, @"\A[a-z0-9-]{1,40}\z")) throw new ControlException("client-credential-settings"); }
}
public interface IAdminCredentialVault
{
    string? Read(AdminCredentialReference reference);
    void Write(AdminCredentialReference reference, string key);
    void Delete(AdminCredentialReference reference);
}
public sealed record AdminLoginPreference(int Version, string ProfileId, string Scheme, bool Remember, bool AutoConnect)
{
    public static AdminLoginPreference Empty(AdminCredentialReference reference) => new(1, reference.ProfileId, reference.Scheme, false, false);
}
public sealed class AdminLoginPreferences(string directory)
{
    private readonly string directory = Path.GetFullPath(directory);
    private static readonly JsonSerializerOptions Options = new(ProtocolJson.Options) { UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow };
    private string PathFor(AdminCredentialReference reference) { reference.Validate(); return Path.Combine(directory, reference.ProfileId + ".local.json"); }
    public AdminLoginPreference Read(AdminCredentialReference reference)
    {
        var path = PathFor(reference); SafePath.NoLinks(path);
        if (!File.Exists(path)) return AdminLoginPreference.Empty(reference);
        try {
            if (new FileInfo(path).Length > 4096) throw new JsonException();
            var value = JsonSerializer.Deserialize<AdminLoginPreference>(File.ReadAllBytes(path), Options) ?? throw new JsonException();
            if (value.Version != 1 || value.ProfileId != reference.ProfileId || value.Scheme != reference.Scheme || (value.AutoConnect && !value.Remember)) throw new JsonException();
            return value;
        } catch (JsonException) { throw new ControlException("client-credential-settings"); }
    }
    public void Write(AdminCredentialReference reference, bool remember, bool autoConnect)
    {
        var path = PathFor(reference); SafePath.NoLinks(path); Directory.CreateDirectory(directory);
        var temporary = Path.Combine(directory, Guid.NewGuid().ToString("N") + ".tmp");
        try {
            File.WriteAllBytes(temporary, JsonSerializer.SerializeToUtf8Bytes(new AdminLoginPreference(1, reference.ProfileId, reference.Scheme, remember, remember && autoConnect), Options));
            File.Move(temporary, path, true);
        } finally { if (File.Exists(temporary)) File.Delete(temporary); }
    }
}
public sealed class SavedAdminLogin(IAdminCredentialVault vault, AdminLoginPreferences preferences)
{
    public static SavedAdminLogin Local() => new(new DpapiAdminCredentialVault(Path.Combine(LocalRoot(), "Credentials")), new AdminLoginPreferences(Path.Combine(LocalRoot(), "LoginOptions")));
    private static string LocalRoot() => Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "RiftAssist", "ControlCenter-Development-v030");
    public AdminLoginPreference Preference(AdminCredentialReference reference) => preferences.Read(reference);
    public void SetAutoConnect(AdminCredentialReference reference, bool enabled)
    {
        var value = preferences.Read(reference);
        if (enabled && !value.Remember) throw new ControlException("client-credential-missing");
        if (value.AutoConnect != enabled) preferences.Write(reference, value.Remember, enabled);
    }
    public void Forget(AdminCredentialReference reference)
    {
        preferences.Write(reference, false, false); // Disarm startup first, even if the protected file cannot be deleted.
        vault.Delete(reference);
    }
    public async Task AuthenticateManualAsync(AdminCredentialReference reference, string key, bool remember, bool autoConnect, Func<string, Task> authenticate)
    {
        try { await authenticate(key); }
        catch { Disarm(reference); throw; }
        if (!remember) {
            // Default memory-only login must not depend on writable credential storage.
            AdminLoginPreference previous;
            try { previous = preferences.Read(reference); } catch { return; }
            if (previous.Remember || previous.AutoConnect) Forget(reference);
            return;
        }
        try { vault.Write(reference, key); preferences.Write(reference, true, autoConnect); }
        catch { Disarm(reference); throw new ControlException("client-credential-save"); }
    }
    public async Task AuthenticateSavedAsync(AdminCredentialReference reference, Func<string, Task> authenticate, bool startup = false)
    {
        var option = preferences.Read(reference);
        if (!option.Remember || (startup && !option.AutoConnect)) throw new ControlException("client-credential-missing");
        string? key = null;
        try {
            key = vault.Read(reference);
            if (key is null) { Forget(reference); throw new ControlException("client-credential-missing"); }
            await authenticate(key);
        }
        catch (ControlException e) when (e.Code == "client-admin-authentication") { Forget(reference); throw; }
        catch { Disarm(reference); throw; }
        finally { key = null; } // Managed strings cannot be guaranteed erased; never persist/log them in plaintext.
    }
    private void Disarm(AdminCredentialReference reference)
    { try { var option = preferences.Read(reference); if (option.AutoConnect) preferences.Write(reference, option.Remember, false); } catch { } }
}
