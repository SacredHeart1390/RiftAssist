using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Security.AccessControl;
using System.Security.Cryptography;
using System.Security.Principal;

namespace RiftAssist.ControlCenter.Core;

// Current-user DPAPI only. No machine-scope flag, key export, general JSON secret, cookie or SSH-key storage.
public sealed class DpapiAdminCredentialVault(string directory) : IAdminCredentialVault
{
    private readonly string directory = Path.GetFullPath(directory);
    private string PathFor(AdminCredentialReference reference) { reference.Validate(); return Path.Combine(directory, reference.ProfileId + ".dpapi"); }
    private static byte[] Entropy(AdminCredentialReference reference) => ProtocolJson.Utf8.GetBytes("RiftAssist.ControlCenter/admin-credential/v1/" + reference.Scheme + "/" + reference.ProfileId);
    private static void RequireWindows() { if (!OperatingSystem.IsWindows()) throw new ControlException("client-credential-windows-only"); }
    public string? Read(AdminCredentialReference reference)
    {
        RequireWindows(); var path = PathFor(reference); SafePath.NoLinks(path);
        if (!File.Exists(path)) return null;
        byte[]? clear = null;
        try {
            if (new FileInfo(path).Length > 16384) throw new ControlException("client-credential-protection");
            clear = Transform(File.ReadAllBytes(path), Entropy(reference), false);
            var key = ProtocolJson.Utf8.GetString(clear); ValidateKey(key); return key;
        } catch (Exception e) when (e is IOException or UnauthorizedAccessException or System.Text.DecoderFallbackException) { throw new ControlException("client-credential-protection"); }
        finally { if (clear is not null) CryptographicOperations.ZeroMemory(clear); }
    }
    public void Write(AdminCredentialReference reference, string key)
    {
        RequireWindows(); ValidateKey(key); var path = PathFor(reference); SafePath.NoLinks(path);
        byte[]? clear = null; var temporary = Path.Combine(directory, Guid.NewGuid().ToString("N") + ".tmp");
        try {
            Directory.CreateDirectory(directory); if (OperatingSystem.IsWindows()) ProtectDirectory(directory);
            clear = ProtocolJson.Utf8.GetBytes(key); var encrypted = Transform(clear, Entropy(reference), true);
            File.WriteAllBytes(temporary, encrypted); File.Move(temporary, path, true);
        } catch (Exception e) when (e is IOException or UnauthorizedAccessException) { throw new ControlException("client-credential-protection"); }
        finally { if (clear is not null) CryptographicOperations.ZeroMemory(clear); if (File.Exists(temporary)) File.Delete(temporary); }
    }
    public void Delete(AdminCredentialReference reference)
    {
        RequireWindows(); var path = PathFor(reference); SafePath.NoLinks(path);
        try { if (File.Exists(path)) File.Delete(path); } catch (Exception e) when (e is IOException or UnauthorizedAccessException) { throw new ControlException("client-credential-protection"); }
    }
    private static void ValidateKey(string key)
    { if (string.IsNullOrWhiteSpace(key) || key.Length > 1024 || key.Any(char.IsControl)) throw new ControlException("client-credential-protection"); }
    [SupportedOSPlatform("windows")]
    private static void ProtectDirectory(string path)
    {
        using var identity = WindowsIdentity.GetCurrent();
        var sid = identity.User ?? throw new ControlException("client-credential-protection");
        var security = new DirectorySecurity(); security.SetAccessRuleProtection(true, false); security.SetOwner(sid);
        security.AddAccessRule(new FileSystemAccessRule(sid, FileSystemRights.FullControl, InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit, PropagationFlags.None, AccessControlType.Allow));
        FileSystemAclExtensions.SetAccessControl(new DirectoryInfo(path), security);
    }
    [StructLayout(LayoutKind.Sequential)] private struct Blob { public int Length; public IntPtr Data; }
    [DllImport("crypt32.dll", CharSet = CharSet.Unicode, ExactSpelling = true, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)] private static extern bool CryptProtectData(ref Blob input, string description, ref Blob entropy, IntPtr reserved, IntPtr prompt, uint flags, out Blob output);
    [DllImport("crypt32.dll", ExactSpelling = true, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)] private static extern bool CryptUnprotectData(ref Blob input, IntPtr description, ref Blob entropy, IntPtr reserved, IntPtr prompt, uint flags, out Blob output);
    [DllImport("kernel32.dll")] private static extern IntPtr LocalFree(IntPtr data);
    private static byte[] Transform(byte[] data, byte[] entropy, bool protect)
    {
        RequireWindows();
        var input = new Blob { Length = data.Length, Data = Marshal.AllocHGlobal(data.Length) };
        var extra = new Blob { Length = entropy.Length, Data = Marshal.AllocHGlobal(entropy.Length) }; var result = new Blob();
        try {
            Marshal.Copy(data, 0, input.Data, data.Length); Marshal.Copy(entropy, 0, extra.Data, entropy.Length);
            // CRYPTPROTECT_UI_FORBIDDEN=1; CRYPTPROTECT_LOCAL_MACHINE is deliberately never used.
            var ok = protect ? CryptProtectData(ref input, "RiftAssist Control Center", ref extra, IntPtr.Zero, IntPtr.Zero, 1, out result)
                : CryptUnprotectData(ref input, IntPtr.Zero, ref extra, IntPtr.Zero, IntPtr.Zero, 1, out result);
            if (!ok || result.Length is < 1 or > 16384) throw new ControlException("client-credential-protection");
            var output = new byte[result.Length]; Marshal.Copy(result.Data, output, 0, output.Length); return output;
        } finally {
            Marshal.Copy(new byte[input.Length], 0, input.Data, input.Length); Marshal.FreeHGlobal(input.Data); Marshal.FreeHGlobal(extra.Data);
            if (result.Data != IntPtr.Zero) { if (result.Length is > 0 and <= 16384) Marshal.Copy(new byte[result.Length], 0, result.Data, result.Length); LocalFree(result.Data); }
        }
    }
}
