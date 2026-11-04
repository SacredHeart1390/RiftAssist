using System.Diagnostics;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace RiftAssist.ControlCenter.Core;

public sealed class BackendLayout
{
    private readonly HashSet<string> verifiedFiles = new(StringComparer.Ordinal);
    public IReadOnlyList<string> VerifiedPaths=>verifiedFiles.Order(StringComparer.Ordinal).ToArray();
    public string Root { get; }
    public string Node { get; }
    public BackendLayout(string root, string node, string manifestPath)
    {
        Root = Path.GetFullPath(root); Node = Path.GetFullPath(node);
        if (!File.Exists(Node)) throw new ControlException("client-node-missing");
        SafePath.NoLinks(Node); SafePath.NoLinks(Root); SafePath.NoLinks(manifestPath);
        using var document = JsonDocument.Parse(File.ReadAllBytes(manifestPath));
        if (document.RootElement.GetProperty("schemaVersion").GetInt32() != 1) throw new ControlException("client-backend-integrity");
        var files = document.RootElement.GetProperty("files");
        foreach (var required in new[] { "scripts/prepare-development.cjs", "scripts/prepare-control-center-demo.cjs", "scripts/card-review-control.cjs", "src/card-review-auth.js", "dev-fixtures/mock-cards.json" })
            if (!files.TryGetProperty(required, out _)) throw new ControlException("client-backend-integrity");
        foreach (var entry in document.RootElement.GetProperty("files").EnumerateObject())
        {
            if (entry.Name.Contains('\\') || entry.Name.Split('/').Any(p => p is ".." or "." or "")) throw new ControlException("client-backend-integrity");
            var file = Path.GetFullPath(Path.Combine(Root, entry.Name.Replace('/', Path.DirectorySeparatorChar)));
            if (!SafePath.IsInside(Root, file)) throw new ControlException("client-backend-integrity");
            SafePath.NoLinks(file);
            if (!File.Exists(file) || Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(file))) != entry.Value.GetString())
                throw new ControlException("client-backend-integrity");
            verifiedFiles.Add(entry.Name);
        }
    }
    public string Script(string name)
    {
        if (name is not ("prepare-development.cjs" or "prepare-control-center-demo.cjs" or "card-review-control.cjs" or "control-center-operations.cjs")) throw new ControlException("client-script-denied");
        if (!verifiedFiles.Contains("scripts/" + name)) throw new ControlException("client-backend-integrity");
        return Path.Combine(Root, "scripts", name);
    }
    public static BackendLayout Installed(string appRoot)
    {
        var node = Path.Combine(appRoot, "runtime", "node.exe");
        var manifest = Path.Combine(appRoot, "runtime", "runtime.json"); SafePath.NoLinks(manifest);
        if (!File.Exists(manifest)) throw new ControlException("client-node-missing");
        using var metadata = JsonDocument.Parse(File.ReadAllBytes(manifest));
        SafePath.NoLinks(node);
        if (metadata.RootElement.GetProperty("major").GetInt32() != 24 || !File.Exists(node)
            || metadata.RootElement.GetProperty("sha256").GetString() != Convert.ToHexStringLower(SHA256.HashData(File.ReadAllBytes(node))))
            throw new ControlException("client-runtime-integrity");
        return new BackendLayout(Path.Combine(appRoot, "backend", "v0.3.0"), node, Path.Combine(appRoot, "backend-manifest.json"));
    }
}

