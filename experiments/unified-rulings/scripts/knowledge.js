const { DATA_ROOT } = require('../src/paths');
const { knowledgeStatus } = require('../src/knowledge-admin');
const { activateRelease } = require('../src/knowledge-releases');
async function main() {
  const [command, releaseId, expectedId, reviewed] = process.argv.slice(2);
  if (command === 'status') return console.log(JSON.stringify(await knowledgeStatus(DATA_ROOT), null, 2));
  if (command === 'activate' && reviewed === '--reviewed') {
    console.log(JSON.stringify(await activateRelease(DATA_ROOT, releaseId, expectedId, { acknowledgeReview: true })));
    return;
  }
  throw new Error('Use status, or activate <releaseId> <expectedCurrentId> --reviewed after checking the candidate.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
