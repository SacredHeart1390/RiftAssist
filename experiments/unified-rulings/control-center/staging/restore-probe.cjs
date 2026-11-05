'use strict';
// A fresh process verifies only its owned staging backup. Never restores over any source DB.
try {console.log(JSON.stringify(require('./vault.cjs').restoreProbe(process.argv[2],process.argv[3])));}
catch {process.stderr.write('staging-backup-integrity\n');process.exitCode=1;}
