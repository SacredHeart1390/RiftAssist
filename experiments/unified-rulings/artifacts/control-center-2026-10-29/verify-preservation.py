"""Read-only comparisons; never open operational records/keys or print DB contents."""
from pathlib import Path
import hashlib
import json
import subprocess

ROOT = Path(__file__).resolve().parents[4]
HERE = Path(__file__).resolve().parent

def git(*args):
    return subprocess.check_output(['git', *args], cwd=ROOT)

baseline = json.loads((HERE / 'baseline.json').read_text())
prefix = 'experiments/unified-rulings/releases/v0.1.7/'
main = git('rev-parse', 'origin/main').decode().strip()
paths = [p.decode() for p in git('ls-tree', '-r', '--name-only', '-z', main, '--', prefix).split(b'\0') if p]
assert len(paths) == 65
assert all((ROOT / p).read_bytes() == git('show', f'{main}:{p}') for p in paths)
assert set(p.decode() for p in git('ls-files', '-z', '--', prefix).split(b'\0') if p) == set(paths)
assert not git('ls-files', '--others', '--exclude-standard', '--', prefix).strip()
for name, expected in baseline['preservedHashes'].items():
    assert hashlib.sha256((ROOT / 'experiments/unified-rulings' / name).read_bytes()).hexdigest() == expected
release = ROOT / 'experiments/unified-rulings/releases/v0.2.0'
manifest = json.loads((release / 'app-release.json').read_text())
assert manifest['ready'] is False
for name, expected in manifest['hashes'].items():
    assert hashlib.sha256((release / name).read_bytes()).hexdigest() == expected
assert git('branch', '--show-current').decode().strip() == 'feature/riot-api-v0.2'
result = {
    'mainSha': main, 'v017ComparedFiles': len(paths), 'v017ChangedFiles': 0,
    'sharedPublicDataAndCacheHashesUnchanged': len(baseline['preservedHashes']),
    'v020VerifiedSourceHashes': len(manifest['hashes']), 'ready': False,
    'operationalRecordsOrKeysOpened': False,
    'preExistingAgentsChangePreservedOutsideCommit': bool(git('diff', '--', 'AGENTS.md').strip())
}
(HERE / 'preservation.json').write_text(json.dumps(result, indent=2) + '\n')
print(json.dumps(result))
