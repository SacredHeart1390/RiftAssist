const fs = require('node:fs');
const path = require('node:path');
const project = path.resolve(__dirname, '..');
const { stable } = require('../../releases/v0.3.0/src/card-translation-core');
const { signRequest } = require('../../releases/v0.3.0/src/card-review-auth');
// Published nonfunctional test key only; application sessions use fresh random keys.
const keyText = '0'.repeat(64);
const samples = [
  ['korean-and-quotes', { reason: '한글 "카드"와 역슬래시 \\ / <>&', list: ['승인', '거절', '보류'] }],
  ['emoji-and-combining', { reason: '카드 🙂 𐐀 é e\u0301', '가': '원문 보존', '🙂': '그대로' }],
  ['control-characters', { reason: '\b\f\n\r\t\u0000\u001f', separators: '\u2028\u2029' }],
  ['integer-property-order', JSON.parse('{"10":"ten","2":"two","00":"double","4294967295":"end","0":"zero","🙂":"emoji","가":"ko"}')],
  ['safe-integers', { expectedRevision: 12, limit: 20, negative: -12, maximum: 9007199254740991, zero: -0 }],
  ['arrays-null-booleans', { rows: [null, false, true, { z: '끝', a: '처음' }], empty: {}, values: [] }],
];
const vectors = samples.map(([name, params]) => {
  const payload = { protocol: 'riftassist-control-1', sessionId: '11111111-1111-4111-8111-111111111111', credentialId: 'vector',
    requestId: '22222222-2222-4222-8222-222222222222', nonce: '33333333-3333-4333-8333-333333333333', issuedAt: 1793232000000, method: 'decide', params };
  const canonical = stable(payload);
  return { name, payload, canonical, canonicalUtf8Hex: Buffer.from(canonical).toString('hex'), hmacHex: signRequest(payload, keyText) };
});
const data = JSON.stringify({ schemaVersion: 1, keyText, note: 'Public synthetic vectors, never application credentials. HMAC uses the UTF-8 key text, not hex-decoded bytes.', vectors }, null, 2) + '\n';
const target = path.join(project, 'fixtures/protocol-vectors.json');
if (process.argv[2] === '--write') { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, data); }
else if (fs.readFileSync(target, 'utf8') !== data) throw new Error('Protocol vectors no longer match the Node reference signer.');
console.log(JSON.stringify({ nodeProtocolVectorsVerified: vectors.length }));
