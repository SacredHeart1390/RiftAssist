#!/bin/bash
# Authenticated SSH upload -> dedicated sync account. Never accepts a path or command.
set -euo pipefail
digest=${1:-}
[[ $# == 1 && "$digest" =~ ^[a-f0-9]{64}$ ]] || exit 2
exec 9>/run/lock/riftassist-browser-receive.lock
flock -n 9 || exit 3
source=/home/azureuser/riftassist-browser-upload/$digest.json
target=/var/lib/riftassist-riftnaru-sync/browser-export.json
[[ -f "$source" && ! -L "$source" && $(stat -c %h "$source") == 1 && $(stat -c %s "$source") -le 16777216 ]] || exit 4
[[ $(sha256sum "$source" | cut -d' ' -f1) == "$digest" ]] || exit 5
if [[ -e "$target" || -L "$target" ]]; then
  [[ -f "$target" && ! -L "$target" && $(sha256sum "$target" | cut -d' ' -f1) == "$digest" ]] || exit 6
else
  install -o riftassist-sync -g riftassist-knowledge -m 0640 "$source" "$target.pending"
  [[ $(sha256sum "$target.pending" | cut -d' ' -f1) == "$digest" ]] || exit 7
  mv -T "$target.pending" "$target"
fi
systemctl start riftassist-riftnaru-sync.service
python3 - <<'PY'
import json
p='/home/azureuser/RiftAssist-v020-e06496b0/knowledge-releases/riftnaru-sync-status.json'
x=json.load(open(p));print(json.dumps({k:x[k] for k in ['status','checked','changed','activeReleaseId','error'] if k in x}))
PY
