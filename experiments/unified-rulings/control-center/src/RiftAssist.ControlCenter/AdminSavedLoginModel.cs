using RiftAssist.ControlCenter.Core;

namespace RiftAssist.ControlCenter;

public sealed partial class OperationsModel
{
    private readonly SavedAdminLogin savedLogin;
    private bool rememberAdminLogin, autoConnectAtStartup, hasSavedLogin;
    private string loginFeedback = "로그인 정보는 기본적으로 저장하지 않습니다.";
    public string LoginFeedback { get => loginFeedback; private set { loginFeedback = value; Changed(); } }
    public bool HasSavedLogin => hasSavedLogin;
    public bool RememberAdminLogin {
        get => rememberAdminLogin;
        set {
            if (rememberAdminLogin == value) return;
            if (!value && hasSavedLogin) {
                try { ForgetSavedLogin(); } catch (Exception e) { LoginFeedback = UserErrors.Explain(e); ReloadLoginChoice(); }
                return;
            }
            rememberAdminLogin = value; Changed();
            if (!value) { autoConnectAtStartup = false; Changed(nameof(AutoConnectAtStartup)); }
            LoginFeedback = value ? "로그인 성공 시 이 Windows 사용자 전용으로 암호화해 저장합니다." : "이번 로그인은 저장하지 않습니다.";
        }
    }
    public bool AutoConnectAtStartup {
        get => autoConnectAtStartup;
        set {
            value = value && rememberAdminLogin;
            if (autoConnectAtStartup == value) return;
            try {
                if (hasSavedLogin) savedLogin.SetAutoConnect(AdminCredentialReference.For(profile), value);
                autoConnectAtStartup = value; Changed();
                LoginFeedback = value ? "다음 시작 시 이 대상의 읽기 전용 관리자에 한 번 자동 연결합니다." : "시작 시 자동 연결을 사용하지 않습니다.";
            } catch (Exception e) { LoginFeedback = UserErrors.Explain(e); Changed(); }
        }
    }
    private void ReloadLoginChoice()
    {
        try {
            var option = savedLogin.Preference(AdminCredentialReference.For(profile));
            rememberAdminLogin = hasSavedLogin = option.Remember; autoConnectAtStartup = option.AutoConnect;
            LoginFeedback = hasSavedLogin ? "이 Windows 사용자에 저장된 로그인 정보를 사용할 수 있습니다." : "로그인 정보는 기본적으로 저장하지 않습니다.";
        }
        catch (Exception e) {
            rememberAdminLogin = autoConnectAtStartup = hasSavedLogin = false;
            LoginFeedback = e is ControlException { Code: "client-ssh-profile" } ? "SSH 설정을 먼저 확인하세요." : UserErrors.Explain(e);
        }
        Changed(nameof(RememberAdminLogin)); Changed(nameof(AutoConnectAtStartup)); Changed(nameof(HasSavedLogin));
    }
    public bool StartupAutoRequested => hasSavedLogin && autoConnectAtStartup;
    public void ForgetSavedLogin()
    {
        connectionGeneration++; StopAutomaticRecovery();
        try { savedLogin.Forget(AdminCredentialReference.For(profile)); }
        finally { DropAdmin(); ReloadLoginChoice(); }
        LoginFeedback = "이 대상의 DPAPI 로그인 정보를 삭제하고 연결을 해제했습니다. 저장된 SSH 설정은 유지되며 연결 복구/다음 실행에서 자동 인증할 수 있습니다.";
        Log("saved-login-delete", "로컬 로그인 정보 삭제 완료");
    }
    public Task ConnectAdminAsync(string key) => ConnectAdminCoreAsync((reference, authenticate) =>
        savedLogin.AuthenticateManualAsync(reference, key, rememberAdminLogin, autoConnectAtStartup, authenticate));
    public Task ConnectSavedAdminAsync(bool startup = false) => ConnectAdminCoreAsync((reference, authenticate) =>
        savedLogin.AuthenticateSavedAsync(reference, authenticate, startup));
    private async Task ConnectAdminCoreAsync(Func<AdminCredentialReference, Func<string, Task>, Task> login)
    {
        connectionGeneration++; StopAutomaticRecovery();
        if (!AzureMode) throw new ControlException("client-production-control-blocked");
        var reference = AdminCredentialReference.For(profile); var expectedProfile = profile;
        DropAdmin(); var session = adminFactory(profile); remoteAdmin = session;
        try {
            await login(reference, async key => {
                await session.LoginAsync(key);
                if (session != remoteAdmin || profile != expectedProfile || !AzureMode) throw new ControlException("client-admin-disconnected");
            });
            ReloadLoginChoice();
            await RefreshAdminAsync(); AdminState = "운영 관리자 인증됨 · 읽기 전용";
            Changed(nameof(CanReadAdmin)); Log("admin-login", "기존 인증 완료 · 읽기 전용");
        } catch (Exception e) {
            try { savedLogin.SetAutoConnect(reference, false); } catch { }
            if (session == remoteAdmin) AdminFailure(e); ReloadLoginChoice(); LoginFeedback = UserErrors.Explain(e); throw;
        }
    }
}
