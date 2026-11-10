"""Fixed A-only bootstrap. INPUT is prepended by the pinned Windows client.

No service commands, old DataRoot, operating keys or environment contents are read.
Only the approved new upload, root inventory and new site are changed.
"""
import hashlib
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys


def require(condition):
    if not condition:
        raise ValueError("installation-rejected")


def shape(root):
    require(root.is_dir() and not root.is_symlink())
    for directory, dirs, files in os.walk(root, followlinks=False):
        for name in dirs + files:
            item = Path(directory) / name
            meta = item.lstat()
            require(stat.S_ISDIR(meta.st_mode) or
                    stat.S_ISREG(meta.st_mode) and meta.st_nlink == 1)


def protect_parent(root):
    # Existing ancestors must already be root-controlled; never repair their mode.
    if root != root.parent:
        protect_parent(root.parent)
    if not root.exists():
        root.mkdir(mode=0o755)
    meta = root.lstat()
    require(stat.S_ISDIR(meta.st_mode) and meta.st_uid == 0 and not meta.st_mode & 0o022)


def check_tree(root, expected):
    shape(root)
    seen = set()
    for directory, _, files in os.walk(root):
        for name in files:
            item = Path(directory) / name
            relative = item.relative_to(root).as_posix()
            require(relative in expected and item.stat().st_size <= 16 * 1024 * 1024)
            require(hashlib.sha256(item.read_bytes()).hexdigest() == expected[relative])
            seen.add(relative)
    require(seen == set(expected))


def main():
    require(os.geteuid() == 0)
    site = INPUT["siteId"]
    import re
    require(re.fullmatch(r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}", site))
    upload = Path("/home/azureuser/riftassist-code-" + site)
    # No overwrite/replay: any prior partial installation requires state review.
    base = Path("/var/lib/riftassist-replacement-upload") / site
    inventory = Path("/etc/riftassist-replacement/inventory.json")
    require(not os.path.lexists(base) and not os.path.lexists(inventory))
    shape(upload)
    for parent in [Path("/var/lib/riftassist-replacement-upload"), inventory.parent]:
        protect_parent(parent)
    base.mkdir(mode=0o755)
    shutil.copytree(upload / "capsule", base / "code", symlinks=True)
    code = base / "code"
    check_tree(code, INPUT["capsuleFiles"])
    for directory, dirs, files in os.walk(code):
        os.chmod(directory, 0o755)
        for name in files:
            os.chmod(Path(directory) / name, 0o644)
    source_profile = upload / "inventory.json"
    require(source_profile.stat().st_size <= 32768)
    profile_bytes = source_profile.read_bytes()
    require(hashlib.sha256(profile_bytes).hexdigest() == INPUT["inventoryFileSha256"])
    profile = json.loads(profile_bytes)
    require(profile["siteId"] == site and profile["root"] == "/var/lib/riftassist-replacement/" + site)
    # Copy approved public knowledge into a root-owned holding directory, then
    # verify the complete pin set. Never copy anything from the operating root.
    shutil.copytree(upload / "knowledge", base / "knowledge", symlinks=True)
    check_tree(base / "knowledge", INPUT["knowledgeFiles"])
    with inventory.open("xb") as stream:
        stream.write(profile_bytes)
        stream.flush()
        os.fsync(stream.fileno())
    os.chmod(inventory, 0o644)
    env = {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8"}
    result = subprocess.run(["/usr/bin/node", "--disable-proto=throw",
                             str(code / "site/tools/install-code.cjs"), INPUT["planSha256"]],
                            capture_output=True, timeout=180, env=env, check=True)
    receipt = json.loads(result.stdout)
    require(receipt["inventoryHash"] == INPUT["inventoryHash"])
    data = Path(profile["candidateData"])
    require(data == Path(profile["root"]) / "data/v0.2.0")
    shutil.copytree(base / "knowledge/knowledge-releases", data / "knowledge-releases", symlinks=True)
    program = "const r=require(process.argv[1]).knowledgeHash(process.argv[2]);if(r.hash!==process.argv[3])process.exit(1)"
    subprocess.run(["/usr/bin/node", "--disable-proto=throw", "-e", program,
                    str(code / "site/tools/replacement-ubuntu.cjs"), str(data), profile["knowledgeHash"]],
                   capture_output=True, timeout=30, env=env, check=True)
    # Only fixed non-sensitive receipt fields leave the server.
    print(json.dumps({key: receipt[key] for key in ["siteId", "inventoryHash", "sourceReady",
                     "codeOnlyInstalled", "rollbackReferenceHash", "serviceChanged",
                     "caddyChanged", "operationalDataRead", "activePointerChanged"]}))


try:
    main()
except Exception:
    print("code-installation-rejected-no-automatic-retry", file=sys.stderr)
    sys.exit(1)
