"""PROPOSED, NOT APPROVED: metadata only. No content reads, hashes, links followed or writes."""
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import time

ROOT = Path('/home/azureuser/RiftAssist/experiments/unified-rulings/releases/v0.1.7')
KNOWN = frozenset(('app-release.json', 'manager-ui/index.html', 'manager-ui/manager.css', 'manager-ui/manager.js', 'package.json', 'public/app-r2.js', 'public/app-ui2.js', 'public/app-ui3.js', 'public/app-ui4.js', 'public/app-ui5.js', 'public/app.js', 'public/card-composer-r2.js', 'public/card-composer-ui2.js', 'public/card-composer-ui3.js', 'public/card-composer.js', 'public/evidence-view.js', 'public/icon.svg', 'public/index.html', 'public/manifest.webmanifest', 'public/reports-ui3.js', 'public/reports.css', 'public/reports.js', 'public/service-worker.js', 'public/styles-r2.css', 'public/styles-ui2.css', 'public/styles-ui3.css', 'public/styles-ui4.css', 'public/styles-ui5.css', 'public/styles.css', 'scripts/card-import-ui.mjs', 'scripts/check-content-sync.cjs', 'scripts/check-home.cjs', 'scripts/content-sync.js', 'scripts/import-riftnaru.mjs', 'scripts/knowledge.js', 'scripts/open-manager.ps1', 'scripts/rebuild-local-rules.mjs', 'scripts/source-monitor.js', 'scripts/sync-rules.mjs', 'scripts/verify-release.cjs', 'src/access-control.js', 'src/answer-policy.js', 'src/answer-quality.js', 'src/app-host.js', 'src/cards.js', 'src/cloudflare-quick.js', 'src/content-sync.js', 'src/html-content.js', 'src/judge-index.js', 'src/knowledge-admin.js', 'src/knowledge-provider.js', 'src/knowledge-releases.js', 'src/manager.js', 'src/operations-store.js', 'src/paths.js', 'src/pdf-rules.mjs', 'src/retrieval.js', 'src/server.js', 'src/source-discovery.js', 'src/source-http.js', 'src/source-translations.js', 'src/sync-judge.js', 'src/sync-official.js', 'src/sync-store.js', 'src/terminology-ko.js'))
LABELS = frozenset(('.git', '.gitignore', '.npmrc', '.DS_Store', 'Thumbs.db', 'desktop.ini',
                    '__pycache__', 'node_modules', 'logs', 'log', 'tmp', 'temp', 'cache',
                    'backups', 'backup', 'private', '.env', '.vscode', '.idea'))
UNITS = ('riftassist.service', 'riftassist-autostart.service', 'caddy.service')
PROPS = ('Id,LoadState,ActiveState,SubState,UnitFileState,MainPID,Job,FragmentPath,DropInPaths,User,Group,WorkingDirectory,'
         'Type,RemainAfterExit,Restart,RestartUSec,KillMode,ControlGroup,Requires,Wants,After,'
         'Before,PartOf,BindsTo,Conflicts,Triggers,TriggeredBy,ExecStartPre,ExecStart,ExecStartPost,'
         'ExecStop,ExecStopPost')


def category(name, parent, kind):
    if kind == 'link':
        return 'link-unreviewed'
    if parent == 'public':
        return 'public-exposure-risk'
    if name.lower().startswith('.env') or name == 'private' or re.search(r'\.(?:sqlite(?:-wal|-shm)?|db|key|pem|pfx|p12|dpapi)$', name, re.I):
        return 'sensitive-metadata-only'
    if name == 'node_modules':
        return 'dependency-execution-risk'
    if re.search(r'\.(?:js|cjs|mjs|sh|json|node|ps1)$', name, re.I):
        return 'execution-or-configuration-risk'
    if re.search(r'\.(?:bak|old|orig|zip|tar|gz)$', name, re.I):
        return 'archive-or-backup-candidate'
    if name in ('.DS_Store', 'Thumbs.db', 'desktop.ini', '__pycache__'):
        return 'generated-artifact-candidate'
    return 'unclassified'


