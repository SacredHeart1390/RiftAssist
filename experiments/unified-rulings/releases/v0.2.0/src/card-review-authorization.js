// In-process capability: JSON from legacy manager/public APIs cannot forge it.
const path = require('node:path');
const grants = new WeakMap();
function issueReviewAuthorization(root, nextId, expectedId, action, manifestDigest) {
  const grant = Object.freeze({}); grants.set(grant, { root: path.resolve(root), nextId, expectedId, action, manifestDigest }); return grant;
}
function checkReviewAuthorization(grant, root, nextId, expectedId, manifestDigest) {
  const value = grant && grants.get(grant);
  return value && value.root === path.resolve(root) && value.nextId === nextId && value.expectedId === expectedId
    && value.manifestDigest === manifestDigest ? value.action : null;
}
module.exports = { issueReviewAuthorization, checkReviewAuthorization };
