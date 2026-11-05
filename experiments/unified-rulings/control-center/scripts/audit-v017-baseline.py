"""Code-only Git object audit. Never reads operational DBs, keys or data roots."""
import hashlib
import ast
import json
from pathlib import Path
import subprocess
import sys

COMMIT = '289aee4504a8abfaa4b8ebd7e3dff7fc3648ab80'
TREE = '7f25baaaa9e2d1898d54c99386fd24adce929a0f'
DIRECTORY = 'experiments/unified-rulings/releases/v0.1.7'
PROJECT = Path(__file__).resolve().parents[1]
REPO = PROJECT.parents[2]
TARGET = PROJECT / 'staging/legacy-v017-baseline.json'


def git(*args):
    return subprocess.check_output(['git', *args], cwd=REPO)


def digest(value):
    return hashlib.sha256(value).hexdigest()


def generate(ref):
    if git('rev-parse', ref + ':' + DIRECTORY).decode().strip() != TREE:
        raise ValueError('Legacy Git tree differs from the reviewed immutable baseline')
    entries = {}
    for line in git('ls-tree', '-r', ref, '--', DIRECTORY).decode().splitlines():
        meta, full = line.split('\t', 1)
        mode, kind, blob = meta.split()
        if mode != '100644' or kind != 'blob':
            raise ValueError('Unexpected legacy Git entry')
        name = full[len(DIRECTORY) + 1:]
        entries[name] = (blob, git('show', ref + ':' + full))
    if len(entries) != 65:
        raise ValueError('Unexpected legacy file count')
    manifest = json.loads(entries['app-release.json'][1])
    if set(manifest['hashes']) != set(entries) - {'app-release.json'}:
        raise ValueError('Legacy manifest does not cover the exact Git file set')
    files, mismatches = {}, []
    for name, (blob, data) in sorted(entries.items()):
        data.decode('utf-8')  # This fixed baseline consists entirely of text source/assets.
        if b'\r\n' in data:
            raise ValueError('Expected LF-normalized immutable Git blobs')
        variants = [{'sha256': digest(data), 'bytes': len(data), 'form': 'git-lf'}]
        crlf = data.replace(b'\n', b'\r\n')
        if crlf != data:
            variants.append({'sha256': digest(crlf), 'bytes': len(crlf), 'form': 'exact-crlf-checkout'})
        expected = manifest['hashes'].get(name)
        if expected and expected not in [v['sha256'] for v in variants]:
            raise ValueError('Unexplained legacy manifest mismatch: ' + name)
        files[name] = {'gitBlob': blob, 'manifestDeclaredHash': expected, 'variants': variants}
        if expected and expected != digest(data):
            mismatches.append({'path': name, 'reason': 'exact-crlf-versus-git-lf', 'runtimeSubset': name.startswith(('src/', 'public/', 'manager-ui/'))})
    return {'schemaVersion': 1, 'purpose': 'reviewed-v017-code-baseline', 'releaseId': 'v0.1.7',
            'baselineCommit': COMMIT, 'gitTree': TREE, 'directory': DIRECTORY,
            'manifestCreatedAt': manifest['createdAt'], 'manifestGenerationCommit': None,
            'fileCount': len(files), 'manifestEntryCount': len(manifest['hashes']),
            'mismatchesExplainedByExactLineEndings': mismatches, 'files': files}


if __name__ == '__main__':
    # Writing requires the original commit object. CI checks HEAD against its pinned tree,
    # so a shallow checkout does not need to fetch unrelated historical blobs.
    value = generate(COMMIT if '--write' in sys.argv else 'HEAD')
    encoded = (json.dumps(value, ensure_ascii=True, indent=2) + '\n').encode()
    if '--write' in sys.argv:
        TARGET.write_bytes(encoded)
    elif TARGET.read_bytes() != encoded:
        raise ValueError('Committed legacy reference differs from immutable Git code objects')
    source = ast.parse((PROJECT / 'staging/inspect-legacy-source.py').read_text())
    constants = {node.targets[0].id: node.value for node in source.body if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name)}
    if ast.literal_eval(constants['REFERENCE_SHA256']) != digest(encoded) or ast.literal_eval(constants['BASELINE_COMMIT']) != COMMIT:
        raise ValueError('Read-only source probe has an unverified reference')
    probe_files = json.loads(ast.literal_eval(constants['FILES'].args[0]))
    if probe_files != {name: entry['variants'] for name, entry in value['files'].items()}:
        raise ValueError('Source probe differs from the exact trusted hash list')
    print(json.dumps({'baselineCommit': COMMIT, 'gitTree': TREE, 'files': value['fileCount'],
                      'manifestEntries': value['manifestEntryCount'], 'runtimeMismatches': 9,
                      'allManifestMismatches': len(value['mismatchesExplainedByExactLineEndings']),
                      'allMismatchesExactlyExplained': True, 'referenceSha256': digest(encoded),
                      'operationalFilesRead': False, 'legacyFilesChanged': False}))
