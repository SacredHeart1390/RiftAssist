using System.Diagnostics;
using System.Net;
using System.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace RiftAssist.ControlCenter.Core;

public static class AdminReadPolicy
{
    public static readonly Uri Origin = new("http://127.0.0.1:3100");
    public static void Require(HttpMethod method, string path)
    {
        if (method == HttpMethod.Post && path == "/api/login") return; // Existing auth creates an in-memory server session only.
        if (method == HttpMethod.Get && (path is "/api/status" or "/api/reports" || Regex.IsMatch(path, @"\A/api/reports/[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\z"))) return;
        throw new ControlException("client-production-control-blocked");
    }
    public static IReadOnlyList<string> SshArguments(SshProfile profile)
    {
        var args = SshCommandPolicy.Build(profile).Arguments.ToList(); var destination = args[^2];
        args.RemoveRange(args.Count - 2, 2);
        args.AddRange(["-o", "ExitOnForwardFailure=yes", "-W", "127.0.0.1:3100", destination]);
        return args;
    }
    internal static void ValidateSsh(SshProfile profile, IReadOnlyList<string> args)
    { if (!SshArguments(profile).SequenceEqual(args, StringComparer.Ordinal)) throw new ControlException("client-production-control-blocked"); }
}

public interface IAdminStreamConnector { ValueTask<Stream> ConnectAsync(CancellationToken cancellation); }
public sealed class SshAdminStreamConnector(SshProfile profile) : IAdminStreamConnector
{
    public ValueTask<Stream> ConnectAsync(CancellationToken cancellation)
    {
        cancellation.ThrowIfCancellationRequested();
        var args = AdminReadPolicy.SshArguments(profile); AdminReadPolicy.ValidateSsh(profile, args);
        var exe = WindowsOpenSshRunner.Executable(profile);
        return ValueTask.FromResult<Stream>(new SshAdminStream(WindowsOpenSshRunner.ProcessInfo(exe, args)));
    }
}

// No listening TCP port, shell command, remote program/service or fallback to a direct HTTP connection.
internal sealed class SshAdminStream : Stream
{
    private readonly Process process;
    private readonly Task<string> errors;
    private readonly Stream input, output;
    private bool disposed;
    public SshAdminStream(ProcessStartInfo info)
    {
        try { process = Process.Start(info) ?? throw new ControlException("client-ssh-start"); }
        catch (System.ComponentModel.Win32Exception) { throw new ControlException("client-ssh-start"); }
        input = process.StandardInput.BaseStream; output = process.StandardOutput.BaseStream;
        errors = ReadErrors();
    }
    private async Task<string> ReadErrors()
    {
        var builder = new StringBuilder(); var buffer = new char[1024]; int n;
        try {
            while ((n = await process.StandardError.ReadAsync(buffer)) > 0) {
                if (builder.Length + n > 32768) { Stop(); return ""; }
                builder.Append(buffer, 0, n);
            }
        } catch (Exception e) when (e is IOException or ObjectDisposedException) { }
        return builder.ToString();
    }
    private void Stop() { try { if (!process.HasExited) process.Kill(true); } catch (Exception e) when (e is InvalidOperationException or System.ComponentModel.Win32Exception) { } }
    private async Task<ControlException> Failure()
    {
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(2));
        try { await process.WaitForExitAsync(timeout.Token); } catch (OperationCanceledException) { Stop(); }
        string stderr;
        try { stderr = await errors.WaitAsync(TimeSpan.FromSeconds(1)); } catch (TimeoutException) { stderr = ""; }
        if (stderr.Contains("administratively prohibited", StringComparison.OrdinalIgnoreCase)) return new("client-admin-forward-denied");
        if (stderr.Contains("connect failed", StringComparison.OrdinalIgnoreCase)) return new("client-admin-unavailable");
        if (stderr.Contains("stdio forwarding failed", StringComparison.OrdinalIgnoreCase)) return new("client-admin-forward-failed");
        var exit = process.HasExited ? process.ExitCode : -1;
        return new(SshDiagnostics.FailureCode(new(exit, "", stderr)) ?? "client-admin-disconnected");
    }
    public override async ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellation = default)
    {
        if (buffer.Length == 0) return 0;
        try { var count = await output.ReadAsync(buffer, cancellation); if (count == 0) throw await Failure(); return count; }
        catch (IOException) { throw await Failure(); }
    }
    public override async ValueTask WriteAsync(ReadOnlyMemory<byte> buffer, CancellationToken cancellation = default)
    { try { await input.WriteAsync(buffer, cancellation); await input.FlushAsync(cancellation); } catch (IOException) { throw await Failure(); } }
    public override int Read(byte[] buffer, int offset, int count) => ReadAsync(buffer.AsMemory(offset, count)).AsTask().GetAwaiter().GetResult();
    public override void Write(byte[] buffer, int offset, int count) => WriteAsync(buffer.AsMemory(offset, count)).AsTask().GetAwaiter().GetResult();
    public override void Flush() => input.Flush();
    protected override void Dispose(bool disposing)
    {
        if (!disposed && disposing) { disposed = true; Stop(); input.Dispose(); output.Dispose(); _ = errors.ContinueWith(_ => process.Dispose(), TaskScheduler.Default); }
        base.Dispose(disposing);
    }
    public override bool CanRead => !disposed; public override bool CanWrite => !disposed; public override bool CanSeek => false;
    public override long Length => throw new NotSupportedException(); public override long Position { get => throw new NotSupportedException(); set => throw new NotSupportedException(); }
    public override long Seek(long offset, SeekOrigin origin) => throw new NotSupportedException(); public override void SetLength(long value) => throw new NotSupportedException();
}

