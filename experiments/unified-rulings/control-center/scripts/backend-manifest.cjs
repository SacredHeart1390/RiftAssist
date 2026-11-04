const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const project = path.resolve(__dirname, '..'), release = path.resolve(project, '../releases/v0.2.0');
const names = ['app-release.json', 'scripts/prepare-development.cjs', 'scripts/prepare-control-center-demo.cjs', 'scripts/card-review-control.cjs', 'scripts/control-center-operations.cjs'];
function walk(relative) {
  for (const item of fs.readdirSync(path.join(release, relative), { withFileTypes: true })) {
    const name = `${relative}/${item.name}`;
    if (item.isSymbolicLink()) throw new Error('Backend links are not allowed.');
    if (item.isDirectory()) walk(name); else names.push(name);
  }
}
for (const folder of ['src', 'public', 'manager-ui', 'dev-fixtures']) walk(folder);
const files = Object.fromEntries(names.sort().map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(path.join(release, name))).digest('hex')]));
const data = JSON.stringify({ schemaVersion: 1, releaseFamily: 'v0.2.0', scope: 'mock-local-control-center', files }, null, 2) + '\n';
const target = path.join(project, 'backend-manifest.json');
if (process.argv[2] === '--write') fs.writeFileSync(target, data);
else if (fs.readFileSync(target, 'utf8') !== data) throw new Error('Backend manifest differs from the source payload.');
console.log(JSON.stringify({ backendFilesVerified: names.length }));
