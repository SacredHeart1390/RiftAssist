using System.Text.Json;

namespace RiftAssist.ControlCenter.Core;

public sealed class OwnedSandbox
{
    public string Root { get; }
    public string Id => Path.GetFileName(Root);
    internal OwnedSandbox(string root) { Root = Path.GetFullPath(root); }
    public void Validate()
    {
        SafePath.NoLinks(Root);
        if (!Guid.TryParseExact(Id, "D", out _)) throw new ControlException("client-sandbox-owner");
        var marker = Path.Combine(Root, ".riftassist-control-center.json"); SafePath.NoLinks(marker);
        using var document = JsonDocument.Parse(File.ReadAllBytes(marker)); var value = document.RootElement;
        if (value.GetProperty("schemaVersion").GetInt32() != 1 || value.GetProperty("purpose").GetString() != "synthetic-control-center"
            || value.GetProperty("id").GetString() != Id) throw new ControlException("client-sandbox-owner");
        var environment = Path.Combine(Root, ".riftassist-environment.json"); SafePath.NoLinks(environment);
        using var env = JsonDocument.Parse(File.ReadAllBytes(environment));
        if (env.RootElement.GetProperty("environment").GetString() != "development" || env.RootElement.GetProperty("releaseFamily").GetString() != "v0.2.0")
            throw new ControlException("client-sandbox-owner");
    }
    public override string ToString() => Id;
}

public sealed class SandboxCatalog(string home)
{
    public string Home { get; } = Path.GetFullPath(home);
    public static SandboxCatalog Local() => new(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "RiftAssist", "ControlCenter", "Sandboxes"));
    public IReadOnlyList<OwnedSandbox> List()
    {
        SafePath.NoLinks(Home);
        if (!Directory.Exists(Home)) return [];
        var result = new List<OwnedSandbox>();
        foreach (var folder in Directory.EnumerateDirectories(Home))
        {
            try { var sandbox = Open(folder); result.Add(sandbox); }
            catch (Exception e) when (e is IOException or UnauthorizedAccessException or JsonException or ControlException or KeyNotFoundException) { }
        }
        return result.OrderBy(s => s.Id, StringComparer.Ordinal).ToArray();
    }
    public OwnedSandbox Open(string folder)
    {
        var full = Path.GetFullPath(folder);
        if (!SafePath.IsInside(Home, full) || !string.Equals(Path.GetDirectoryName(full), Home,
            OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal)) throw new ControlException("client-sandbox-owner");
        var result = new OwnedSandbox(full); result.Validate(); return result;
    }
    public async Task<OwnedSandbox> CreateAsync(BackendLayout layout, CancellationToken cancellation = default)
    {
        SafePath.NoLinks(Home); Directory.CreateDirectory(Home);
        var root = Path.Combine(Home, Guid.NewGuid().ToString("D")); Directory.CreateDirectory(root);
        var version = await ChildProcess.RunAsync(layout, root, null, cancellation);
        if (!version.StartsWith("v24.", StringComparison.Ordinal)) throw new ControlException("client-node-version");
        await ChildProcess.RunAsync(layout, root, "prepare-development.cjs", cancellation);
        await File.WriteAllTextAsync(Path.Combine(root, ".riftassist-control-center.json"), JsonSerializer.Serialize(new {
            schemaVersion = 1, purpose = "synthetic-control-center", id = Path.GetFileName(root)
        }, ProtocolJson.Options), ProtocolJson.Utf8, cancellation);
        return Open(root);
    }
    public async Task<JsonElement> SeedAsync(BackendLayout layout, OwnedSandbox sandbox, CancellationToken cancellation = default)
    {
        Open(sandbox.Root);
        var output = await ChildProcess.RunAsync(layout, sandbox.Root, "prepare-control-center-demo.cjs", cancellation);
        using var result = JsonDocument.Parse(output); return result.RootElement.Clone();
    }
}
