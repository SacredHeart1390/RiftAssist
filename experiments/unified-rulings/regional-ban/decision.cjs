'use strict';

// Research prototype. Explicit bounded evidence, no implication of card availability.
const data = require('./events.json');
const isoDate = date => /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date + 'T00:00:00Z')) && new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) === date;

function decide({ cardId, region, format, date, eventRules = false } = {}) {
  const card = data.cards.find(item => item.id === cardId);
  const result = { card: card || null, region, format, date, ban: 'unknown', availability: 'unknown', reviewedAsOf: data.reviewedAsOf, sources: [], reason: '' };
  const unknown = reason => ({ ...result, reason });
  if (!card) return unknown('unrecognized-card');
  if (!isoDate(date || '')) return unknown('invalid-date');
  if (!['kr', 'global'].includes(region)) return unknown('unsupported-region');
  if (!['standard', '2v2', 'sealed'].includes(format)) return unknown('unsupported-format');
  if (eventRules) return unknown('event-addendum-unverified');
  if (format === 'sealed') return unknown('sealed-requires-event-pool-and-format-review');
  if (region === 'kr') {
    result.sources = [data.sources.kr20261114];
    // The Korean announcement does not explicitly settle the 2v2-only Legend ban.
    if (format === '2v2') return unknown('korean-2v2-list-unverified');
    // Korean Spiritforged is announced after the December 5-6 major, but not dated.
    if (date < '2026-11-23' || date > '2026-12-06') return unknown('korean-list-or-launch-date-unverified');
    return { ...result, ban: 'not-banned', reason: 'korean-origins-window' };
  }
  result.sources = [data.sources.hub, data.sources.global20261114];
  // The Hub snapshot is dated September 18; future changes require fresh review.
  if (date < '2026-09-18' || date > '2026-11-23') return unknown('date-outside-reviewed-global-window');
  const banned = data.globalBaseline.includes(cardId) || (format === '2v2' && data.global2v2Only.includes(cardId)) || (date >= '2026-11-23' && data.globalEffective20261123.includes(cardId));
  return { ...result, ban: banned ? 'banned' : 'not-banned', reason: 'global-reviewed-list' };
}

module.exports = { decide };
