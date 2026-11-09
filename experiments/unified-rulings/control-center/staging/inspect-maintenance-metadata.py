"""PROPOSED approval: fixed file lstat/size metadata and MemAvailable only; no private file content."""
import json
import os
from pathlib import Path
import re
import stat

ROOT = Path('/home/azureuser/RiftAssist/experiments/unified-rulings')
FILES = ('.env', 'private/operations.sqlite', 'private/operations.sqlite-wal', 'private/operations.sqlite-shm',
         'private/storage.key', 'private/manager.key', 'private/sessions.key')


def inspect():
    for parent in (ROOT, *ROOT.parents):
        if parent.is_symlink():
            return {'protocol': 'riftassist-maintenance-metadata-1', 'readOnly': True, 'error': 'root-link', 'authorizedToDeploy': False}
    rows = []
    for name in FILES:
        file = ROOT / name
        if name.startswith('private/') and (ROOT / 'private').is_symlink():
            rows.append({'role': name, 'verified': False, 'reason': 'parent-link'})
            continue
        try:
            s = file.lstat()
            rows.append({'role': name, 'present': True, 'regular': stat.S_ISREG(s.st_mode),
                         'link': stat.S_ISLNK(s.st_mode), 'links': s.st_nlink,
                         'bytes': s.st_size, 'uid': s.st_uid, 'gid': s.st_gid,
                         'groupOrWorldReadable': bool(s.st_mode & 0o044),
                         'groupOrWorldWritable': bool(s.st_mode & 0o022), 'contentRead': False})
        except FileNotFoundError:
            rows.append({'role': name, 'present': False, 'contentRead': False})
        except OSError:
            rows.append({'role': name, 'verified': False, 'reason': 'metadata-unavailable'})
    memory = None
    try:
        # Public kernel resource counters only. No /proc/<pid>/environ, argv or user data.
        with open('/proc/meminfo', 'r', encoding='ascii') as f:
            text = f.read(16384)
        m = re.search(r'^MemAvailable:\s+(\d+) kB$', text, re.M)
        memory = int(m.group(1)) * 1024 if m else None
    except OSError:
        pass
    free = None
    try:
        v = os.statvfs(ROOT)
        free = v.f_bavail * v.f_frsize
    except (OSError, AttributeError):
        pass
    return {'protocol': 'riftassist-maintenance-metadata-1', 'readOnly': True, 'files': rows,
            'memAvailableBytes': memory, 'freeDiskBytes': free, 'privateFilesOpened': 0,
            'schemaInspected': False, 'keyValuesRead': False, 'authorizedToDeploy': False}


if __name__ == '__main__':
    try:
        print(json.dumps(inspect(), separators=(',', ':')))
    except Exception:
        print(json.dumps({'protocol': 'riftassist-maintenance-metadata-1', 'readOnly': True,
                          'error': 'metadata-unavailable', 'authorizedToDeploy': False}))
