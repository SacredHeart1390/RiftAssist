import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import cardsModule from '../src/cards.js';
import refreshModule from '../src/riftnaru-refresh.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'knowledge', 'cards.json');
const input = process.argv[2];
if (input === '--candidate') {
  try {
    if (process.argv.length !== 6) throw new Error('Usage: --candidate <active-cards.json> <complete-export.json> <new-output-directory>');
    const base = JSON.parse(await fs.readFile(path.resolve(process.argv[3]), 'utf8'));
    const observation = JSON.parse(await fs.readFile(path.resolve(process.argv[4]), 'utf8'));
    const result = refreshModule.mergeRiftnaruCatalog(base, observation);
    const outputDirectory = path.resolve(process.argv[5]);
    // A new directory prevents overwriting the active catalog or an earlier candidate.
    await fs.mkdir(outputDirectory);
    await fs.writeFile(path.join(outputDirectory, 'cards.json'), JSON.stringify(result.catalog, null, 2) + '\n', {flag:'wx'});
    await fs.writeFile(path.join(outputDirectory, 'diff.json'), JSON.stringify(result.report, null, 2) + '\n', {flag:'wx'});
    console.log(JSON.stringify({changed:result.report.changedAny,before:result.report.before,after:result.report.after,
      added:result.report.added.length,changedCards:result.report.changed.length,missing:result.report.missing.length,held:result.report.held.length,version:result.report.version}));
  } catch (error) { console.error(`Candidate stopped; active catalog retained: ${error.message}`); process.exitCode=1; }
} else if (!input || process.argv.length !== 3) {
  console.error('Usage: node scripts/import-riftnaru.mjs <local-export.json>');
  process.exitCode = 1;
} else {
  try {
    const sourcePath = path.resolve(input);
    if ((await fs.stat(sourcePath)).size > 25 * 1024 * 1024) throw new Error('Import is larger than 25 MB.');
    const data = JSON.parse((await fs.readFile(sourcePath, 'utf8')).replace(/^\uFEFF/u, ''));
    if (data.schemaVersion !== 1 || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/u.test(data.capturedAt || '') || !Number.isFinite(Date.parse(data.capturedAt)) || !Array.isArray(data.cards) || !data.cards.length || data.cards.length > 20000) throw new Error('Expected a dated schemaVersion 1 public-card export.');
    const hash = crypto.createHash('sha256').update(JSON.stringify(data)).digest('hex').slice(0, 12);
    const version = `riftnaru-${data.capturedAt.slice(0, 10)}-${hash}`;
    const incoming = data.cards.map((card) => {
      if (!/^[a-z0-9][a-z0-9-]{0,99}$/u.test(card.id || '')) throw new Error('Invalid Rift Naru card slug.');
      const url = new URL(card.sourceUrl);
      if (url.origin !== 'https://www.riftnaru.com' || url.pathname !== `/cards/${card.id}` || url.username || url.password || url.search || url.hash) throw new Error(`Source URL must match the public card slug: ${card.id}`);
      return {
        id: `riftnaru:${card.id}`, code: card.code, nameKo: card.nameKo, nameEn: card.nameEn, aliases: card.aliases || [],
        set: card.set, type: card.type, domains: card.domains || [], subtitle: card.subtitle || '', textEn: card.textEn, textKo: card.textKo,
        stats: card.stats, imageUrl: card.imageUrl, errata: '', status: 'source-observed',
        translationStatus: 'unofficial-riftnaru', textVerified: false,
        permissions: { display: false, modelInput: false },
        prototypeUse: { enabled: true, modelInput: card.textComplete === true, redistribution: false, rightsConfirmed: false },
        source: { kind: 'riftnaru-public', label: 'Rift Naru 공개 카드 자료 · 공식 원문 대조 전', url: url.href, version, fetchedAt: data.capturedAt, updatedAt: '', verification: 'observed-public-page' },
      };
    });
    // Validate the entire incoming batch before touching the last good catalog.
    const normalized = cardsModule.normalizeCatalog({ schemaVersion: 1, version, updatedAt: data.capturedAt, cards: incoming });
    let previousText = '';
    let previous = { cards: [] };
    try { previousText = await fs.readFile(target, 'utf8'); previous = cardsModule.normalizeCatalog(JSON.parse(previousText.replace(/^\uFEFF/u, ''))); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const incomingNames = new Set(normalized.cards.flatMap((card) => [card.nameKo, card.nameEn]).filter(Boolean));
    // Only retire the old names-only placeholders. Other printings/sources retain separate IDs.
    const keep = previous.cards.filter((card) => !(card.source.kind === 'user-provided-name' && [card.nameKo, card.nameEn].some((name) => incomingNames.has(name))));
    const merged = new Map(keep.map((card) => [card.id, card]));
    const completeListing = /^all-(\d+)-artwork-listings-observed-/u.exec(data.coverage || '');
    if (completeListing && Number(completeListing[1]) !== incoming.length) throw new Error('Full-list coverage does not match the supplied record count.');
    if (completeListing) {
      const present = new Set(normalized.cards.map((card) => card.id));
      for (const [id, card] of merged) if (card.source.kind === 'riftnaru-public' && !present.has(id)) merged.set(id, { ...card, status: 'withdrawn' });
    }
    for (const card of normalized.cards) merged.set(card.id, card);
    const catalog = cardsModule.normalizeCatalog({ schemaVersion: 1, version, updatedAt: data.capturedAt, coverage: data.coverage || 'partial', cards: [...merged.values()] });
    const output = `${JSON.stringify(catalog, null, 2)}\n`;
    if (previousText === output) {
      console.log(JSON.stringify({ changed: false, cards: catalog.cards.length, version }));
    } else {
      const archive = path.join(root, 'knowledge', 'card-history');
      await fs.mkdir(archive, { recursive: true });
      if (previousText) {
        const previousHash = crypto.createHash('sha256').update(previousText).digest('hex');
        await fs.writeFile(path.join(archive, `${previousHash}.json`), previousText, { flag: 'wx' }).catch((error) => { if (error.code !== 'EEXIST') throw error; });
      }
      const staging = `${target}.${process.pid}.pending`;
      await fs.writeFile(staging, output, { flag: 'wx' });
      await fs.rename(staging, target);
      console.log(JSON.stringify({ changed: true, imported: normalized.cards.length, cards: catalog.cards.length, modelReady: catalog.cards.filter((card) => card.modelReady).length, version, coverage: data.coverage || 'unspecified' }));
    }
  } catch (error) {
    console.error(`Import stopped; existing catalog retained: ${error.message}`);
    process.exitCode = 1;
  }
}
