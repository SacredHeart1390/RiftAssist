// Legacy command now queues the file for validated, restart-free publication.
import paths from '../src/paths.js';
import runner from '../collectors/card-sync-v1/runner.js';
const input = process.argv[2];
try {
  if (!input || process.argv.length !== 3) throw Error('Usage: node scripts/import-riftnaru.mjs <local-export.json>');
  console.log(JSON.stringify(await runner.enqueue(paths.DATA_ROOT, input)));
} catch (error) { console.error(`Import not queued: ${error.message}`); process.exitCode = 1; }
