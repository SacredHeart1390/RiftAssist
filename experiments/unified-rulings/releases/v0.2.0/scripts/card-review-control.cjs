// Private child-process pipes only. No HTTP listener, public route, or existing admin key.
const fs = require('node:fs');
const { once } = require('node:events');
const { DATA_ROOT } = require('../src/paths');
const { assertEnvironment } = require('../src/environment');
const { createReviewControl } = require('../src/card-review-control');
async function main() {
  if (process.argv.length !== 2 || assertEnvironment(DATA_ROOT) !== 'development') throw new Error();
  let bootstrap = '';
  for await (const chunk of fs.createReadStream(null, { fd: 3, encoding: 'utf8', autoClose: false })) {
    bootstrap += chunk; if (Buffer.byteLength(bootstrap) > 32768) throw new Error();
  }
  const control = await createReviewControl({ root: DATA_ROOT, authentication: JSON.parse(bootstrap) }); bootstrap = '';
  process.stdin.setEncoding('utf8'); let buffer = '', failures = 0;
  for await (const chunk of process.stdin) {
    buffer += chunk; if (Buffer.byteLength(buffer) > 1048576) throw new Error();
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1); let request;
      try { request = JSON.parse(line); } catch { request = null; }
      const response = await control.dispatch(request);
      if (!process.stdout.write(JSON.stringify(response) + '\n')) await once(process.stdout, 'drain');
      if (!response.ok && ++failures >= 20) return;
    }
  }
}
main().catch(() => { process.stderr.write('Private card review control stopped. Inspect the isolated audit journal and pipe configuration.\n'); process.exitCode = 1; });
