function officialURL(value) {
  let url;
  try { url = new URL(value); } catch { return false; }
  return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash
    && (url.hostname === 'riotgames.com' || url.hostname.endsWith('.riotgames.com') || url.hostname === 'playriftbound.com' || url.hostname.endsWith('.playriftbound.com') || url.hostname.endsWith('.rgpub.io'));
}
function assertPublication(card, origin) {
  const state = card.releaseStatus || (origin === 'mock' ? card.preview === true ? 'preview-unreleased' : 'released' : 'unknown');
  if (!['released', 'preview-unreleased'].includes(state) || (card.preview === true && state !== 'preview-unreleased')) throw new Error('Card release status requires reviewed mapping.');
  if (state === 'released') return { state, publiclyRevealed: false, url: '', version: '' };
  const publication = card.publication;
  let url;
  try { url = new URL(publication?.url); } catch { throw new Error('Unreleased cards require official public reveal evidence.'); }
  const officialHost = url.hostname === 'playriftbound.com' || url.hostname.endsWith('.playriftbound.com')
    || url.hostname === 'riotgames.com' || url.hostname.endsWith('.riotgames.com') || url.hostname.endsWith('.rgpub.io');
  if (publication.publiclyRevealed !== true || typeof publication.version !== 'string' || !publication.version
    || url.protocol !== 'https:' || url.username || url.password || url.search || url.hash
    || (origin === 'riot-api' && !officialHost) || (origin === 'mock' && url.hostname !== 'example.invalid')) throw new Error('Unreleased cards require official public reveal evidence.');
  return { state, publiclyRevealed: true, url: url.href, version: publication.version };
}
module.exports = { assertPublication, officialURL };
