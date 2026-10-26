// Local-only data transfer tool. No OpenAI calls or remote fetches.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const run = promisify(execFile);
const token = crypto.randomBytes(32).toString('hex');
const origin = 'http://127.0.0.1:3001';
let importing = false;
const page = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>로컬 카드 가져오기</title><style>body{font:16px system-ui;max-width:900px;margin:40px auto;padding:20px;background:#151620;color:#eee}textarea{width:100%;height:280px}button{margin:16px 0;padding:12px}pre{white-space:pre-wrap}</style><h1>리프트나루 자료 가져오기</h1><p>공개 화면에서 수집한 JSON을 로컬 카드 색인으로 가져옵니다. 기존 자료는 백업합니다. 공식 확인·재배포 허가를 뜻하지 않습니다.</p><label for="data">카드 자료 JSON</label><textarea id="data" spellcheck="false"></textarea><button id="import" type="button">로컬 색인에 적용</button><pre id="result" role="status"></pre><script>document.querySelector('#import').addEventListener('click',async()=>{const button=document.querySelector('#import');button.disabled=true;document.querySelector('#result').textContent='가져오는 중…';try{const response=await fetch('/import',{method:'POST',headers:{'Content-Type':'application/json','X-Import-Token':'${token}'},body:document.querySelector('#data').value});document.querySelector('#result').textContent=await response.text();}catch(error){document.querySelector('#result').textContent=error.message;}finally{button.disabled=false;}});</script></html>`;
const server = http.createServer(async (req, res) => {
  const send = (status, body, type = 'text/plain; charset=utf-8') => { res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'" }); res.end(body); };
  if (req.headers.host !== '127.0.0.1:3001') { send(403, 'Local host required.'); return; }
  if (req.method === 'GET' && req.url === '/') { send(200, page, 'text/html; charset=utf-8'); return; }
  if (req.method !== 'POST' || req.url !== '/import') { send(404, 'Not found.'); return; }
  if (req.headers.origin !== origin || req.headers['x-import-token'] !== token) { send(403, 'Open the local import page to continue.'); return; }
  if (importing) { send(409, 'Import already running.'); return; }
  importing = true;
  try {
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 25 * 1024 * 1024) throw new Error('Import is larger than 25 MB.');
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString('utf8');
    const data = JSON.parse(raw);
    if (data.schemaVersion !== 1 || !Array.isArray(data.cards) || data.cards.length > 20000) throw new Error('Invalid card export.');
    const hash = crypto.createHash('sha256').update(raw).digest('hex').slice(0, 16);
    const directory = path.join(root, 'knowledge', 'imports');
    await fs.mkdir(directory, { recursive: true });
    const capture = path.join(directory, `riftnaru-capture-${hash}.json`);
    await fs.writeFile(capture, `${JSON.stringify(data, null, 2)}\n`);
    const result = await run(process.execPath, [path.join(root, 'scripts', 'import-riftnaru.mjs'), capture], { cwd: root, windowsHide: true, timeout: 30000 });
    send(200, `가져오기 완료\n${result.stdout.trim()}\n앱 서버를 다시 시작하면 새 카드 목록이 반영됩니다.`);
  } catch (error) { send(400, error.stderr?.trim() || error.message); }
  finally { importing = false; }
});
server.listen(3001, '127.0.0.1', () => console.log(`Local card import: ${origin}`));
