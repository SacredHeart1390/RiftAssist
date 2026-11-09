"""PROPOSED: fixed source-layout identities and autostart command metadata only.
No contents of extra files, scripts, node_modules, DBs, keys or environment files.
"""
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import time

ROOT = Path('/home/azureuser/RiftAssist/experiments/unified-rulings/releases/v0.1.7')
KNOWN = frozenset(('app-release.json', 'manager-ui/index.html', 'manager-ui/manager.css', 'manager-ui/manager.js', 'package.json', 'public/app-r2.js', 'public/app-ui2.js', 'public/app-ui3.js', 'public/app-ui4.js', 'public/app-ui5.js', 'public/app.js', 'public/card-composer-r2.js', 'public/card-composer-ui2.js', 'public/card-composer-ui3.js', 'public/card-composer.js', 'public/evidence-view.js', 'public/icon.svg', 'public/index.html', 'public/manifest.webmanifest', 'public/reports-ui3.js', 'public/reports.css', 'public/reports.js', 'public/service-worker.js', 'public/styles-r2.css', 'public/styles-ui2.css', 'public/styles-ui3.css', 'public/styles-ui4.css', 'public/styles-ui5.css', 'public/styles.css', 'scripts/card-import-ui.mjs', 'scripts/check-content-sync.cjs', 'scripts/check-home.cjs', 'scripts/content-sync.js', 'scripts/import-riftnaru.mjs', 'scripts/knowledge.js', 'scripts/open-manager.ps1', 'scripts/rebuild-local-rules.mjs', 'scripts/source-monitor.js', 'scripts/sync-rules.mjs', 'scripts/verify-release.cjs', 'src/access-control.js', 'src/answer-policy.js', 'src/answer-quality.js', 'src/app-host.js', 'src/cards.js', 'src/cloudflare-quick.js', 'src/content-sync.js', 'src/html-content.js', 'src/judge-index.js', 'src/knowledge-admin.js', 'src/knowledge-provider.js', 'src/knowledge-releases.js', 'src/manager.js', 'src/operations-store.js', 'src/paths.js', 'src/pdf-rules.mjs', 'src/retrieval.js', 'src/server.js', 'src/source-discovery.js', 'src/source-http.js', 'src/source-translations.js', 'src/sync-judge.js', 'src/sync-official.js', 'src/sync-store.js', 'src/terminology-ko.js'))
SAFE_NAMES = frozenset(('node_modules', 'package-lock.json', 'npm-shrinkwrap.json', 'ecosystem.config.js', 'ecosystem.config.cjs', '.npmrc', '.env'))
SCRIPT_NAMES = frozenset(('riftassist-autostart.sh', 'riftassist-autostart.py', 'riftassist-start.sh'))
PROTOCOL = 'riftassist-launch-details-1'


def identity(name, parent, info):
    suffix = Path(name).suffix.lower()
    return {'parent': parent or 'release-root', 'name': name if name in SAFE_NAMES else 'redacted',
            'extension': suffix if suffix in ('.json', '.js', '.cjs', '.mjs', '.sh', '.py', '.ps1') else None,
            'kind': 'directory' if stat.S_ISDIR(info.st_mode) else 'file' if stat.S_ISREG(info.st_mode) else 'link' if stat.S_ISLNK(info.st_mode) else 'special',
            'mode': oct(stat.S_IMODE(info.st_mode)), 'uid': info.st_uid, 'gid': info.st_gid,
            'links': info.st_nlink, 'groupOrWorldWritable': bool(info.st_mode & 0o022),
            'contentRead': False, 'acceptedAsCode': False}