public static class SafePath
{
    private static StringComparison Comparison => OperatingSystem.IsWindows() ? StringComparison.OrdinalIgnoreCase : StringComparison.Ordinal;
    public static bool IsInside(string root, string path) => Path.GetFullPath(path).StartsWith(Path.TrimEndingDirectorySeparator(Path.GetFullPath(root)) + Path.DirectorySeparatorChar, Comparison);
    public static void NoLinks(string path)
    {
        var current = Path.GetFullPath(path);
        while (current is not null)
        {
            if ((File.Exists(current) || Directory.Exists(current)) && (File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
                throw new ControlException("client-path-link");
            current = Path.GetDirectoryName(current);
        }
    }
}

internal static class ChildProcess
{
    public static Process Start(BackendLayout layout, string root, string? script, bool bootstrap = false)
    {
        var info = new ProcessStartInfo(layout.Node) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardInput = true,
            RedirectStandardOutput = true, RedirectStandardError = true, StandardInputEncoding = ProtocolJson.Utf8,
            StandardOutputEncoding = ProtocolJson.Utf8, StandardErrorEncoding = ProtocolJson.Utf8, WorkingDirectory = layout.Root };
        info.Environment.Clear();
        foreach (var key in new[] { "SystemRoot", "WINDIR" }) if (Environment.GetEnvironmentVariable(key) is { } value) info.Environment[key] = value;
        info.Environment["TEMP"] = Path.GetTempPath(); info.Environment["TMP"] = Path.GetTempPath();
        info.Environment["RIFTASSI_DATA_ROOT"] = root; info.Environment["RIFTASSI_EXTERNAL_MODE"] = "mock";
        info.Environment["OPENAI_GENERATION_ENABLED"] = "false"; info.Environment["RIFTASSI_CARD_POLICY"] = "restricted";
        if (script is null) info.ArgumentList.Add("--version");
        else { info.ArgumentList.Add(layout.Script(script)); if (bootstrap) info.ArgumentList.Add("--bootstrap-stdin"); }
        return Process.Start(info) ?? throw new ControlException("client-worker-start");
    }
    public static async Task DrainAsync(StreamReader reader)
    {
        var buffer = new char[4096]; try { while (await reader.ReadAsync(buffer) != 0) { } }
        catch (Exception e) when (e is IOException or DecoderFallbackException or ObjectDisposedException) { }
    }
    public static void Stop(Process process)
    {
        try { if (!process.HasExited) process.Kill(entireProcessTree: true); } catch (InvalidOperationException) { }
    }
    public static async Task<string> RunAsync(BackendLayout layout, string root, string? script, CancellationToken cancellation)
    {
        using var process = Start(layout, root, script); process.StandardInput.Close();
        var errors = DrainAsync(process.StandardError);
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellation); timeout.CancelAfter(TimeSpan.FromSeconds(60));
        try
        {
            var output = new StringBuilder(); var buffer = new char[4096];
            int read;
            while ((read = await process.StandardOutput.ReadAsync(buffer.AsMemory(), timeout.Token)) > 0)
            { output.Append(buffer, 0, read); if (output.Length > 65536) throw new ControlException("client-worker-output"); }
            await process.WaitForExitAsync(timeout.Token); await errors;
            if (process.ExitCode != 0) throw new ControlException("client-worker-failed");
            return output.ToString().Trim();
        }
        catch { Stop(process); throw; }
    }
}

public interface IReviewTransport : IAsyncDisposable
{
    IReadOnlyList<string> Scopes { get; }
    bool IsFaulted { get; }
    Task<JsonElement> SendAsync(string method, object parameters, CancellationToken cancellation = default);
}

