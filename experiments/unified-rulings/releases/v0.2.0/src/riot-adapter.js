// The mock contract is ours, not a claim about Riot's production response schema.
const mock = require('../dev-fixtures/mock-cards.json');
function createRiotAdapter({ mode = 'mock', config = {}, fetchImpl = globalThis.fetch,
  getApiKey = () => process.env.RIOT_API_KEY, decodeOfficial } = {}) {
  if (!['mock', 'riot-api'].includes(mode)) throw new Error('Unknown Riot adapter mode.');
  return {
    async collect() {
      if (mode === 'mock') return structuredClone(mock);
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
      return { schema: 'riftassist-canonical-1', origin: 'riot-api', version: decoded.version,
        sourceUrl: url.href, mappingVersion: config.mappingVersion, cards: decoded.cards };
    },
  };
}
module.exports = { createRiotAdapter };