def layout():
    deadline, salt = time.monotonic() + 5, os.urandom(32)
    directories = frozenset(n.rsplit('/', 1)[0] for n in KNOWN if '/' in n)
    rows, issues, known_seen, scanned = [], [], 0, 0
    for p in (ROOT, *ROOT.parents):
        if p.is_symlink():
            return {'complete': False, 'issues': ['root-link'], 'additionalPaths': []}
    flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_NONBLOCK
    root = os.open(ROOT, flags)
    try:
        for parent in ('', *sorted(directories)):
            if time.monotonic() > deadline:
                issues.append('deadline')
                break
            fd = root if not parent else os.open(parent, flags, dir_fd=root)
            try:
                before = os.fstat(fd)
                with os.scandir(fd) as stream:
                    for entry in stream:
                        scanned += 1
                        if scanned > 512 or time.monotonic() > deadline:
                            issues.append('entry-or-time-budget')
                            break
                        name = parent + '/' + entry.name if parent else entry.name
                        info = entry.stat(follow_symlinks=False)
                        if name in KNOWN:
                            known_seen += 1
                            if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
                                issues.append('known-path-unsafe')
                            continue
                        if not parent and entry.name in directories and stat.S_ISDIR(info.st_mode):
                            continue
                        kind = 'link' if stat.S_ISLNK(info.st_mode) else 'directory' if stat.S_ISDIR(info.st_mode) else 'file' if stat.S_ISREG(info.st_mode) else 'special'
                        if len(rows) >= 80:
                            issues.append('output-budget')
                            break
                        rows.append({'id': hashlib.sha256(salt + os.fsencode(name)).hexdigest()[:24],
                                     'parent': parent or 'release-root',
                                     'label': entry.name if entry.name in LABELS else 'redacted',
                                     'kind': kind, 'category': category(entry.name, parent, kind),
                                     'uid': info.st_uid, 'gid': info.st_gid,
                                     'groupOrWorldWritable': bool(info.st_mode & 0o022),
                                     'executable': kind == 'file' and bool(info.st_mode & 0o111),
                                     'sizeBucket': 'directory-or-special' if kind != 'file' else 'under-4KiB' if info.st_size <= 4096 else 'under-1MiB' if info.st_size <= 1048576 else 'over-1MiB',
                                     'contentRead': False, 'linkTargetRead': False, 'acceptedAsCode': False})
                after = os.fstat(fd)
                if (before.st_dev, before.st_ino, before.st_mtime_ns) != (after.st_dev, after.st_ino, after.st_mtime_ns):
                    issues.append('layout-changed')
            finally:
                if fd != root:
                    os.close(fd)
            if issues:
                break
    finally:
        os.close(root)
    return {'complete': not issues and known_seen == 65, 'knownPathsObserved': known_seen,
            'knownCodeHashesRechecked': False, 'additionalPaths': rows, 'issues': sorted(set(issues)),
            'unknownDirectoriesTraversed': False, 'unknownNamesEmitted': False,
            'pathIdsStableAcrossRuns': False, 'authorizedToDeploy': False}


def run(name):
    try:
        r = subprocess.run(['/usr/bin/systemctl', 'show', name, '--no-pager', '--property=' + PROPS],
                           stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                           timeout=5, check=False,
                           env={'PATH': '/usr/bin:/bin', 'LC_ALL': 'C', 'SYSTEMD_PAGER': 'cat'})
        return r.stdout.decode('utf-8', errors='replace') if r.returncode == 0 and len(r.stdout) <= 65536 else None
    except (OSError, subprocess.TimeoutExpired):
        return None


def shape(raw):
    raw = raw or ''
    binaries = frozenset(('/usr/bin/node', '/usr/bin/caddy', '/bin/bash', '/usr/bin/bash', '/bin/sh', '/usr/bin/curl', '/usr/bin/systemctl'))
    match = re.search(r'(?:^|[ {;])path=([^ ;}]+)', raw)
    scripts = re.findall(r'/[A-Za-z0-9_./-]+\.(?:js|cjs|sh)(?=\s|;|}|$)', raw)
    return {'executable': match.group(1) if match and match.group(1) in binaries else None,
            'inlineShell': bool(re.search(r'(?:\s|^)-(?:lc|c|cl)\s', raw)),
            'mentionsLogin': '/api/login' in raw, 'mentionsAppStart': '/api/start' in raw,
            'mentionsAppStop': '/api/stop' in raw, 'mentionsServiceControl': 'systemctl' in raw,
            'mentionsKeyFile': 'manager.key' in raw, 'mentionsDelay': bool(re.search(r'\bsleep\b', raw)),
            'mentionsLoop': bool(re.search(r'\b(?:while|until|for)\b', raw)),
            'mentionsBackground': bool(re.search(r'(?<!&)&(?!&)', raw)),
            'referencedScripts': len(set(scripts)), 'referencedScriptContentsRead': False,
            'rawArgumentsEmitted': False, 'behaviorVerified': False}