public sealed class NodeReviewTransport : IReviewTransport
{
    private readonly Process process;
    private readonly SessionSigner signer;
    private readonly SemaphoreSlim gate = new(1, 1);
    private readonly Task errors;
    private string pending = "";
    private bool disposed;
    public IReadOnlyList<string> Scopes => signer.Scopes;
    public bool IsFaulted { get; private set; }
    public string? LastRequestId { get; private set; }
    private NodeReviewTransport(Process process, SessionSigner signer) { this.process = process; this.signer = signer; errors = ChildProcess.DrainAsync(process.StandardError); }
    public static async Task<NodeReviewTransport> ConnectAsync(BackendLayout layout, OwnedSandbox sandbox, bool finalActions, CancellationToken cancellation = default)
        => await ConnectPrivateAsync(layout, sandbox, new SessionSigner(finalActions), "card-review-control.cjs", cancellation);
    public static async Task<NodeReviewTransport> ConnectOperationsAsync(BackendLayout layout, OwnedSandbox sandbox, CancellationToken cancellation = default)
        => await ConnectPrivateAsync(layout, sandbox, new SessionSigner(false, operations: true), "control-center-operations.cjs", cancellation);
    private static async Task<NodeReviewTransport> ConnectPrivateAsync(BackendLayout layout, OwnedSandbox sandbox, SessionSigner signer, string script, CancellationToken cancellation)
    {
        sandbox.Validate();
        var version = await ChildProcess.RunAsync(layout, sandbox.Root, null, cancellation);
        if (!version.StartsWith("v24.", StringComparison.Ordinal)) throw new ControlException("client-node-version");
        var process = ChildProcess.Start(layout, sandbox.Root, script, true);
        var client = new NodeReviewTransport(process, signer);
        try { await process.StandardInput.WriteLineAsync(signer.Bootstrap().AsMemory(), cancellation); await process.StandardInput.FlushAsync(cancellation); return client; }
        catch { await client.DisposeAsync(); throw new ControlException("client-worker-start"); }
    }
    private async Task<string> ReadLineAsync(CancellationToken cancellation)
    {
        var buffer = new char[4096];
        while (true)
        {
            var end = pending.IndexOf('\n');
            if (end >= 0)
            {
                var line = pending[..end]; pending = pending[(end + 1)..];
                if (ProtocolJson.Utf8.GetByteCount(line) > 2000000) throw new ControlException("client-response-limit");
                return line;
            }
            if (pending.Length > 2000000) throw new ControlException("client-response-limit");
            var read = await process.StandardOutput.ReadAsync(buffer.AsMemory(), cancellation);
            if (read == 0) throw new ControlException("client-worker-ended");
            pending += new string(buffer, 0, read);
        }
    }
    public async Task<JsonElement> SendAsync(string method, object parameters, CancellationToken cancellation = default)
    {
        await gate.WaitAsync(cancellation);
        try
        {
            if (IsFaulted) throw new ControlException("client-session-faulted");
            var requestId = Guid.NewGuid().ToString("D"); LastRequestId = requestId;
            var message = signer.Request(method, parameters, requestId);
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellation); timeout.CancelAfter(TimeSpan.FromSeconds(30));
            try
            {
                await process.StandardInput.WriteLineAsync(message.AsMemory(), timeout.Token); await process.StandardInput.FlushAsync(timeout.Token);
                using var document = JsonDocument.Parse(await ReadLineAsync(timeout.Token)); var response = document.RootElement;
                if (response.GetProperty("protocol").GetString() != "riftassist-control-1" || response.GetProperty("requestId").GetString() != requestId)
                    throw new ControlException("client-response-mismatch");
                if (!response.GetProperty("ok").GetBoolean())
                {
                    var code = response.GetProperty("error").GetProperty("code").GetString() ?? "";
                    if (!System.Text.RegularExpressions.Regex.IsMatch(code, "^review-[a-z-]{1,80}$")) throw new ControlException("client-response-invalid");
                    throw new ControlException(code, code == "review-audit-unavailable");
                }
                return response.GetProperty("result").Clone();
            }
            catch (ControlException e) when (e.Code.StartsWith("review-", StringComparison.Ordinal)) { throw; }
            catch { IsFaulted = true; ChildProcess.Stop(process); throw new ControlException("client-result-uncertain", true); }
        }
        finally { gate.Release(); }
    }
    public async ValueTask DisposeAsync()
    {
        if (disposed) return; disposed = true;
        IsFaulted = true;
        try { process.StandardInput.Close(); using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(2)); await process.WaitForExitAsync(timeout.Token); }
        catch { ChildProcess.Stop(process); }
        signer.Dispose(); await errors; process.Dispose(); gate.Dispose();
    }
}
