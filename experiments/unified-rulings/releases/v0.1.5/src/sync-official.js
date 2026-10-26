const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { sourceFetch } = require('./source-http');
const { officialLinks } = require('./html-content');
const { digest, validateRules } = require('./knowledge-provider');
const PARSER = 'coordinate-rule-columns-2';
const hubs = { en: 'https://playriftbound.com/en-us/rules-hub/', ko: 'https://playriftbound.com/ko-kr/rules-hub/' };
function parseDate(text) {
  const iso = text.match(/(20\d{2})[-.]\s*(\d{1,2})[-.]\s*(\d{1,2})/u);
  const ko = text.match(/(20\d{2})년\s*(\d{1,2})월\s*(\d{1,2})일/u);
  const m = iso || ko;
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  const en = text.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+20\d{2}/iu);
  return en && Number.isFinite(Date.parse(en[0])) ? new Date(Date.parse(en[0])).toISOString().slice(0, 10) : null;
}
async function cachedFetch(root, store, id, url, maxBytes) {
  const old = store.document(id);
  const same = old?.url === url;
  const response = await sourceFetch(url, { etag: same ? old.etag : null, lastModified: same ? old.lastModified : null, maxBytes });
  const folder = path.join(root, 'source-updates', 'blobs');
  await fs.mkdir(folder, { recursive: true });
  if (response.status === 304) {
    const bytes = await fs.readFile(path.join(folder, old.hash));
    if (digest(bytes) !== old.hash) throw new Error('Cached source hash mismatch.');
    return { ...old, bytes };
  }
  const hash = digest(response.bytes);
  const file = path.join(folder, hash);
  try { await fs.writeFile(file, response.bytes, { flag: 'wx' }); } catch (e) { if (e.code !== 'EEXIST') throw e; }
  const record = { url, hash, etag: response.etag, lastModified: response.lastModified, fetchedAt: new Date().toISOString() };
  store.saveDocument(id, record);
  return { ...record, bytes: response.bytes };
}
function selectPdf(links, kind) {
  const pattern = kind === 'core-rules' ? /core rules|핵심 규칙|코어 룰/iu : /tournament rules|토너먼트 규칙|대회 규칙|대회 규정/iu;
  const found = links.filter(l => /\.pdf$/iu.test(new URL(l.url).pathname) && pattern.test(`${l.title} ${l.heading}`));
  if (found.length !== 1) throw new Error(`${kind}: expected one canonical PDF, found ${found.length}.`);
  return found[0];
}
async function pdfDocument(root, store, kind, locale, link) {
  const source = await cachedFetch(root, store, `pdf:${kind}:${locale}`, link.url, 100 * 1024 * 1024);
  if (!source.bytes.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new Error('Official source is not a PDF.');
  const parsedId = `parsed:${source.hash}:${PARSER}`;
  const old = store.document(parsedId);
  if (old) return { ...old, url: link.url, hash: source.hash };
  const runtime = path.resolve(path.dirname(process.execPath), '..', 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs');
  const pdfjs = await import(pathToFileURL(process.env.RIFTASSI_PDFJS_PATH || runtime).href);
  const { extractRules, positionedLines } = await import('./pdf-rules.mjs');
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(source.bytes), useSystemFonts: true }).promise;
  let header;
  try { header = positionedLines((await (await pdf.getPage(1)).getTextContent()).items).slice(0, 15).map(l => l.text).join('\n'); }
  finally { await pdf.destroy(); }
  const headerLine = header.split('\n').find(l => /Last Updated|최종\s*업데이트|최종\s*수정/iu.test(l));
  const version = parseDate(headerLine || '');
  if (!version || !Number.isFinite(Date.parse(version))) throw new Error(`${kind}/${locale}: PDF version date not found.`);
  if (Date.parse(version) > Date.now()) throw new Error(`${kind}/${locale}: future PDF held until ${version}.`);
  const effective = /effective|시행|적용/iu.test(link.context) ? parseDate(link.context) : null;
  if (effective && Date.parse(effective) > Date.now()) throw new Error(`Future effective date: ${effective}`);
  const parsed = await extractRules(pdfjs, path.join(root, 'source-updates', 'blobs', source.hash));
  const result = { version, pages: parsed.pages, parserVersion: PARSER, entries: [...parsed.rules] };
  store.saveDocument(parsedId, result);
  return { ...result, url: link.url, hash: source.hash };
}
function checkChange(previous, next, kind) {
  const old = previous.filter(i => i.documentId === kind);
  if (next.length < (kind === 'core-rules' ? 1000 : 200)) throw new Error(`${kind}: too few parsed definitions.`);
  if (old.length && next.length < old.length * .9) throw new Error(`${kind}: unexpected rule-count drop; review required.`);
  const byId = new Map(old.map(i => [i.id, i]));
  const changed = next.filter(i => i.officialTextEn !== byId.get(i.id)?.officialTextEn).length;
  if (old.length && changed > Math.max(100, old.length * .3)) throw new Error(`${kind}: broad text change (${changed}); review required.`);
}
async function syncOfficial(root, store, baseline) {
  const links = {}, errors = {};
  for (const locale of ['en', 'ko']) {
    try {
      const source = await cachedFetch(root, store, `hub:${locale}`, hubs[locale], 8 * 1024 * 1024);
      links[locale] = officialLinks(source.bytes.toString('utf8'), hubs[locale]).links;
    } catch (e) { errors[locale] = e.message; }
  }
  const updates = new Map(), documents = {};
  for (const kind of ['core-rules', 'tournament-rules']) {
    try {
      if (!links.en) throw new Error(errors.en || 'English rules hub unavailable.');
      const en = await pdfDocument(root, store, kind, 'en', selectPdf(links.en, kind));
      let ko, koError, alignment = 'matching-document-dates';
      try {
        if (!links.ko) throw new Error(errors.ko || 'Korean rules hub unavailable.');
        ko = await pdfDocument(root, store, kind, 'ko', selectPdf(links.ko, kind));
        if (ko.version !== en.version) {
          const existing = new Map(baseline.filter(r => r.documentId === kind).map(r => [r.ruleId, r]));
          const sameEn = en.entries.every(([id, r]) => existing.get(id)?.officialTextEn === r.text) && en.entries.length === [...existing.values()].filter(r => r.officialTextEn).length;
          const sameKo = ko.entries.every(([id, r]) => existing.get(id)?.officialTextKo === r.text) && ko.entries.length === [...existing.values()].filter(r => r.officialTextKo).length;
          if (!sameEn || !sameKo) throw new Error('Korean/English version dates differ; changed bilingual pairing requires review.');
          alignment = 'unchanged-existing-bilingual-content';
        }
        if (ko.entries.length < en.entries.length * .9) throw new Error('Korean definitions incomplete.');
      } catch (e) {
        ko = null; koError = e.message;
        const previous = baseline.filter(r => r.documentId === kind), byId = new Map(previous.map(r => [r.ruleId, r]));
        const sameEnglish = en.entries.every(([id, r]) => byId.get(id)?.officialTextEn === r.text) && en.entries.length === previous.filter(r => r.officialTextEn).length;
        const translated = previous.filter(r => r.officialTextKo);
        if (sameEnglish && translated.length >= en.entries.length * .9) {
          const sample = translated.find(r => r.pdfUrlKo);
          if (sample) {
            ko = { entries: translated.map(r => [r.ruleId, { text: r.officialTextKo, page: r.pageKo, parentId: r.parentId }]),
              version: sample.versionKo || sample.version, url: sample.pdfUrlKo.split('#')[0], hash: sample.sourceHashKo || null };
            alignment = 'retained-translation-unchanged-english';
          }
        }
      }
      const translated = new Map(ko?.entries || []);
      const title = kind === 'core-rules' ? 'Riftbound Core Rules' : 'Riftbound Tournament Rules';
      const combined = new Map(en.entries);
      for (const [id, r] of translated) if (!combined.has(id)) combined.set(id, { text: '', page: null, parentId: r.parentId });
      const rows = [...combined].map(([id, r]) => {
        const t = translated.get(id);
        return { id: `${kind}:${id}`, documentId: kind, categories: [kind === 'core-rules' ? 'rules' : 'tournament'],
          sourceType: 'official', sourceName: title, version: en.version, ruleId: id, title: `${title} · ${id}`,
          officialTextEn: r.text, officialTextKo: t?.text || '', parentId: r.parentId,
          pageEn: r.page, pageKo: t?.page || null, url: r.page ? `${en.url}#page=${r.page}` : `${ko.url}#page=${t.page}`,
          pdfUrlEn: r.page ? `${en.url}#page=${r.page}` : '', pdfUrlKo: t ? `${ko.url}#page=${t.page}` : '',
          parserVersion: PARSER, sourceHashEn: en.hash, sourceHashKo: ko?.hash || null, versionEn: en.version, versionKo: ko?.version || null, languageAlignment: alignment };
      });
      checkChange(baseline, rows, kind); validateRules(rows);
      updates.set(kind, rows);
      documents[kind] = { state: koError ? 'partial-language' : 'current', version: en.version, count: rows.length,
        urlEn: en.url, urlKo: ko?.url || null, hashEn: en.hash, hashKo: ko?.hash || null, versionKo: ko?.version || null, languageAlignment: alignment, koError: koError || null };
    } catch (e) { documents[kind] = { state: 'retained', error: e.message }; }
  }
  // Article supplements have their own provenance. They are preserved, never relabeled as refreshed PDFs.
  const rules = baseline.filter(i => !updates.has(i.documentId)).concat(...updates.values());
  const result = { checkedAt: new Date().toISOString(), documents, supplements: 'preserved-existing-articles', rules };
  store.setState('official', { ...result, rules: undefined });
  return result;
}
module.exports = { syncOfficial, parseDate, selectPdf, checkChange };
