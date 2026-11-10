// The mock contract is ours, not a claim about Riot's production response schema.
const mock = require('../dev-fixtures/mock-cards.json');
const { assertPublication } = require('./card-publication');
const { collectMockSnapshot } = require('./riot-snapshot');
function createRiotAdapter({ mode = 'mock', config = {}, fetchImpl = globalThis.fetch,
  getApiKey = () => process.env.RIOT_API_KEY, decodeOfficial, mockCatalog = mock, mockPageSource, now } = {}) {
  if (!['mock', 'riot-api'].includes(mode)) throw new Error('Unknown Riot adapter mode.');
  return {
    mode,
    async collectSnapshot({ maxPages, timeoutMs } = {}) {
      // No production paging endpoint is guessed or contacted by the sync path.
      if (mode !== 'mock') throw Object.assign(new Error('Official synchronization awaits API approval and a reviewed paging mapper.'), { code: 'sync-official-disabled' });
      return collectMockSnapshot({ catalog: mockCatalog, pageSource: mockPageSource, maxPages, timeoutMs, now });
    },
    async collect() {
      if (mode === 'mock') { mockCatalog.cards.forEach(card => assertPublication(card, 'mock')); return structuredClone(mockCatalog); }
      if(process.env.RIFTASSI_ALLOW_PRODUCTION_START==='true')throw Object.assign(new Error('Official API development belongs to v0.3.0; v0.2.0 production uses the legacy catalog.'),{code:'official-api-deferred-to-v030'});
      // Neither approval nor finding a key can automatically turn this mode on.
      if (config.enabled !== true || !config.approvedAppReference || !config.mappingVersion || typeof decodeOfficial !== 'function') {
        throw new Error('A reviewed endpoint/schema mapper and explicit app approval configuration are required.');
      }
      let url;
      try { url = new URL(config.endpoint); } catch { throw new Error('A reviewed official API endpoint is required.'); }
      if (url.protocol !== 'https:' || !url.hostname.endsWith('.api.riotgames.com') || url.username || url.password || url.port || url.search || url.hash) {
        throw new Error('Only an explicitly reviewed Riot HTTPS API endpoint without credentials/query is allowed.');
      }
      const key = getApiKey();
      if (typeof key !== 'string' || !key.trim()) throw new Error('Riot API credential is not configured.');
      let response, decoded;
      try {
        response = await fetchImpl(url.href, { headers: { 'X-Riot-Token': key }, redirect: 'error', signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error();
        decoded = await decodeOfficial(await response.json());
      } catch { throw new Error('Riot collection failed. No response body or credential was logged.'); }
      if (!decoded || !Array.isArray(decoded.cards) || typeof decoded.version !== 'string' || !decoded.version) throw new Error('The reviewed mapper returned an invalid canonical catalog.');
      decoded.cards.forEach(card => assertPublication(card, 'riot-api'));
      return { schema: 'riftassist-canonical-1', origin: 'riot-api', version: decoded.version,
        sourceUrl: url.href, mappingVersion: config.mappingVersion, cards: decoded.cards };
    },
  };
}
module.exports = { createRiotAdapter };
