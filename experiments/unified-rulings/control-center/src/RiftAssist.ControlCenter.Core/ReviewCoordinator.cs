using System.Text.Json;

namespace RiftAssist.ControlCenter.Core;

public sealed class ReviewCoordinator(IReviewTransport transport)
{
    public bool NeedsRefresh { get; private set; }
    public bool Connected => !transport.IsFaulted;
    public bool HasScope(string scope) => transport.Scopes.Contains(scope, StringComparer.Ordinal);
    public ReviewSnapshot? Current { get; private set; }
    public static void ValidateReason(string reason)
    {
        if (string.IsNullOrWhiteSpace(reason) || reason.Length > 1000) throw new ControlException("client-reason-required");
        try { ProtocolJson.Utf8.GetByteCount(reason); } catch (System.Text.EncoderFallbackException) { throw new ControlException("client-json-unicode"); }
    }
    public async Task<IReadOnlyList<BundleSummary>> ListAsync(CancellationToken cancellation = default)
    {
        var result = await transport.SendAsync("list", new { offset = 0, limit = 100 }, cancellation);
        return result.Field("bundles").Rows().Select(BundleSummary.From).ToArray();
    }
    public Task<JsonElement> RegisterAsync(string candidateId, string knowledgeId, CancellationToken cancellation = default) =>
        transport.SendAsync("register", new { candidateId, knowledgeReleaseId = knowledgeId, reason = "Control Center 합성자료 검토 시작" }, cancellation);
    public async Task<ReviewSnapshot> LoadAsync(string bundleId, int offset = 0, CancellationToken cancellation = default)
    {
        if (offset < 0) throw new ControlException("client-page");
        var result = await transport.SendAsync("get", new { bundleId, offset, limit = 10 }, cancellation);
        Current = ReviewSnapshot.Read(result, offset); NeedsRefresh = false; return Current;
    }
    private ReviewSnapshot Mutable()
    {
        var snapshot = Current ?? throw new ControlException("client-no-bundle");
        if (NeedsRefresh || snapshot.StaleReason.Length != 0 || snapshot.Status is "active" or "rolled-back") throw new ControlException("client-refresh-required");
        if (snapshot.PendingIntents.Count != 0) throw new ControlException("review-recovery-required");
        return snapshot;
    }
    private async Task<JsonElement> MutateAsync(string method, object parameters, CancellationToken cancellation)
    {
        try { var result = await transport.SendAsync(method, parameters, cancellation); NeedsRefresh = true; return result; }
        catch { NeedsRefresh = true; throw; }
    }
    public Task<JsonElement> DecideAsync(IReadOnlyList<ReviewItem> items, string decision, string reason, IReadOnlySet<string> acknowledgedWarnings, CancellationToken cancellation = default)
    {
        var snapshot = Mutable(); ValidateReason(reason);
        if (decision is not ("approve" or "reject" or "hold") || items.Count is < 1 or > 50 || items.Select(i => i.Id).Distinct().Count() != items.Count)
            throw new ControlException("client-selection");
        foreach (var item in items)
        {
            if (!snapshot.Items.Any(row => row.Id == item.Id && row.Fingerprint == item.Fingerprint)) throw new ControlException("client-selection-stale");
            if (decision == "approve" && (!item.CanApprove || item.Warnings.Any(w => !acknowledgedWarnings.Contains(w.Code)))) throw new ControlException("client-warnings-required");
        }
        return MutateAsync("decide", new { bundleId = snapshot.BundleId, expectedRevision = snapshot.Revision,
            actions = items.Select(item => new { itemId = item.Id, expectedFingerprint = item.Fingerprint, decision, reason,
                acknowledgeWarnings = decision == "approve" ? item.Warnings.Select(w => w.Code).Distinct().ToArray() : [] }).ToArray() }, cancellation);
    }
    public async Task<StagePlan> PlanStageAsync(CancellationToken cancellation = default)
    {
        var snapshot = Mutable(); var excluded = new List<string>(); var approved = 0;
        for (var offset = 0; offset < snapshot.Total; offset += 20)
        {
            var page = ReviewSnapshot.Read(await transport.SendAsync("get", new { bundleId = snapshot.BundleId, offset, limit = 20 }, cancellation), offset);
            if (page.Revision != snapshot.Revision || page.StaleReason.Length != 0) { NeedsRefresh = true; throw new ControlException("client-selection-stale"); }
            foreach (var item in page.Items) { if (item.Decision == "approve") approved++; else excluded.Add(item.Id); }
        }
        if (approved == 0) throw new ControlException("review-no-approved-items");
        return new StagePlan(snapshot.BundleId, snapshot.Revision, excluded, approved);
    }
    public Task<JsonElement> StageAsync(StagePlan plan, string reason, bool excludedAcknowledged, CancellationToken cancellation = default)
    {
        var snapshot = Mutable(); ValidateReason(reason);
        if (!excludedAcknowledged || plan.BundleId != snapshot.BundleId || plan.Revision != snapshot.Revision) throw new ControlException("client-confirmation-required");
        return MutateAsync("stage", new { bundleId = plan.BundleId, expectedRevision = plan.Revision, acknowledgeExcluded = plan.ExcludedIds, reason }, cancellation);
    }
    public Task<JsonElement> ActivateAsync(ReviewPackage package, FinalApproval approval, CancellationToken cancellation = default)
    {
        var snapshot = Mutable(); approval.Validate("activate");
        if (!HasScope("cards:activate") || package.ValidRevision != snapshot.Revision || !snapshot.Packages.Any(p => p.Id == package.Id && p.Digest == package.Digest))
            throw new ControlException("client-final-denied");
        return MutateAsync("activate", new { bundleId = snapshot.BundleId, expectedRevision = snapshot.Revision, packageId = package.Id,
            packageDigest = package.Digest, expectedActiveReleaseId = package.BaseReleaseId, confirmation = "ACTIVATE_ISOLATED_DEVELOPMENT", reason = approval.Reason }, cancellation);
    }
    public Task<JsonElement> RollbackAsync(ReviewPackage package, FinalApproval approval, CancellationToken cancellation = default)
    {
        var snapshot = Current ?? throw new ControlException("client-no-bundle"); approval.Validate("rollback");
        if (NeedsRefresh || !HasScope("cards:rollback") || snapshot.Status != "active" || !snapshot.Packages.Any(p => p.Id == package.Id && p.Digest == package.Digest)) throw new ControlException("client-final-denied");
        return MutateAsync("rollback", new { bundleId = snapshot.BundleId, expectedRevision = snapshot.Revision, packageId = package.Id,
            packageDigest = package.Digest, expectedActiveReleaseId = package.ReleaseId, confirmation = "ROLLBACK_ISOLATED_DEVELOPMENT", reason = approval.Reason }, cancellation);
    }
    public Task<JsonElement> RecoverAsync(PendingIntent intent, FinalApproval approval, CancellationToken cancellation = default)
    {
        var snapshot = Current ?? throw new ControlException("client-no-bundle"); approval.Validate("recover");
        if (!HasScope(intent.Action == "activate" ? "cards:activate" : "cards:rollback") || !snapshot.PendingIntents.Any(i => i.Id == intent.Id)) throw new ControlException("client-final-denied");
        return MutateAsync("recover", new { intentId = intent.Id, confirmation = "RECOVER_ISOLATED_DEVELOPMENT", reason = approval.Reason }, cancellation);
    }
    public async Task<(IReadOnlyList<AuditRow> Rows, int Total)> AuditAsync(int offset, CancellationToken cancellation = default)
    {
        var result = await transport.SendAsync("audit", new { offset, limit = 20 }, cancellation);
        return (result.Field("events").Rows().Select(AuditRow.Read).ToArray(), result.Field("total").Number());
    }
}
