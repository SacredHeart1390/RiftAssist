import fs from 'node:fs/promises';

const label = /^(\d{3}(?:\.[0-9a-z]+)*)\.\s*(.*)$/iu;
const normalize = (text) => text.normalize('NFKC').replace(/\s+/gu, ' ').trim();
export const PARSER_VERSION = 'coordinate-rule-columns-2';

export function positionedLines(items) {
  const lines = [];
  for (const item of items.filter((item) => item.str?.trim()).sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4])) {
    const y = item.transform[5];
    let row = lines.find((line) => Math.abs(line.y - y) <= 1.7);
    if (!row) { row = { y, items: [] }; lines.push(row); }
    row.items.push(item);
  }
  return lines.sort((a, b) => b.y - a.y).map((line) => {
    const parts = line.items.sort((a, b) => a.transform[4] - b.transform[4]);
    let text = '', end = null;
    for (const part of parts) {
      if (text && end !== null && part.transform[4] - end > 0.7 && !/\s$/u.test(text)) text += ' ';
      text += part.str;
      end = part.transform[4] + part.width;
    }
    return { x: parts[0].transform[4], y: line.y, text: normalize(text) };
  });
}

export async function extractRules(pdfjs, filename) {
  const document = await pdfjs.getDocument({ data: new Uint8Array(await fs.readFile(filename)), useSystemFonts: true }).promise;
  const pages = [];
  try {
    for (let p = 1; p <= document.numPages; p++) {
      const page = await document.getPage(p);
      pages.push({ page: p, lines: positionedLines((await page.getTextContent()).items), height: page.view[3] });
      page.cleanup();
    }
  } finally { await document.destroy(); }
  const candidates = pages.flatMap((page) => page.lines.filter((line) => label.test(line.text)));
  if (candidates.length < 20) throw new Error('Too few rule labels; layout requires review.');
  // Rule identifiers occupy a dedicated left column. Wrapped body references do not.
  const clusters = new Map();
  for (const line of candidates) {
    const x = Math.round(line.x / 3) * 3;
    clusters.set(x, (clusters.get(x) || 0) + 1);
  }
  const columns = [...clusters].filter(([, count]) => count >= 10).sort((a, b) => a[0] - b[0]);
  if (!columns.length) throw new Error('Rule-number column not detected.');
  const column = columns[0][0];
  const rules = new Map(), duplicates = [];
  let current = null;
  const finish = () => {
    if (!current) return;
    const text = normalize(current.lines.join(' '));
    if (!text) throw new Error(`Empty definition: ${current.id}`);
    if (rules.has(current.id)) duplicates.push({ id: current.id, pages: [rules.get(current.id).page, current.page] });
    else rules.set(current.id, { text, page: current.page, parentId: current.id.includes('.') ? current.id.slice(0, current.id.lastIndexOf('.')) : null });
  };
  for (const page of pages) for (const line of page.lines) {
    if (/^(?:Last Updated|최종 업데이트|Riftbound .* Rules|리프트바운드 .* 규칙|페이지\s*\d+)/iu.test(line.text) || /^\d{1,3}$/u.test(line.text)) continue;
    const match = line.text.match(label);
    if (match && Math.abs(line.x - column) <= 5) {
      finish();
      current = { id: match[1].toLowerCase(), page: page.page, lines: match[2] ? [match[2]] : [] };
    } else if (current) current.lines.push(line.text);
  }
  finish();
  if (duplicates.length) throw new Error(`Duplicate definitions require review: ${JSON.stringify(duplicates.slice(0, 15))}`);
  return { rules, parserVersion: PARSER_VERSION, labelColumn: column, pages: pages.length };
}
