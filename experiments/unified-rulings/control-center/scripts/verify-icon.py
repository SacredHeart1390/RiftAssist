"""Verify deterministic icon provenance and ICO entries without changing the original SVG."""
from pathlib import Path
import hashlib
import json
import struct

project = Path(__file__).resolve().parents[1]
repo = project.parents[2]
assets = project / 'src/RiftAssist.ControlCenter/Assets'
origin = json.loads((assets / 'icon-origin.json').read_text())
source = repo / origin['source']
data = (assets / 'RiftAssist.ico').read_bytes()
assert hashlib.sha256(source.read_bytes()).hexdigest() == origin['sourceSha256']
assert hashlib.sha256(data).hexdigest() == origin['icoSha256']
reserved, kind, count = struct.unpack_from('<HHH', data)
assert reserved == 0 and kind == 1 and count == len(origin['sizes'])
sizes = []
for i in range(count):
    width, height, _, _, _, _, length, offset = struct.unpack_from('<BBBBHHII', data, 6 + i * 16)
    width, height = width or 256, height or 256
    assert width == height and offset >= 6 + count * 16 and offset + length <= len(data)
    assert data[offset:offset + 8] == b'\x89PNG\r\n\x1a\n'
    sizes.append(width)
assert sorted(sizes) == origin['sizes']
print(json.dumps({'sourceHashVerified': True, 'icoHashVerified': True, 'sizes': sorted(sizes), 'originalChanged': False}))
