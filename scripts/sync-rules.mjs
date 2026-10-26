import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE_DIR = path.join(ROOT, 'tmp', 'pdfs');
const KNOWLEDGE_PATH = path.join(ROOT, 'knowledge', 'evidence.json');
const REFRESH = process.argv.includes('--refresh');
const VERSION = '2026-10-09';

const DOCUMENTS = [
  {
    id: 'core-rules',
    name: 'Riftbound Core Rules',
    category: 'rules',
    en: {
      filename: 'core-en.pdf',
      url: 'https://cmsassets.rgpub.io/sanity/files/dsfx7636/news_live/5c7946f7c3b8c6e0faff85ab6dadc6d2e721ea94.pdf',
      pageUrl: 'https://riftbound.gg/rules/core-rules/',
    },
    ko: {
      filename: 'core-ko.pdf',
      url: 'https://cmsassets.rgpub.io/sanity/files/dsfx7636/news_live/162b6f1a4bf6711b778684336566483f4dce256c.pdf',
      pageUrl: 'https://playriftbound.com/ko-kr/rules-hub/',
    },
  },
  {
    id: 'tournament-rules',
    name: 'Riftbound Tournament Rules',
    category: 'tournament',
    en: {
      filename: 'tournament-en.pdf',
      url: 'https://cmsassets.rgpub.io/sanity/files/dsfx7636/news_live/861752822d217edf37d9febaeaf77a7d924c1bb6.pdf',
      pageUrl: 'https://riftbound.gg/rules/tournament-rules/',
    },
    ko: {
      filename: 'tournament-ko.pdf',
      url: 'https://cmsassets.rgpub.io/sanity/files/dsfx7636/news_live/6e1f622e65081b2975853b603eaaef33fec74afb.pdf',
      pageUrl: 'https://playriftbound.com/ko-kr/rules-hub/',
    },
  },
];

const SUPPLEMENT_DOCUMENTS = [
  {
    id: 'core-radiance-patch-notes',
    name: 'Core Rules: Radiance Patch Notes',
    category: 'rules',
    version: '2026-10-16',
    enUrl: 'https://playriftbound.com/en-us/news/announcements/core-rules-radiance-patch-notes-effective-october-16-2026/',
    koUrl: 'https://playriftbound.com/ko-kr/news/announcements/core-rules-radiance-patch-notes-effective-october-16-2026/',
    sectionMap: {
      'Unique Radiance Interactions': '고유한 레디언스 상호작용',
      'Core Rules Changes': '핵심 규칙 변경 사항',
      'Legacy Updates': '레거시 업데이트',
    },
  },
  {
    id: 'october-tournament-changelog',
    name: 'October 2026 Tournament Rules Changelog',
    category: 'tournament',
    version: '2026-10-16',
    enUrl: 'https://playriftbound.com/en-us/news/announcements/october-2026-tournament-rules-changelog/',
    koUrl: 'https://playriftbound.com/ko-kr/news/announcements/october-2026-tournament-rules-changelog/',
    sectionMap: {
      'Changing Gameplay Decisions': '게임플레이 결정 변경',
      Changelog: '변경 기록',
    },
  },
  {
    id: 'radiance-errata',
    name: 'Radiance Errata Updates',
    category: 'rules',
    version: '2026-10-09',
    enUrl: 'https://playriftbound.com/en-us/news/announcements/radiance-errata-updates/',
    koUrl: '',
    sectionMap: {},
  },
];

async function loadPdfJs() {
  const specifier = process.env.PDFJS_MODULE || 'pdfjs-dist/legacy/build/pdf.mjs';
  try {
    return await import(specifier);
  } catch (error) {
    if (!path.isAbsolute(specifier)) throw error;
    return import(pathToFileURL(specifier).href);
  }
}

