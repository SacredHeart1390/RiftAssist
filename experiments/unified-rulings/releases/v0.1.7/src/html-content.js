const path = require('node:path');
const { DATA_ROOT } = require('./paths');
const { parse, parseFragment } = require(path.join(DATA_ROOT, 'tools/ingestion/node_modules/parse5'));
const attr = (node, name) => node?.attrs?.find(a => a.name === name)?.value || '';
const all = (node, predicate) => {
  const found = [];
  function walk(n) { if (predicate(n)) found.push(n); for (const child of n.childNodes || []) walk(child); }
  walk(node); return found;
};
function text(node) {
  if (node.nodeName === '#text') return node.value;
  if (['script', 'style', 'svg', 'noscript'].includes(node.tagName)) return '';
  const content = (node.childNodes || []).map(text).join('');
  return /^(p|li|div|section|article|h[1-6]|br|tr)$/u.test(node.tagName || '') ? `\n${content}\n` : content;
}
const plain = node => text(node).replace(/[ \t\r]+/gu, ' ').replace(/ *\n */gu, '\n').replace(/\n{3,}/gu, '\n\n').trim();
function ancestor(node, predicate) { for (let n = node; n; n = n.parentNode) if (predicate(n)) return n; return null; }
function pageData(html) {
  const tree = parse(html);
  const script = all(tree, n => n.tagName === 'script' && attr(n, 'id') === '__NEXT_DATA__')[0];
  if (!script) throw new Error('Official structured page data is missing.');
  const data = JSON.parse((script.childNodes || []).map(n => n.value || '').join(''));
  const page = data.props?.pageProps?.page;
  if (!page?.blades) throw new Error('Official page layout changed.');
  const bodies = [];
  function walk(v) {
    if (!v || typeof v !== 'object') return;
    if (v.richText?.body) bodies.push(v.richText.body);
    for (const child of Object.values(v)) if (child && typeof child === 'object') {
      if (Array.isArray(child)) child.forEach(walk); else walk(child);
    }
  }
  walk(page.blades);
  // Some pages use an array at the root.
  if (!bodies.length) page.blades.forEach(walk);
  return { page, bodies: [...new Set(bodies)], tree };
}
function judgeCase(html, id, url) {
  const tree = parse(html);
  const heading = all(tree, n => n.tagName === 'h1')[0];
  const headingCard = heading && ancestor(heading, n => attr(n, 'data-slot') === 'card');
  const title = all(tree, n => attr(n, 'data-slot') === 'card-title' && plain(n) === 'Answer')[0];
  const answerCard = title && ancestor(title, n => attr(n, 'data-slot') === 'card');
  const markdown = answerCard && all(answerCard, n => attr(n, 'class').split(/\s+/u).includes('markdown-body'))[0];
  const question = heading && plain(heading), answer = markdown && plain(markdown);
  if (!headingCard || !question || !answer || question.length > 30000 || answer.length > 200000) throw new Error('Q&A body missing or layout changed.');
  const header = plain(headingCard);
  if (!new RegExp(`FAQ\\s*#\\s*${id}(?:\\D|$)`, 'u').test(header)) throw new Error('Q&A identifier mismatch.');
  const labels = all(headingCard, n => n.tagName === 'span').map(n => plain(n).trim().toLowerCase());
  const status = ['deprecated', 'disputed', 'under review', 'unverified', 'verified'].find(value => labels.includes(value)) || 'unknown';
  const references = all(answerCard, n => n.tagName === 'a').map(n => ({ text: plain(n), href: attr(n, 'href') }))
    .filter(r => r.href.startsWith('/') || r.href.startsWith('https://')).slice(0, 200);
  return { id: String(id), faqId: String(id), question, answer, status, rulesVersion: header.match(/Rules\s*v\s*([\d.]+)/iu)?.[1] || '',
    ruleReferences: references, url, sourceAvailability: 'available', sourceKind: 'community', bodyComplete: true };
}
function officialLinks(html, url) {
  const { page, bodies } = pageData(html);
  const links = [];
  for (const body of bodies) {
    const fragment = parseFragment(body);
    let heading = '';
    function walk(node) {
      if (/^h[1-6]$/u.test(node.tagName || '')) heading = plain(node);
      if (node.tagName === 'a') {
        const address = new URL(attr(node, 'href'), url);
        const label = plain(node) || heading;
        if (address.protocol === 'https:') links.push({ url: address.href.split('#')[0], title: label, heading,
          context: plain(node.parentNode).slice(0, 1500) });
      }
      for (const child of node.childNodes || []) walk(child);
    }
    walk(fragment);
  }
  return { title: page.title, links: [...new Map(links.map(l => [l.url, l])).values()], page };
}
module.exports = { parse, parseFragment, attr, all, plain, pageData, judgeCase, officialLinks };
