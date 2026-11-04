using System.ComponentModel;
using System.Diagnostics;
using System.Runtime.CompilerServices;
using System.Text;

[assembly: InternalsVisibleTo("RiftAssist.ControlCenter.Tests")]

namespace RiftAssist.ControlCenter.Core;

// Shared with process-boundary tests; production always supplies the validated Windows OpenSSH executable.
internal static class SshProcessIo
{
    public static async Task<SshProcessResult> RunAsync(ProcessStartInfo info, string script, CancellationToken cancellation)
    {
        cancellation.ThrowIfCancellationRequested();
        Process process;
        try { process = Process.Start(info) ?? throw new ControlException("client-ssh-start"); }
        catch (Exception e) when (e is Win32Exception or InvalidOperationException) { throw new ControlException("client-ssh-start"); }
        using (process)
        using (cancellation.Register(() => Stop(process)))
        {
            try
            {
                // Drain both pipes while writing. An early stdin close must not hide exit status/stderr.
                // Process StreamReader auto-detects UTF-16 BOM by default; the protocol is UTF-8 only.
                using var outputReader = new StreamReader(process.StandardOutput.BaseStream, ProtocolJson.Utf8, false, 2048, true);
                using var errorReader = new StreamReader(process.StandardError.BaseStream, new UTF8Encoding(false, false), false, 2048, true);
                var stdout = ReadBounded(outputReader, process, cancellation);
                var stderr = ReadBounded(errorReader, process, cancellation);
                var input = SendAsync(process.StandardInput, script, cancellation);
                await Task.WhenAll(stdout, stderr, input, process.WaitForExitAsync(cancellation));
                cancellation.ThrowIfCancellationRequested();
                return new(process.ExitCode, await stdout, await stderr, !await input);
            }
            catch (DecoderFallbackException) { throw new ControlException("client-ssh-response-invalid"); }
            catch (IOException) { throw new ControlException("client-ssh-pipe-failed"); }
            finally
            {
                Stop(process);
                using var cleanup = new CancellationTokenSource(TimeSpan.FromSeconds(2));
                try { await process.WaitForExitAsync(cleanup.Token); }
                catch (Exception e) when (e is OperationCanceledException or InvalidOperationException or Win32Exception) { }
            }
        }
    }
    private static async Task<bool> SendAsync(StreamWriter writer, string script, CancellationToken cancellation)
    {
        try { await writer.WriteAsync(script.AsMemory(), cancellation); await writer.FlushAsync(cancellation); return true; }
        catch (Exception e) when (e is IOException or ObjectDisposedException) { return false; }
        finally { try { writer.Close(); } catch (Exception e) when (e is IOException or ObjectDisposedException) { } }
    }
    private static async Task<string> ReadBounded(StreamReader reader, Process process, CancellationToken cancellation)
    {
        try
        {
            var output = new StringBuilder(); var buffer = new char[2048]; int count;
            while ((count = await reader.ReadAsync(buffer.AsMemory(), cancellation)) != 0)
            { if (output.Length + count > 32768) throw new ControlException("client-ssh-response-limit"); output.Append(buffer, 0, count); }
            return output.ToString();
        }
        catch { Stop(process); throw; } // Do not leave a child blocked on a pipe after limit/decoder failure.
    }
    private static void Stop(Process process)
    {
        try { if (!process.HasExited) process.Kill(entireProcessTree: true); }
        catch (Exception e) when (e is InvalidOperationException or Win32Exception or NotSupportedException) { }
    }
}
