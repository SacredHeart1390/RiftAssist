// Loaded only in the isolated test child with --require. No real fetch fallback exists.
const fs = require('node:fs');
const plans = JSON.parse(fs.readFileSync(process.env.RIFTASSI_TEST_PLAN, 'utf8'));
globalThis.__riftassistTestTransport = true;
let calls = 0;
const emit = value => { if (process.connected) process.send(value); };
globalThis.fetch = async (url, options = {}) => {
  const target = String(url);
  if (target === 'https://app.riftjudge.com/api/search') {
    emit({ type: 'mock-riftjudge', body: JSON.parse(options.body) });
    return Response.json({ results: [] });
  }
  if (target !== 'https://api.openai.com/v1/responses') {
    emit({ type: 'unexpected-network', url: target });
    throw new Error('External networking is disabled in regression tests.');
  }
  const number = calls++;
  const plan = plans[number];
  emit({ type: 'mock-openai', number, body: JSON.parse(options.body) });
  if (!plan) {
    emit({ type: 'unexpected-network', url: 'unplanned OpenAI attempt' });
    return Response.json({ error: { code: 'mock_queue_exhausted' } }, { status: 500 });
  }
  if (plan.delayMs) await new Promise(resolve => setTimeout(resolve, Math.min(3000, plan.delayMs)));
  if (plan.error) return Response.json({ error: plan.error }, { status: plan.status || 429 });
  return Response.json({ id: `mock-response-${number + 1}`, status: 'completed',
    output: [{ type: 'message', content: [{ type: 'output_text', text: JSON.stringify(plan.ruling) }] }],
    usage: plan.usage || { input_tokens: 100, output_tokens: 40, input_tokens_details: { cached_tokens: 10 } },
  });
};