async function ensurePdf(source) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const filePath = path.join(CACHE_DIR, source.filename);
  if (!REFRESH) {
    try {
      const stat = await fs.stat(filePath);
      if (stat.size > 100_000) return filePath;
    } catch { /* fetch below */ }
  }
  const response = await fetch(source.url, { signal: AbortSignal.timeout(90_000) });
  if (!response.ok) throw new Error(`Could not download ${source.filename}: HTTP ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length < 100_000 || bytes.subarray(0, 5).toString() !== '%PDF-') {
    throw new Error(`Unexpected PDF response for ${source.filename}`);
  }
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, bytes);
  await fs.rename(tempPath, filePath);
  return filePath;
}

function linesFromItems(items) {
  const lines = [];
  let line = '';
  for (const item of items) {
    const piece = item.str || '';
    if (piece) {
      const needsSpace = line && !/\s$/.test(line) && !/^\s/.test(piece) && !/^[,.;:!?%)\]}]/u.test(piece);
      line += `${needsSpace ? ' ' : ''}${piece}`;
    }
    if (item.hasEOL) {
      if (line.trim()) lines.push(line.trim());
      line = '';
    }
  }
  if (line.trim()) lines.push(line.trim());
  return lines;
}

async function extractRules(pdfjs, filePath, documentName, language) {
  const data = new Uint8Array(await fs.readFile(filePath));
  const pdf = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const rules = new Map();
  let current = null;
  const datePattern = /^(?:Last Updated|최종 업데이트|최종 업데이트 날짜|Riftbound .* Rules|리프트바운드 .* 규칙|페이지\s*\d+)/i;

  function finish() {
    if (!current) return;
    const text = current.lines.join(' ').replace(/\s+/gu, ' ').replace(/\s+([,.;:!?%)\]}])/gu, '$1').trim();
    rules.set(current.id, { text, page: current.page });
    current = null;
  }

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    for (const rawLine of linesFromItems(content.items)) {
      const line = rawLine.replace(/\s+/gu, ' ').trim();
      if (!line || datePattern.test(line) || /^\d{1,3}$/u.test(line)) continue;
      const match = line.match(/^(\d{3}(?:\.[0-9a-z]+)*)\.\s*(.*)$/iu);
      if (match) {
        finish();
        current = { id: match[1], page: pageNumber, lines: match[2] ? [match[2]] : [] };
        continue;
      }
      if (current) current.lines.push(line);
    }
  }
  finish();
  if (!rules.size) throw new Error(`No rule numbers extracted from ${documentName} (${language})`);
  return rules;
}

function decodeEntities(value) {
  return value
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&quot;/giu, '"')
    .replace(/&#x27;|&#39;/giu, "'")
    .replace(/&#(\d+);/gu, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/giu, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function plainText(html) {
  return decodeEntities(html
    .replace(/<(script|style|svg)[^>]*>[\s\S]*?<\/\1>/giu, ' ')
    .replace(/<(?:br|\/p|\/li|\/div|\/blockquote|\/td|\/th)[^>]*>/giu, '\n')
    .replace(/<[^>]+>/gu, ' '))
    .replace(/[ \t]+/gu, ' ')
    .replace(/ *\n */gu, '\n')
    .replace(/\n{2,}/gu, '\n')
    .trim();
}

function parseArticleSections(html) {
  const cleaned = html.replace(/<(script|style|svg)[^>]*>[\s\S]*?<\/\1>/giu, ' ');
  const headingPattern = /<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/giu;
  const headings = [...cleaned.matchAll(headingPattern)];
  const sections = [];
  for (let index = 0; index < headings.length; index += 1) {
    const title = plainText(headings[index][2]);
    if (!title || /^(?:related articles|관련 글)$/iu.test(title)) continue;
    const start = headings[index].index + headings[index][0].length;
    const end = headings[index + 1]?.index ?? cleaned.length;
    let text = plainText(cleaned.slice(start, end));
    if (!text) continue;
    const paragraphs = text.split('\n').map((line) => line.trim()).filter(Boolean);
    let part = [];
    let length = 0;
    let partNumber = 1;
    for (const paragraph of paragraphs) {
      if (length + paragraph.length > 4200 && part.length) {
        sections.push({ title: partNumber === 1 ? title : `${title} (${partNumber})`, text: part.join('\n') });
        partNumber += 1;
        part = [];
        length = 0;
      }
      part.push(paragraph);
      length += paragraph.length + 1;
    }
    if (part.length) sections.push({ title: partNumber === 1 ? title : `${title} (${partNumber})`, text: part.join('\n') });
  }
  return sections;
}

async function fetchArticle(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error(`Could not fetch official article ${url}: HTTP ${response.status}`);
  return response.text();
}

async function extractSupplements() {
  const results = [];
  for (const doc of SUPPLEMENT_DOCUMENTS) {
    const enSections = parseArticleSections(await fetchArticle(doc.enUrl));
    const koSections = doc.koUrl ? parseArticleSections(await fetchArticle(doc.koUrl)) : [];
    const koByTitle = new Map(koSections.map((section) => [section.title.replace(/\s+/gu, ' ').trim(), section]));
    const enTitle = enSections.find((section) => /^Core Rules:|^October 2026|^Radiance Errata/iu.test(section.title));
    const canonical = enSections.filter((section) => section !== enTitle);
    if (enTitle) canonical.unshift(enTitle);
    let added = 0;
    for (const en of canonical) {
      const koTitle = doc.sectionMap[en.title] || '';
      const ko = koTitle ? koByTitle.get(koTitle) : en === enTitle ? koSections[0] : undefined;
      const slug = en.title.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/gu, '');
      results.push({
        id: `supplement:${doc.id}:${slug}`,
        documentId: doc.id,
        categories: [doc.category],
        sourceType: 'official',
        sourceName: doc.name,
        version: doc.version,
        ruleId: '',
        title: `${doc.name} · ${en.title}`,
        officialTextEn: en.text,
        officialTextKo: ko?.text || '',
        pageEn: null,
        pageKo: null,
        url: doc.enUrl,
        urlKo: doc.koUrl || '',
        pdfUrlEn: '',
        pdfUrlKo: '',
        retrievedAt: new Date().toISOString(),
      });
      added += 1;
    }
  }
  return results;
}

async function sync() {
  const pdfjs = await loadPdfJs();
  const evidence = [];
  const stats = [];
  for (const doc of DOCUMENTS) {
    const enPath = await ensurePdf(doc.en);
    const koPath = await ensurePdf(doc.ko);
    const [enRules, koRules] = await Promise.all([
      extractRules(pdfjs, enPath, doc.name, 'en'),
      extractRules(pdfjs, koPath, doc.name, 'ko'),
    ]);
    const ids = [...new Set([...enRules.keys(), ...koRules.keys()])];
    let paired = 0;
    let missingKo = 0;
    for (const ruleId of ids) {
      const en = enRules.get(ruleId);
      const ko = koRules.get(ruleId);
      if (en?.text && ko?.text) paired += 1;
      if (en?.text && !ko?.text) missingKo += 1;
      if (!en?.text && !ko?.text) continue;
      evidence.push({
        id: `${doc.id}:${ruleId}`,
        documentId: doc.id,
        categories: [doc.category],
        sourceType: 'official',
        sourceName: doc.name,
        version: VERSION,
        ruleId,
        title: `${doc.name} · ${ruleId}`,
        officialTextEn: en?.text || '',
        officialTextKo: ko?.text || '',
        pageEn: en?.page || null,
        pageKo: ko?.page || null,
        url: `${doc.en.pageUrl}${doc.id === 'core-rules' ? `#r-${ruleId}` : `#r-${ruleId}`}`,
        pdfUrlEn: `${doc.en.url}${en?.page ? `#page=${en.page}` : ''}`,
        pdfUrlKo: `${doc.ko.url}${ko?.page ? `#page=${ko.page}` : ''}`,
        retrievedAt: new Date().toISOString(),
      });
    }
    stats.push({ document: doc.name, enRules: enRules.size, koRules: koRules.size, paired, missingKo });
  }

  const supplements = await extractSupplements();
  evidence.push(...supplements);

  evidence.sort((a, b) => a.documentId.localeCompare(b.documentId) || a.ruleId.localeCompare(b.ruleId, undefined, { numeric: true }));
  const tempPath = `${KNOWLEDGE_PATH}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8');
  await fs.rename(tempPath, KNOWLEDGE_PATH);
  console.log(JSON.stringify({ version: VERSION, evidenceCount: evidence.length, supplementCount: supplements.length, documents: stats }, null, 2));
}

sync().catch((error) => {
  console.error(`Rule index sync failed: ${error.message}`);
  process.exitCode = 1;
});