def services():
    rows = []
    for name in UNITS:
        raw = run(name)
        if raw is None:
            rows.append({'unit': name, 'available': False})
            continue
        fields = dict(s.split('=', 1) for s in raw.splitlines() if '=' in s)
        row = {'unit': name, 'available': True}
        states = {
            'LoadState': {'loaded', 'not-found', 'masked', 'error', 'bad-setting', 'merged', 'stub'},
            'ActiveState': {'active', 'reloading', 'inactive', 'failed', 'activating', 'deactivating', 'refreshing', 'maintenance'},
            'SubState': {'running', 'dead', 'exited', 'failed', 'auto-restart', 'start-pre', 'start', 'start-post', 'stop', 'stop-sigterm', 'stop-sigkill', 'stop-post', 'reload', 'condition', 'cleaning'},
            'UnitFileState': {'enabled', 'enabled-runtime', 'linked', 'linked-runtime', 'alias', 'masked', 'masked-runtime', 'static', 'disabled', 'indirect', 'generated', 'transient', 'bad'},
            'Type': {'simple', 'exec', 'forking', 'oneshot', 'dbus', 'notify', 'notify-reload', 'idle'},
            'RemainAfterExit': {'yes', 'no'},
            'Restart': {'no', 'on-success', 'on-failure', 'on-abnormal', 'on-watchdog', 'on-abort', 'always'},
            'KillMode': {'control-group', 'mixed', 'process', 'none'},
        }
        for key, allowed in states.items():
            value = fields.get(key, '')
            row[key] = value if value in allowed else None
        fragment = fields.get('FragmentPath')
        row['fragmentPath'] = fragment if fragment in {p + '/' + name for p in ('/etc/systemd/system', '/usr/lib/systemd/system', '/lib/systemd/system')} else None
        row['dropInCount'] = len(fields['DropInPaths'].split()) if 'DropInPaths' in fields else None
        row['mainPidPresent'] = fields['MainPID'] not in ('', '0') if 'MainPID' in fields else None
        row['jobPending'] = fields['Job'] not in ('', '0') if 'Job' in fields else None
        row['user'] = fields.get('User') if fields.get('User') in {'azureuser', 'caddy'} else None
        row['group'] = fields.get('Group') if fields.get('Group') in {'azureuser', 'caddy'} else None
        row['workingDirectory'] = fields.get('WorkingDirectory') if fields.get('WorkingDirectory') in {str(ROOT), str(ROOT.parent.parent)} else None
        row['controlGroup'] = fields.get('ControlGroup') if fields.get('ControlGroup') == '/system.slice/' + name else None
        for key in ('Requires', 'Wants', 'After', 'Before', 'PartOf', 'BindsTo', 'Conflicts', 'Triggers', 'TriggeredBy'):
            # Only this application's fixed unit names are emitted; other units are counted.
            values = fields.get(key, '').split()
            row[key] = {'riftassistUnits': [x for x in UNITS if x in values], 'otherUnits': len([x for x in values if x not in UNITS])}
        row['commands'] = {k: {'metadataPresent': k in fields, **shape(fields.get(k))} for k in ('ExecStartPre', 'ExecStart', 'ExecStartPost', 'ExecStop', 'ExecStopPost')}
        row['autostartConflictUnresolved'] = name == 'riftassist-autostart.service' and row.get('LoadState') != 'not-found'
        rows.append(row)
    return rows


def inspect():
    try:
        extra = layout()
    except (OSError, ValueError):
        extra = {'complete': False, 'issues': ['metadata-unavailable-or-link'], 'additionalPaths': []}
    return {'protocol': 'riftassist-release-blockers-1', 'readOnly': True, 'layout': extra, 'units': services(),
            'notRead': ['file contents', 'DB', 'keys', 'user records', 'Environment', 'logs', 'link targets', 'referenced scripts'],
            'notPerformed': ['content hashing', 'service control', 'network requests', 'sudo', 'file writes'],
            'authorizedToDeploy': False, 'autostartBehaviorVerified': False}


if __name__ == '__main__':
    try:
        print(json.dumps(inspect(), ensure_ascii=True, separators=(',', ':')))
    except Exception:
        print(json.dumps({'protocol': 'riftassist-release-blockers-1', 'readOnly': True, 'error': 'metadata-unavailable', 'authorizedToDeploy': False}))
