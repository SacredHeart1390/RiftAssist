// Private child-process pipes only. No HTTP listener, public route, or existing admin key.
const fs = require('node:fs');
const { once } = require('node:events');
const { DATA_ROOT } = require('../src/paths');
const { assertEnvironment } = require('../src/environment');
const { createReviewControl } = require('../src/card-review-control');
async function main() {
  const stdinBootstrap = process.argv.length === 3 && process.argv[2] === '--bootstrap-stdin';
  if ((!stdinBootstrap && process.argv.length !== 2) || assertEnvironment(DATA_ROOT) !== 'development') throw new Error();
  process.stdin.setEncoding('utf8');
  const input = process.stdin[Symbol.asyncIterator]();
  let bootstrap = '';
  let buffer = '';
  if (stdinBootstrap) {
    while (!bootstrap.includes('\n')) {
      const next = await input.next(); if (next.done) throw new Error();
      bootstrap += next.value;
      const end = bootstrap.indexOf('\n');
      if (Buffer.byteLength(end < 0 ? bootstrap : bootstrap.slice(0, end)) > 32768) throw new Error();
    }
    const end = bootstrap.indexOf('\n'); buffer = bootstrap.slice(end + 1); bootstrap = bootstrap.slice(0, end);
  } else {
    for await (const chunk of fs.createReadStream(null, { fd: 3, encoding: 'utf8', autoClose: false })) {
      bootstrap += chunk; if (Buffer.byteLength(bootstrap) > 32768) throw new Error();
    }
  }
  const control = await createReviewControl({ root: DATA_ROOT, authentication: JSON.parse(bootstrap) }); bootstrap = '';
  let failures = 0;
  while (true) {
    if (Buffer.byteLength(buffer) > 1048576) throw new Error();
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1); let request;
      try { request = JSON.parse(line); } catch { request = null; }
      const response = await control.dispatch(request);
      if (!process.stdout.write(JSON.stringify(response) + '\n')) await once(process.stdout, 'drain');
      if (!response.ok && ++failures >= 20) return;
    }
    const next = await input.next(); if (next.done) break; buffer += next.value;
  }
  if (buffer.trim()) throw new Error();
}
main().catch(() => { process.stderr.write('Private card review control stopped. Inspect the isolated audit journal and pipe configuration.\n'); process.exitCode = 1; });
