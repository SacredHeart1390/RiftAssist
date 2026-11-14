'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { decide } = require('./decision.cjs');
const ask = (cardId, region, format, date, more = {}) => decide({ cardId, region, format, date, ...more });

test('global November additions activate only on effective date', () => {
  assert.equal(ask('riven-broken-blade','global','standard','2026-11-22').ban,'not-banned');
  assert.equal(ask('riven-broken-blade','global','standard','2026-11-23').ban,'banned');
  assert.equal(ask('riven-broken-blade','global','2v2','2026-11-23').ban,'banned');
});
test('Korea unbans old cards and does not apply new global bans in documented Origins window', () => {
  for (const card of ['called-shot','riven-broken-blade']) {
    assert.equal(ask(card,'kr','standard','2026-11-22').ban,'unknown');
    assert.equal(ask(card,'kr','standard','2026-11-23').ban,'not-banned');
    assert.equal(ask(card,'kr','standard','2026-12-06').ban,'not-banned');
    assert.equal(ask(card,'kr','standard','2026-12-07').ban,'unknown');
  }
});
test('2v2 only ban and availability remain distinct', () => {
  assert.equal(ask('master-yi-wuju-bladesman','global','standard','2026-11-14').ban,'not-banned');
  const result = ask('master-yi-wuju-bladesman','global','2v2','2026-11-14');
  assert.equal(result.ban,'banned'); assert.equal(result.availability,'unknown');
});
test('unknown inputs and event overrides cannot result in a definitive ruling', () => {
  assert.equal(ask('not-known','global','standard','2026-11-14').ban,'unknown');
  assert.equal(ask('called-shot','global','sealed','2026-11-14').ban,'unknown');
  assert.equal(ask('master-yi-wuju-bladesman','kr','2v2','2026-11-23').ban,'unknown');
  assert.equal(ask('called-shot','global','standard','2026-02-30').ban,'unknown');
  assert.equal(ask('called-shot','global','standard','2026-11-24').ban,'unknown');
  assert.equal(ask('called-shot','global','standard','2026-11-14',{eventRules:true}).ban,'unknown');
  assert.equal(ask('called-shot','other','standard','2026-11-14').ban,'unknown');
});
