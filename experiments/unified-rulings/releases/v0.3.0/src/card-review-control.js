const { createCardReviewStore } = require('./card-review-store');
const { createTranslationStore } = require('./card-translation-store');
const { createCardSyncStore } = require('./card-sync-store');
const { createCardReviewService } = require('./card-review');
const { createReviewAuthenticator, uuid } = require('./card-review-auth');
async function createReviewControl({ root, authentication, now } = {}) {
  const auth = createReviewAuthenticator(authentication);
  const store = await createCardReviewStore(root), translationStore = await createTranslationStore(root), syncStore = await createCardSyncStore(root);
  const service = await createCardReviewService({ store, translationStore, syncStore, ...(now ? { now } : {}) });
  async function dispatch(request) {
    let context;
    const requestId = uuid(request?.requestId) ? request.requestId : null;
    try {
      if (Buffer.byteLength(JSON.stringify(request)) > 1048576) throw Object.assign(new Error(), { code: 'review-request-limit', status: 413 });
      context = auth.verify(request);
      const result = await service.execute(request.method, request.params, context);
      const response = { protocol: 'riftassist-control-1', requestId, ok: true, result };
      if (Buffer.byteLength(JSON.stringify(response)) > 2000000) throw Object.assign(new Error(), { code: 'review-response-limit', status: 413 });
      return response;
    } catch (e) {
      const code = typeof e?.code === 'string' && /^review-[a-z-]{1,80}$/u.test(e.code) ? e.code : 'review-unavailable';
      try { await service.auditFailure(context, code, requestId); }
      catch { return { protocol: 'riftassist-control-1', requestId, ok: false, error: { code: 'review-audit-unavailable', status: 503 } }; }
      return { protocol: 'riftassist-control-1', requestId, ok: false, error: { code, status: e.status || 503 } };
    }
  }
  return { dispatch };
}
module.exports = { createReviewControl };
