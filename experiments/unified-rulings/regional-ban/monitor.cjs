'use strict';
// Prototype: observes approved official pages only. It never changes decision data.
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const { sources } = require('./events.json');
const URLS = Object.freeze(Object.values(sources));
const INTERVAL = 6 * 60 * 60 * 1000;

async function observe({ directory, fetchPage = fetch, now = Date.now() }) {
  if (!Number.isFinite(now)) throw Error('invalid-clock');
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const filename = path.join(directory, 'official-observations.json');
  let previous = { schemaVersion: 1, observations: [] };
  try { previous = JSON.parse(await fs.readFile(filename, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw Error('invalid-observation-history'); }
  if (previous.schemaVersion !== 1 || !Array.isArray(previous.observations)) throw Error('invalid-observation-history');
  const latest = previous.observations.at(-1);
  if (latest && (!Number.isFinite(Date.parse(latest.at)) || now < Date.parse(latest.at))) throw Error('invalid-clock');
  if (latest && now - Date.parse(latest.at) < INTERVAL) return { status: 'not-due' };
  const hashes = {};
  for (const url of URLS) {
    const response = await fetchPage(url, { redirect: 'error', signal: AbortSignal.timeout(15000) });
    if (!response.ok || !/^text\/html(?:;|$)/i.test(response.headers.get('content-type') || '')) throw Error('official-source-unavailable');
    const body = await response.text();
    if (Buffer.byteLength(body) > 4 * 1024 * 1024 || body.length < 500) throw Error('official-source-invalid');
    hashes[url] = crypto.createHash('sha256').update(body).digest('hex');
  }
  const status = !latest ? 'baseline-only' : URLS.some(url => latest.hashes?.[url] !== hashes[url]) ? 'review-required' : 'unchanged';
  const observation = { at: new Date(now).toISOString(), status, hashes };
  const next = JSON.stringify({ schemaVersion: 1, observations: [...previous.observations, observation] });
  const temp = path.join(directory, `.official-observations-${crypto.randomUUID()}.tmp`);
  try { await fs.writeFile(temp, next, { flag: 'wx', mode: 0o600 }); await fs.rename(temp, filename); }
  catch (error) { await fs.unlink(temp).catch(() => {}); throw error; }
  return { status, at: observation.at };
}
module.exports = { observe, URLS, INTERVAL };
