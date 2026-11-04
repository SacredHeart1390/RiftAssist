const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

function extractQuickOrigin(text) {
  return String(text).match(/https:\/\/[a-z0-9]+(?:-[a-z0-9]+)*\.trycloudflare\.com(?=[\s"'|/]|$)/)?.[0] || null;
}

// Use only the managed app port; do not expose the manager or arbitrary destinations.
function startQuickTunnel({ executable, directory, port, onState = () => {}, onExit = () => {}, spawnProcess = spawn }) {
  fs.mkdirSync(directory, { recursive: true });
  const configuration = path.join(directory, 'quick-tunnel.yml');
  // An explicit empty config avoids inheriting another user's named tunnel settings.
  fs.writeFileSync(configuration, '{}\n');
  const child = spawnProcess(executable, ['tunnel', '--config', configuration, '--no-autoupdate', '--url', `http://127.0.0.1:${port}`, '--metrics', '127.0.0.1:0'], {
    cwd: directory, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '', complete = false;
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!complete) { complete = true; child.kill(); reject(new Error('임시 주소 발급 시간이 초과됐습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.')); }
    }, 45000);
    function fail() {
      clearTimeout(timer);
      if (!complete) { complete = true; reject(new Error('Cloudflare 연결을 시작하지 못했습니다. 실행 파일과 네트워크를 확인해 주세요.')); }
      onExit();
    }
    function receive(chunk) {
      output = (output + chunk.toString()).slice(-16000);
      const origin = extractQuickOrigin(output);
      if (origin && !complete) { complete = true; clearTimeout(timer); resolve(origin); }
      if (/Registered tunnel connection/.test(output)) onState('connected');
    }
    child.stdout.on('data', receive);
    child.stderr.on('data', receive);
    child.once('error', fail);
    child.once('exit', fail);
  });
  return { child, ready };
}
module.exports = { startQuickTunnel, extractQuickOrigin };
