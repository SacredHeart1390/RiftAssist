#!/bin/sh
set -eu
stage=$1
commit=$2
case "$stage" in /home/azureuser/admin-v028-stage-*) ;; *) exit 2;; esac
case "$commit" in *[!a-f0-9]*|'') exit 2;; esac
base=/home/azureuser/RiftAssist-v020-e06496b0
live=$base/releases/v0.2.0
backup=$base/code-backups/patch028-before-$commit
test ! -e "$backup"
if [ -e /etc/systemd/system/riftassist-admin.service ]; then
  test "$(systemctl is-active riftassist-admin.service || true)" = inactive
  cmp -s /etc/systemd/system/riftassist-admin.service "$stage/admin-web/riftassist-admin.service"
fi
umask 077
sudo -n install -d -m 700 -o azureuser -g azureuser "$backup"
cd "$live"
rsync -aR app-release.json public/index.html public/service-worker.js src/server.js "$backup/code/"
node "$stage/admin-web/deploy-check.cjs" prepare "$stage" "$backup" "$commit"
applied=0
rollback(){
  if [ "$applied" -eq 1 ]; then
    sudo -n systemctl disable --now riftassist-admin.service || true
    rsync -a "$backup/code/" "$live/"
    sudo -n systemctl restart riftassist.service
    echo 'Restored v0.2.7 code; operational DB was not restored or replaced.' >&2
  fi
}
trap 'result=$?; if [ "$result" -ne 0 ]; then rollback; fi' EXIT
applied=1
mkdir -p "$base/admin-web"
cp -a "$stage/admin-web/." "$base/admin-web/"
if [ ! -e "$base/private/admin-probe.key" ]; then
  node -e "require('fs').writeFileSync('$base/private/admin-probe.key',require('crypto').randomBytes(32).toString('hex')+'\n',{flag:'wx',mode:0o600})"
fi
sudo -n install -d -m 755 /etc/riftassist
if [ ! -e /etc/riftassist/admin-web.key ]; then
  sudo -n node -e "require('fs').writeFileSync('/etc/riftassist/admin-web.key',require('crypto').randomBytes(32).toString('hex')+'\n',{flag:'wx',mode:0o640})"
  sudo -n chown root:azureuser /etc/riftassist/admin-web.key
fi
sudo -n install -m 644 "$stage/admin-web/riftassist-admin.service" /etc/systemd/system/riftassist-admin.service
sudo -n systemctl daemon-reload
sudo -n systemctl enable --now riftassist-admin.service
cd "$stage/release"
rsync -aR app-release.json public/index.html public/service-worker.js src/server.js "$live/"
sudo -n systemctl restart riftassist.service
sleep 4
test "$(systemctl is-active riftassist.service)" = active
test "$(systemctl is-active riftassist-admin.service)" = active
node "$base/admin-web/deploy-check.cjs" verify "$stage" "$backup" "$commit"
applied=0
echo 'v0.2.8 production and independent read-only administrator verified.'
