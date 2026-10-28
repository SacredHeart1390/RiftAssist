const crypto = require('node:crypto');
const { stable } = require('./card-translation-core');
const { safeEqual } = require('./access-control');
const contexts = new WeakSet();
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/u.test(value);
const label = value => typeof value === 'string' && /^[A-Za-z0-9._-]{1,80}$/u.test(value);
const scopes = ['review:read', 'review:decide', 'cards:stage', 'cards:activate', 'cards:rollback', 'audit:read'];
const error = (code, status = 400) => Object.assign(new Error(code), { code, status, expected: true });
function signRequest(request, secret) {
  const { signature, ...payload } = request;
  return crypto.createHmac('sha256', secret).update(stable(payload)).digest('hex');
}
function assertScope(context, scope) {
  if (!contexts.has(context) || !context.scopes.includes(scope)) throw error('review-forbidden', 403);
}
function assertIdentity(context) { if (!contexts.has(context)) throw error('review-unauthorized', 401); }
function createReviewAuthenticator({ sessionId, credentials, now = () => Date.now(), expiresAt = now() + 3600000 }) {
  if (!uuid(sessionId) || !Array.isArray(credentials) || !credentials.length || credentials.length > 20
    || !Number.isFinite(expiresAt) || expiresAt <= now() || expiresAt > now() + 86400000) throw error('review-auth-configuration');
  const keys = new Map(), nonces = new Map(), secrets = new Set();
  for (const row of credentials) {
    if (!label(row.id) || !label(row.actor) || keys.has(row.id) || !/^[a-f0-9]{64}$/u.test(row.secret || '')
      || secrets.has(row.secret) || !Array.isArray(row.scopes) || new Set(row.scopes).size !== row.scopes.length
      || row.scopes.some(scope => !scopes.includes(scope))) throw error('review-auth-configuration');
    secrets.add(row.secret);
    keys.set(row.id, structuredClone(row));
  }
  function verify(request) {
    const at = now(), row = keys.get(request?.credentialId);
    if (!request || request.protocol !== 'riftassist-control-1' || request.sessionId !== sessionId || !uuid(request.requestId)
      || !uuid(request.nonce) || !Number.isSafeInteger(request.issuedAt) || Math.abs(at - request.issuedAt) > 30000
      || at >= expiresAt || !row || !safeEqual(request.signature, signRequest(request, row.secret))) throw error('review-unauthorized', 401);
    for (const [nonce, until] of nonces) if (until < at) nonces.delete(nonce);
    if (nonces.has(request.nonce)) throw error('review-replay', 409);
    if (nonces.size >= 10000) throw error('review-session-limit', 429);
    nonces.set(request.nonce, at + 60000);
    const context = Object.freeze({ actor: row.actor, scopes: Object.freeze([...row.scopes]), requestId: request.requestId });
    contexts.add(context); return context;
  }
  return { verify };
}
module.exports = { createReviewAuthenticator, assertScope, assertIdentity, signRequest, error, uuid, label };
