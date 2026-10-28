// Keep the existing command, now backed by the persistent translation candidate engine.
require('./preview-card-translations.cjs').preview()
  .then(result => console.log(JSON.stringify(result)))
  .catch(() => { console.error('Mock import preview stopped; no active pointer was written.'); process.exitCode = 1; });
