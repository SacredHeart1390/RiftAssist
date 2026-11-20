function identifier(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,120}$/.test(value) ? value : null;
}

function modelFailure(code, diagnostic, usage = null, publicCode = code) {
  return Object.assign(new Error(code), { code, publicCode, diagnostic, usage });
}

function providerFailure(response, payload, diagnostic) {
  const status = response.status;
  const code = identifier(payload?.error?.code) || `http_${status}`;
  const publicCode = status === 401 || status === 403 ? 'model_authentication'
    : code === 'insufficient_quota' ? 'model_quota'
    : status === 429 ? 'rate_limit_exceeded' : `http_${status}`;
  return modelFailure(code, { ...diagnostic, stage: 'provider-http' }, payload?.usage ?? null, publicCode);
}

function transportFailure(error) {
  const timeout = ['TimeoutError', 'AbortError'].includes(error.name) ||
    ['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_BODY_TIMEOUT'].includes(error.cause?.code);
  return modelFailure(timeout ? 'model_timeout' : 'model_transport', {
    stage: 'transport', networkCode: identifier(error.cause?.code),
  });
}

function matchesSchema(value, schema) {
  if (schema.type === 'string') return typeof value === 'string' && (!schema.enum || schema.enum.includes(value));
  if (schema.type === 'boolean') return typeof value === 'boolean';
  if (schema.type === 'array') return Array.isArray(value) && value.every(item => matchesSchema(item, schema.items));
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
    schema.required.every(key => Object.hasOwn(value, key)) &&
    Object.keys(value).every(key => Object.hasOwn(schema.properties, key) && matchesSchema(value[key], schema.properties[key])));
}

module.exports = { identifier, modelFailure, providerFailure, transportFailure, matchesSchema };
