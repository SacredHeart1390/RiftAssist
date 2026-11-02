using RiftAssist.ControlCenter.Core;

namespace RiftAssist.ControlCenter;

public sealed partial class OperationsModel
{
    private readonly IManagerKeySource managerKeySource;
    private readonly Func<TimeSpan, CancellationToken, Task> automaticDelay;
    private readonly TimeProvider automaticClock;
    private CancellationTokenSource? automaticCancellation;
    private bool automaticRunning, automaticSession, automaticSuspended;
    private DateTimeOffset nextAutomaticRecovery;
    private int connectionGeneration;
    public bool HasSavedSshSettings {
        get { try { profile.Validate(); return profile == settings.Load(); } catch { return false; } }
    }
    public bool AutomaticRecoveryDue => automaticSession && !automaticSuspended && !automaticRunning && !Busy && AzureMode
        && remoteAdmin?.Authenticated != true && automaticClock.GetUtcNow() >= nextAutomaticRecovery;
    public bool CanRecoverConnection => !Busy && HasSavedSshSettings;
    private void StopAutomaticRecovery()
    {
        automaticSession = false; automaticSuspended = true; automaticCancellation?.Cancel();
    }
    public async Task ConnectAutomaticallyAsync()
    {
        if (automaticRunning) return;
        if (!HasSavedSshSettings) throw new ControlException("client-automatic-settings");
        if (!AzureMode) await SetModeAsync(true);
        automaticRunning = true; automaticSuspended = false;
        var expected = profile; var generation = connectionGeneration;
        using var cancellation = new CancellationTokenSource(); automaticCancellation = cancellation;
        nextAutomaticRecovery = automaticClock.GetUtcNow().AddMinutes(1);
        void Current(CancellationToken token) {
            token.ThrowIfCancellationRequested();
            if (profile != expected || generation != connectionGeneration || !AzureMode) throw new ControlException("client-admin-cancelled");
        }
        try {
            await AutomaticReadRetry.RunAsync(async (attempt, token) => {
                using var budget = CancellationTokenSource.CreateLinkedTokenSource(token); budget.CancelAfter(TimeSpan.FromSeconds(60));
                Current(budget.Token); State = $"읽기 전용 자동 연결 {attempt}/{AutomaticReadRetry.MaxAttempts} · 서버 상태 확인";
                try { await QueryRemoteAsync(true, budget.Token); }
                catch (ControlException e) when (e.Code is "client-ssh-response-invalid" or "client-ssh-response-limit" or "client-ssh-remote-tools" or "client-ssh-remote-command") {
                    Log("automatic-status", e.Code); // Metrics failure does not masquerade as auth failure.
                }
                Current(budget.Token); State = $"읽기 전용 자동 연결 {attempt}/{AutomaticReadRetry.MaxAttempts} · 관리자 인증";
                using var key = await managerKeySource.ReadAsync(expected, budget.Token);
                Current(budget.Token); DropAdmin(); var session = adminFactory(expected); remoteAdmin = session;
                try {
                    await key.AuthenticateAsync(session, budget.Token); key.Dispose(); Current(budget.Token);
                    await RefreshAdminAsync(budget.Token); Current(budget.Token);
                    await ReadAdminReportsAsync(budget.Token); Current(budget.Token);
                    automaticSession = true; State = "서버 상태·관리자 인증·AI 집계·제보 목록 연결 완료 · 읽기 전용";
                    AdminState = "SSH 인증으로 자동 연결됨 · 운영 변경 차단"; Changed(nameof(CanReadAdmin));
                    Log("automatic-connect", "읽기 전용 연결 완료");
                } catch { if (session == remoteAdmin) DropAdmin(); throw; }
            }, automaticDelay, cancellation.Token);
        }
        catch (Exception error) {
            automaticSuspended = true;
            if (generation == connectionGeneration && profile == expected) {
                DropAdmin(); State = UserErrors.Explain(error is OperationCanceledException ? new ControlException("client-admin-cancelled") : error);
                AdminState = State; Log("automatic-connect", error is ControlException c ? c.Code : "client-admin-cancelled");
            }
            if (error is OperationCanceledException) throw new ControlException("client-admin-cancelled");
            throw;
        }
        finally { automaticRunning = false; if (automaticCancellation == cancellation) automaticCancellation = null; }
    }
}
