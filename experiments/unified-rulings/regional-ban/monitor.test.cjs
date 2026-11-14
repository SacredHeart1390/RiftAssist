'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { observe, URLS, INTERVAL } = require('./monitor.cjs');

test('official observations are six-hour gated, changed pages require review and failed fetches preserve history', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'regional-ban-monitor-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  let version = 'a', requests = [];
  const fetchPage = async url => { requests.push(url); return new Response(version.repeat(600), { headers: { 'content-type':'text/html; charset=utf-8' } }); };
  const start = Date.parse('2026-11-14T00:00:00Z');
  assert.equal((await observe({directory,fetchPage,now:start})).status, 'baseline-only');
  assert.deepEqual(requests, URLS); requests = [];
  assert.equal((await observe({directory,fetchPage,now:start+INTERVAL-1})).status, 'not-due');
  assert.equal(requests.length, 0);
  assert.equal((await observe({directory,fetchPage,now:start+INTERVAL})).status, 'unchanged');
  version = 'b';
  assert.equal((await observe({directory,fetchPage,now:start+INTERVAL*2})).status, 'review-required');
  assert.equal((await observe({directory,fetchPage,now:start+INTERVAL*3})).status, 'review-required');
  const before = await fs.readFile(path.join(directory,'official-observations.json'),'utf8');
  await assert.rejects(observe({directory,now:start+INTERVAL*4,fetchPage:async()=>new Response('blocked',{status:403})}));
  assert.equal(await fs.readFile(path.join(directory,'official-observations.json'),'utf8'),before);
});