def layout():
    # Only the five baseline directories. Never enters node_modules or other extras.
    for p in (ROOT, *ROOT.parents):
        if p.is_symlink():
            return {'complete': False, 'reason': 'root-link', 'extras': []}
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_NONBLOCK
    root = os.open(ROOT, flags)
    extras, seen, count, started = [], 0, 0, time.monotonic()
    parents = ('', 'manager-ui', 'public', 'scripts', 'src')
    try:
        for parent in parents:
            fd = os.open(parent, flags, dir_fd=root) if parent else root
            try:
                before = os.fstat(fd)
                with os.scandir(fd) as stream:
                    for e in stream:
                        count += 1
                        if count > 512 or time.monotonic() - started > 5:
                            raise ValueError('budget')
                        n = parent + '/' + e.name if parent else e.name
                        s = e.stat(follow_symlinks=False)
                        if n in KNOWN:
                            if not stat.S_ISREG(s.st_mode) or s.st_nlink != 1:
                                raise ValueError('known-path-unsafe')
                            seen += 1
                        elif not parent and e.name in parents[1:] and stat.S_ISDIR(s.st_mode):
                            continue
                        else:
                            if len(extras) >= 4:
                                raise ValueError('extra-count-changed')
                            extras.append(identity(e.name, parent, s))
                after = os.fstat(fd)
                if (before.st_dev, before.st_ino, before.st_mtime_ns) != (after.st_dev, after.st_ino, after.st_mtime_ns):
                    raise ValueError('layout-changed')
            finally:
                if fd != root:
                    os.close(fd)
    finally:
        os.close(root)
    return {'complete': seen == 65, 'knownPathsObserved': seen, 'hashesRechecked': False,
            'extras': extras, 'extraDirectoriesTraversed': False, 'unknownNamesEmitted': False}


def command_hints(raw):
    paths = sorted(set(re.findall(r'/[A-Za-z0-9_./-]+\.(?:js|cjs|mjs|sh|py)(?=\s|;|}|$)', raw)))
    references = []
    for p in paths[:8]:
        relative = p[len(str(ROOT)) + 1:] if p.startswith(str(ROOT) + '/') else None
        references.append({'baselinePath': relative if relative in KNOWN else None,
                           'standardScriptName': Path(p).name if Path(p).name in SCRIPT_NAMES else None,
                           'otherIdentityRedacted': relative not in KNOWN and Path(p).name not in SCRIPT_NAMES,
                           'contentsRead': False})
    hints = {'delay': r'\bsleep\b', 'managerLogin': r'/api/login\b', 'managerAppStart': r'/api/start\b',
             'managerAppStop': r'/api/stop\b', 'systemdControl': r'\bsystemctl\b',
             'loop': r'\b(?:while|until|for)\b', 'background': r'(?<!&)&(?!&)',
             'fileWriteWords': r'\b(?:chmod|chown|rm|mv|cp|tee|touch|install)\b',
             'readsManagerKey': r'\bmanager\.key\b'}
    positions = [(m.start(), label) for label, pattern in hints.items() if (m := re.search(pattern, raw))]
    return {'metadataPresent': bool(raw), 'lexicalHintsOnly': True,
            'hints': [label for _, label in sorted(positions)],
            'loopback3100Mentioned': bool(re.search(r'(?:127\.0\.0\.1|localhost):3100\b', raw)),
            'referencedScripts': references, 'referencesTruncated': len(paths) > 8,
            'rawArgumentsEmitted': False, 'behaviorVerified': False}


def helper():
    try:
        r = subprocess.run(['/usr/bin/systemctl', 'show', 'riftassist-autostart.service', '--no-pager',
                            '--property=ExecStartPre,ExecStart,ExecStartPost,ExecStop,ExecStopPost'],
                           stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                           timeout=5, check=False, env={'PATH': '/usr/bin:/bin', 'LC_ALL': 'C', 'SYSTEMD_PAGER': 'cat'})
        if r.returncode or len(r.stdout) > 32768:
            return {'available': False}
        fields = dict(line.split('=', 1) for line in r.stdout.decode('utf-8', errors='replace').splitlines() if '=' in line)
        return {'available': True, 'commands': {k: command_hints(fields.get(k, '')) for k in
                ('ExecStartPre', 'ExecStart', 'ExecStartPost', 'ExecStop', 'ExecStopPost')}, 'environmentRequested': False}
    except (OSError, subprocess.TimeoutExpired):
        return {'available': False}


def inspect():
    try:
        result = layout()
    except (OSError, ValueError):
        result = {'complete': False, 'reason': 'layout-unavailable-or-changed', 'extras': []}
    return {'protocol': PROTOCOL, 'readOnly': True, 'layout': result, 'autostart': helper(),
            'extraFileContentsRead': False, 'referencedScriptContentsRead': False, 'privateFilesOpened': 0,
            'dependencyContentsRead': False, 'sourceHashesBypassed': False, 'authorizedToDeploy': False}


if __name__ == '__main__':
    try:
        print(json.dumps(inspect(), ensure_ascii=True, separators=(',', ':')))
    except Exception:
        print(json.dumps({'protocol': PROTOCOL, 'readOnly': True, 'error': 'inspection-unavailable', 'authorizedToDeploy': False}))
