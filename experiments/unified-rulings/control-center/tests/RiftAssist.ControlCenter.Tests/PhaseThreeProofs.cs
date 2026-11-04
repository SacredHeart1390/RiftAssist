using RiftAssist.ControlCenter.Core;

internal static class PhaseThreeProofs
{
    public static void Run(ProofSuite suite)
    {
        suite.Check("read-only actions never require a confirmation dialog", () => {
            foreach (var action in OperationsPolicy.ReadMethods.Concat(new[] { "ssh-status", "refresh", "audit", "get", "list", "load-settings" }))
                ProofSuite.Equal(UserInteraction.ConfirmationFor(action), ConfirmationKind.None);
        });
        suite.Check("ordinary changes and card decisions use one simple confirmation", () => {
            foreach (var action in new[] { "start", "stop", "restart", "ai", "limits", "hosting", "update-report", "settings", "approve", "reject", "hold", "stage" })
                ProofSuite.Equal(UserInteraction.ConfirmationFor(action), ConfirmationKind.Simple);
        });
        suite.Check("backup, final versions, destructive and unknown actions retain protection", () => {
            foreach (var action in new[] { "backup", "app-release", "knowledge-activate", "activate", "rollback", "recover", "permanent-delete", "restore-production-db", "deploy-production", "unknown" })
                ProofSuite.Equal(UserInteraction.ConfirmationFor(action), ConfirmationKind.Protected);
            ProofSuite.Throws(() => UserInteraction.AuditReason("deploy-production", "disabled"));
            ProofSuite.Throws(SshCommandPolicy.DenyOperationalMutation);
        });
        suite.Check("automatic reasons include action and target and satisfy unchanged backend validation", () => {
            var target = Guid.NewGuid().ToString("D");
            foreach (var action in OperationsPolicy.WriteMethods.Concat(new[] { "settings", "approve", "reject", "hold", "stage", "activate", "rollback", "recover" })) {
                var reason = UserInteraction.AuditReason(action, target); ReviewCoordinator.ValidateReason(reason);
                ProofSuite.True(reason.Contains(target, StringComparison.Ordinal) && reason.Contains("자동 기록", StringComparison.Ordinal));
            }
        });
        suite.Check("automatic audit does not accept unbounded or control-character targets", () => {
            foreach (var target in new[] { "", "\n", "id\rforged-entry", new string('x', 701) }) ProofSuite.Throws(() => UserInteraction.AuditReason("start", target));
        });
        var snapshot = new RemoteSnapshot(DateTimeOffset.UtcNow, 12.5, 4194304, 3145728, 67108864, 54525952, 90061, "active", 200, 200);
        suite.Check("dashboard shows six separately labelled metrics with friendly healthy states", () => {
            var tiles = StatusDashboard.From(snapshot); ProofSuite.Equal(tiles.Count, 6); ProofSuite.Equal(tiles[0].Label, "CPU");
            ProofSuite.True(tiles[3].Value.StartsWith("1일 01:01:01", StringComparison.Ordinal));
            ProofSuite.True(tiles[4].Value.Contains("정상", StringComparison.Ordinal)); ProofSuite.Equal(tiles[5].Value, "실행 중");
        });
        suite.Check("dashboard never labels missing HTTP responses or failed service as healthy", () => {
            var tiles = StatusDashboard.From(snapshot with { HttpsHttp = 0, AppHttp = 503, Service = "failed" });
            ProofSuite.Equal(tiles[4].Value, "응답 없음"); ProofSuite.True(tiles[4].Detail.Contains("확인 필요", StringComparison.Ordinal)); ProofSuite.Equal(tiles[5].Value, "실패");
            ProofSuite.Equal(StatusDashboard.Service("unknown"), "확인 필요");
        });
        suite.Check("dashboard clearly distinguishes stale values and an unqueried server", () => {
            ProofSuite.True(StatusDashboard.Empty.All(t => t.Value == "미조회"));
            ProofSuite.True(StatusDashboard.From(snapshot, stale: true).All(t => t.Detail.Contains("이전", StringComparison.Ordinal)));
        });
    }
}
