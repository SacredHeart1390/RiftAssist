const test = require('node:test');
const assert = require('node:assert/strict');
const { isolatedServer } = require('./helpers/isolated-server.cjs');

const usage = { input_tokens: 500, output_tokens: 4096, output_tokens_details: { reasoning_tokens: 4096 } };
const scenarios = [
  ['expired authentication', {status:401,error:{code:'expired_secret_key',message:'SENSITIVE_PROVIDER_MESSAGE'}}, 'model_authentication', 'expired_secret_key', 'provider-http'],
  ['project quota', {status:429,error:{code:'insufficient_quota'}}, 'model_quota', 'insufficient_quota', 'provider-http'],
  ['provider service error', {status:503,error:{}}, 'http_503', 'http_503', 'provider-http'],
  ['transport timeout', {timeout:true}, 'model_timeout', 'model_timeout', 'transport'],
  ['output budget', {response:{status:'incomplete',incomplete_details:{reason:'max_output_tokens'},usage}}, 'incomplete_output', 'incomplete_output', 'model-output'],
  ['response JSON', {response:{status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{'}]}],usage}}, 'invalid_output', 'invalid_output', 'model-output'],
  ['response shape', {response:{status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{}'}]}],usage}}, 'invalid_output', 'invalid_output', 'model-output'],
];

for (const [label, plan, publicCode, storedCode, stage] of scenarios) {
  test(`${label} preserves evidence and records a single settled attempt`, async t => {
    const server = await isolatedServer(t, [plan]);
    const result = await server.ask('같은 턴에 같은 전장에서 다시 점수를 얻을 수 있나요?');
    assert.equal(result.status, 200);
    assert.equal(result.body.status, 'model-error');
    assert.equal(result.body.ai.used, false);
    assert.equal(result.body.ai.error, publicCode);
    assert.ok(result.body.evidence.length);
    assert.equal(server.externalCalls.length, 1);
    const trace = await server.trace(result.body.requestId);
    const attempt = trace.generationAttempts[0];
    assert.equal(trace.modelError, storedCode);
    assert.equal(attempt.diagnostic.stage, stage);
    if (plan.status) {
      assert.equal(attempt.diagnostic.httpStatus, plan.status);
      assert.equal(attempt.diagnostic.providerRequestId, 'req_synthetic');
    }
    assert.doesNotMatch(JSON.stringify(result.body), /req_synthetic|SENSITIVE_PROVIDER_MESSAGE|expired_secret_key/);
    assert.doesNotMatch(JSON.stringify(trace), /SENSITIVE_PROVIDER_MESSAGE/);
    const [call] = server.calls();
    assert.equal(call.error, storedCode);
    assert.equal(call.output_tokens, plan.response ? usage.output_tokens : null);
    assert.ok(call.finished);
  });
}