public interface IRemoteAdminReader : IAsyncDisposable
{
    bool Authenticated { get; }
    Task LoginAsync(string key, CancellationToken cancellation = default);
    Task<JsonElement> ReadAsync(string path, CancellationToken cancellation = default);
}

public sealed class RemoteAdminReader : IRemoteAdminReader
{
    private readonly HttpClient client;
    private readonly SemaphoreSlim serial = new(1, 1);
    private string? cookie;
    private DateTimeOffset expires;
    private bool disposed;
    public bool Authenticated => !disposed && cookie is not null && DateTimeOffset.UtcNow < expires;
    public RemoteAdminReader(IAdminStreamConnector connector)
    {
        var handler = new SocketsHttpHandler { UseProxy = false, UseCookies = false, AllowAutoRedirect = false,
            MaxResponseHeadersLength = 16, PooledConnectionIdleTimeout = TimeSpan.FromSeconds(30), ConnectTimeout = TimeSpan.FromSeconds(12),
            ConnectCallback = (context, token) => {
                if (context.DnsEndPoint.Host != "127.0.0.1" || context.DnsEndPoint.Port != 3100) throw new ControlException("client-production-control-blocked");
                return connector.ConnectAsync(token);
            } };
        client = new HttpClient(handler) { BaseAddress = AdminReadPolicy.Origin, Timeout = Timeout.InfiniteTimeSpan,
            DefaultRequestVersion = HttpVersion.Version11, DefaultVersionPolicy = HttpVersionPolicy.RequestVersionExact };
    }
    public async Task LoginAsync(string key, CancellationToken cancellation = default)
    {
        if (string.IsNullOrWhiteSpace(key) || key.Length > 1024 || key.Any(char.IsControl)) throw new ControlException("client-admin-authentication");
        cookie = null;
        var bytes = JsonSerializer.SerializeToUtf8Bytes(new { key });
        try { await RequestAsync(HttpMethod.Post, "/api/login", bytes, cancellation); }
        finally { CryptographicOperations.ZeroMemory(bytes); }
    }
    public Task<JsonElement> ReadAsync(string path, CancellationToken cancellation = default)
    {
        AdminReadPolicy.Require(HttpMethod.Get, path);
        if (!Authenticated) { cookie = null; throw new ControlException("client-admin-authentication"); }
        return RequestAsync(HttpMethod.Get, path, null, cancellation);
    }
    private async Task<JsonElement> RequestAsync(HttpMethod method, string path, byte[]? body, CancellationToken cancellation)
    {
        AdminReadPolicy.Require(method, path);
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(cancellation); deadline.CancelAfter(TimeSpan.FromSeconds(25));
        var acquired = false;
        try {
            await serial.WaitAsync(deadline.Token); acquired = true;
            ObjectDisposedException.ThrowIf(disposed, this);
            using var request = new HttpRequestMessage(method, path);
            request.Headers.Add("Origin", AdminReadPolicy.Origin.AbsoluteUri.TrimEnd('/'));
            request.Headers.CacheControl = new CacheControlHeaderValue { NoStore = true };
            if (method == HttpMethod.Get && Authenticated) request.Headers.Add("Cookie", "rift_admin=" + cookie);
            if (body is not null) { request.Content = new ByteArrayContent(body); request.Content.Headers.ContentType = new("application/json") { CharSet = "utf-8" }; }
            using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, deadline.Token);
            if (response.StatusCode is HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden) throw new ControlException("client-admin-authentication");
            if (response.StatusCode == HttpStatusCode.NotFound) throw new ControlException("client-admin-not-found");
            if (!response.IsSuccessStatusCode) throw new ControlException("client-admin-http");
            if (response.Content.Headers.ContentType?.MediaType != "application/json" || response.Content.Headers.ContentLength is > 2097152) throw new ControlException("client-admin-response");
            using var memory = new MemoryStream(); using var stream = await response.Content.ReadAsStreamAsync(deadline.Token);
            var buffer = new byte[8192]; int n;
            while ((n = await stream.ReadAsync(buffer, deadline.Token)) > 0) { if (memory.Length + n > 2097152) throw new ControlException("client-admin-response"); memory.Write(buffer, 0, n); }
            using var json = JsonDocument.Parse(memory.ToArray(), new JsonDocumentOptions { MaxDepth = 40 });
            if (json.RootElement.ValueKind != JsonValueKind.Object) throw new ControlException("client-admin-response");
            if (method == HttpMethod.Post) {
                if (json.RootElement.Field("ok").ValueKind != JsonValueKind.True) throw new ControlException("client-admin-authentication");
                var cookies = response.Headers.TryGetValues("Set-Cookie", out var values) ? values.ToArray() : [];
                if (cookies.Length != 1 || cookies[0].Length > 1024) throw new ControlException("client-admin-authentication");
                var match = Regex.Match(cookies[0], @"\Arift_admin=([a-f0-9]{64});", RegexOptions.CultureInvariant);
                if (!match.Success || !cookies[0].Contains("HttpOnly", StringComparison.OrdinalIgnoreCase)) throw new ControlException("client-admin-authentication");
                cookie = match.Groups[1].Value; expires = DateTimeOffset.UtcNow.AddMinutes(10);
            }
            return json.RootElement.Clone();
        }
        catch (Exception e) {
            cookie = null; try { client.CancelPendingRequests(); } catch (ObjectDisposedException) { }
            if (e is OperationCanceledException) throw new ControlException(cancellation.IsCancellationRequested ? "client-admin-cancelled" : "client-admin-timeout");
            for (Exception? inner = e; inner is not null; inner = inner.InnerException) if (inner is ControlException control) throw new ControlException(control.Code);
            throw new ControlException(e is JsonException ? "client-admin-response" : "client-admin-disconnected");
        }
        finally { if (acquired) serial.Release(); }
    }
    public ValueTask DisposeAsync() { disposed = true; cookie = null; client.Dispose(); return ValueTask.CompletedTask; }
}
