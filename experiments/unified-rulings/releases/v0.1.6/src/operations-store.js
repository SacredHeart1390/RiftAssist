const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync, backup } = require('node:sqlite');

const DAY = 86400000;
const fail = (message, statusCode = 400) => Object.assign(new Error(message), { statusCode });
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const dayKey = () => new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
const REPORT_STATES = ['received', 'triaged', 'reproduced', 'fixing', 'review', 'resolved', 'duplicate', 'needs-info'];

function createStore(root) {
  const directory = path.join(root, 'private');
  fs.mkdirSync(directory, { recursive: true });
  const keyPath = path.join(directory, 'storage.key');
  try { fs.writeFileSync(keyPath, crypto.randomBytes(32), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  const key = fs.readFileSync(keyPath);
  if (key.length !== 32) throw new Error('Invalid local storage key. Restore the matching key before starting.');
  const db = new DatabaseSync(path.join(directory, 'operations.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON;
    CREATE TABLE IF NOT EXISTS settings (name TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY, owner TEXT NOT NULL, client_key TEXT NOT NULL, fingerprint TEXT NOT NULL,
      created INTEGER NOT NULL, status TEXT NOT NULL, question TEXT, response TEXT, trace TEXT,
      UNIQUE(owner,client_key));
    CREATE INDEX IF NOT EXISTS requests_age ON requests(created);
    CREATE TABLE IF NOT EXISTS calls (
      id TEXT PRIMARY KEY, owner TEXT NOT NULL, day TEXT NOT NULL, kind TEXT NOT NULL,
      created INTEGER NOT NULL, finished INTEGER, input_tokens INTEGER, output_tokens INTEGER, error TEXT);
    CREATE INDEX IF NOT EXISTS calls_day ON calls(day,kind,owner);
    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY, owner TEXT NOT NULL, client_key TEXT NOT NULL, fingerprint TEXT NOT NULL,
      request_id TEXT, created INTEGER NOT NULL, updated INTEGER NOT NULL,
      category TEXT NOT NULL, status TEXT NOT NULL, content TEXT NOT NULL, snapshot TEXT,
      UNIQUE(owner,client_key));
    CREATE TABLE IF NOT EXISTS report_history (
      id INTEGER PRIMARY KEY, report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
      at INTEGER NOT NULL, status TEXT NOT NULL, note TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS session_counts (day TEXT PRIMARY KEY, count INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, created INTEGER NOT NULL, content TEXT NOT NULL);
  `);
  const seal = (value) => {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
  };
  const unseal = (value) => {
    if (!value) return null;
    const bytes = Buffer.from(value, 'base64');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
  };
  function transaction(work) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = work(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function setting(name, fallback) {
    const row = db.prepare('SELECT value FROM settings WHERE name=?').get(name);
    return row ? JSON.parse(row.value) : fallback;
  }
  function setSetting(name, value) {
    db.prepare('INSERT INTO settings VALUES (?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value').run(name, JSON.stringify(value));
  }
  function limits() {
    return { questions: 100, generations: 30, translations: 30, sessionQuestions: 10,
      sessionTranslations: 10, reports: 100, sessionReports: 5, concurrent: 3, ...setting('limits', {}) };
  }
  function purge() {
    const now = Date.now();
    transaction(() => {
      db.prepare('UPDATE requests SET question=NULL,response=NULL WHERE created<?').run(now - 7 * DAY);
      db.prepare('DELETE FROM requests WHERE created<?').run(now - 30 * DAY);
      db.prepare('DELETE FROM calls WHERE created<?').run(now - 30 * DAY);
      db.prepare('DELETE FROM reports WHERE created<?').run(now - 90 * DAY);
      db.prepare('DELETE FROM events WHERE created<?').run(now - 30 * DAY);
      db.prepare('DELETE FROM session_counts WHERE day<?').run(new Date(now - 30 * DAY).toISOString().slice(0, 10));
    });
    db.exec('PRAGMA wal_checkpoint(PASSIVE)');
  }
  function allocateSession() {
    transaction(() => {
      const day = dayKey();
      const count = db.prepare('SELECT count FROM session_counts WHERE day=?').get(day)?.count || 0;
      if (count >= 2000) throw fail('오늘의 신규 접속 한도에 도달했습니다. / Daily connection limit reached.', 429);
      db.prepare('INSERT INTO session_counts VALUES (?,1) ON CONFLICT(day) DO UPDATE SET count=count+1').run(day);
    });
  }
  function beginQuestion(owner, clientKey, question, fingerprint, context) {
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(clientKey || '')) throw fail('요청 번호가 필요합니다. 페이지를 새로고침해 주세요.', 400);
    return transaction(() => {
      const existing = db.prepare('SELECT * FROM requests WHERE owner=? AND client_key=?').get(owner, clientKey);
      if (existing) {
        if (existing.fingerprint !== fingerprint) throw fail('동일 요청 번호의 내용이 달라졌습니다.', 409);
        if (existing.response) return { id: existing.id, response: unseal(existing.response) };
        throw fail('이미 처리 중이거나 다시 사용할 수 없는 요청입니다. / Request already submitted.', 409);
      }
      const start = new Date(`${dayKey()}T00:00:00+09:00`).getTime();
      const counts = db.prepare('SELECT COUNT(*) AS total, COALESCE(SUM(owner=?),0) AS own FROM requests WHERE created>=?').get(owner, start);
      const cap = limits();
      if (counts.total >= cap.questions || counts.own >= cap.sessionQuestions) throw fail('오늘의 질문 한도에 도달했습니다. / Daily question limit reached.', 429);
      if (db.prepare("SELECT COUNT(*) AS count FROM requests WHERE status='processing' AND created>?").get(Date.now() - 180000).count >= cap.concurrent) throw fail('다른 질문을 처리 중입니다. 잠시 후 다시 시도해 주세요. / Server busy.', 429);
      const id = crypto.randomUUID();
      db.prepare('INSERT INTO requests(id,owner,client_key,fingerprint,created,status,question,response,trace) VALUES (?,?,?,?,?,?,?,?,?)').run(id, owner, clientKey, fingerprint, Date.now(), 'processing', seal(question), null, seal(context));
      return { id };
    });
  }
  function finishQuestion(id, response, trace) {
    db.prepare('UPDATE requests SET status=?,response=?,trace=? WHERE id=?').run(response.status || 'failed', seal(response), seal(trace), id);
  }
  function getQuestion(id, owner) {
    const row = db.prepare('SELECT * FROM requests WHERE id=? AND owner=? AND created>?').get(id, owner, Date.now() - 7 * DAY);
    if (!row) throw fail('연결할 질문을 찾을 수 없습니다. / Question unavailable.', 404);
    return { id: row.id, created: row.created, status: row.status, question: unseal(row.question), response: unseal(row.response), trace: unseal(row.trace) };
  }
  function attachTranslation(id, owner, key, translation) {
    transaction(() => {
      const question = getQuestion(id, owner);
      if (!question.response) return;
      for (const item of [...(question.response.evidence || []), ...(question.response.judgeCases || [])]) {
        if (item.localization?.key === key) item.localization.cached = translation;
      }
      db.prepare('UPDATE requests SET response=? WHERE id=? AND owner=?').run(seal(question.response), id, owner);
    });
  }
  function event(entry) {
    db.prepare('INSERT INTO events VALUES (?,?,?)').run(crypto.randomUUID(), Date.now(), seal(entry));
  }
  function reserveCall(owner, kind) {
    if (!setting('aiEnabled', true)) throw fail('AI 생성이 관리자에 의해 일시 중지되었습니다.', 503);
    return transaction(() => {
      const cap = limits();
      const count = db.prepare('SELECT COUNT(*) AS total, COALESCE(SUM(owner=?),0) AS own FROM calls WHERE day=? AND kind=?').get(owner, dayKey(), kind);
      if (count.total >= (kind === 'answer' ? cap.generations : cap.translations) || count.own >= (kind === 'answer' ? cap.sessionQuestions : cap.sessionTranslations)) throw fail('오늘의 AI 사용 한도에 도달했습니다. / Daily AI limit reached.', 429);
      if (db.prepare('SELECT COUNT(*) AS count FROM calls WHERE finished IS NULL AND created>?').get(Date.now() - 180000).count >= cap.concurrent) throw fail('AI가 다른 요청을 처리 중입니다. / AI busy.', 429);
      const id = crypto.randomUUID();
      db.prepare('INSERT INTO calls(id,owner,day,kind,created) VALUES (?,?,?,?,?)').run(id, owner, dayKey(), kind, Date.now());
      return id;
    });
  }
  function finishCall(id, usage, error = null) {
    db.prepare('UPDATE calls SET finished=?,input_tokens=?,output_tokens=?,error=? WHERE id=?').run(Date.now(), usage?.input_tokens ?? null, usage?.output_tokens ?? null, error, id);
  }
  function report(owner, body) {
    const { clientKey, requestId = null, category, description, expected = '', tags = [] } = body;
    if (!/^[a-zA-Z0-9-]{16,80}$/.test(clientKey || '') || !['app', 'ruling', 'translation', 'unsure'].includes(category)) throw fail('제보 항목을 확인해 주세요.');
    if (typeof description !== 'string' || description.trim().length < 5 || description.length > 5000 || typeof expected !== 'string' || expected.length > 3000) throw fail('문제 설명은 5~5,000자, 기대 답변은 3,000자 이내로 작성해 주세요.');
    const allowed = ['display', 'error', 'translation', 'wrong-answer', 'wrong-source', 'no-answer', 'other'];
    if (!Array.isArray(tags) || tags.length > 7 || tags.some((tag) => !allowed.includes(tag))) throw fail('알 수 없는 제보 분류입니다.');
    const content = { description: description.trim(), expected, tags, language: body.language === 'en' ? 'en' : 'ko' };
    const fingerprint = hash(JSON.stringify({ requestId, category, content }));
    return transaction(() => {
      const existing = db.prepare('SELECT * FROM reports WHERE owner=? AND client_key=?').get(owner, clientKey);
      if (existing) {
        if (existing.fingerprint !== fingerprint) throw fail('이미 사용한 제보 번호입니다.', 409);
        return { id: existing.id, status: existing.status };
      }
      const start = new Date(`${dayKey()}T00:00:00+09:00`).getTime();
      const count = db.prepare('SELECT COUNT(*) AS total,COALESCE(SUM(owner=?),0) AS own FROM reports WHERE created>=?').get(owner, start);
      const cap = limits();
      if (count.total >= cap.reports || count.own >= cap.sessionReports) throw fail('오늘의 제보 한도에 도달했습니다.', 429);
      const snapshot = requestId ? getQuestion(requestId, owner) : null;
      const id = crypto.randomUUID(), now = Date.now();
      db.prepare('INSERT INTO reports VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(id, owner, clientKey, fingerprint, requestId, now, now, category, 'received', seal(content), snapshot ? seal(snapshot) : null);
      db.prepare('INSERT INTO report_history(report_id,at,status,note) VALUES (?,?,?,?)').run(id, now, 'received', seal('접수'));
      return { id, status: 'received' };
    });
  }
  function listReports(owner = null) {
    return owner
      ? db.prepare('SELECT id,created,updated,category,status FROM reports WHERE owner=? ORDER BY created DESC LIMIT 100').all(owner)
      : db.prepare('SELECT id,request_id,created,updated,category,status FROM reports ORDER BY created DESC LIMIT 200').all();
  }
  function reportDetail(id) {
    const row = db.prepare('SELECT * FROM reports WHERE id=?').get(id);
    if (!row) throw fail('제보를 찾을 수 없습니다.', 404);
    const { owner, fingerprint, client_key, ...safe } = row;
    return { ...safe, content: unseal(row.content), snapshot: unseal(row.snapshot), history: db.prepare('SELECT at,status,note FROM report_history WHERE report_id=? ORDER BY id').all(id).map((item) => ({ ...item, note: unseal(item.note) })) };
  }
  function updateReport(id, status, note = '') {
    if (!REPORT_STATES.includes(status) || typeof note !== 'string' || note.length > 3000) throw fail('제보 상태 또는 메모를 확인해 주세요.');
    return transaction(() => {
      if (!db.prepare('UPDATE reports SET status=?,updated=? WHERE id=?').run(status, Date.now(), id).changes) throw fail('제보를 찾을 수 없습니다.', 404);
      db.prepare('INSERT INTO report_history(report_id,at,status,note) VALUES (?,?,?,?)').run(id, Date.now(), status, seal(note));
      return { ok: true };
    });
  }
  function stats() {
    return { day: dayKey(), limits: limits(), aiEnabled: setting('aiEnabled', true),
      calls: db.prepare('SELECT kind,COUNT(*) AS count,COALESCE(SUM(input_tokens),0) AS inputTokens,COALESCE(SUM(output_tokens),0) AS outputTokens,SUM(input_tokens IS NULL) AS usageUnknown FROM calls WHERE day=? GROUP BY kind').all(dayKey()),
      reports: db.prepare('SELECT status,COUNT(*) AS count FROM reports GROUP BY status').all() };
  }
  async function makeBackup() {
    purge();
    const folder = path.join(directory, 'backups', new Date().toISOString().replace(/[:.]/g, '-'));
    fs.mkdirSync(folder, { recursive: true });
    await backup(db, path.join(folder, 'operations.sqlite'));
    fs.copyFileSync(keyPath, path.join(folder, 'storage.key'));
    return { folder, note: '암호화 키를 포함하는 관리자용 백업입니다. 외부 공유 금지. 백업 보존 기간은 직접 관리하세요.' };
  }
  purge();
  return { directory, hash, setting, setSetting, limits, purge, allocateSession, beginQuestion, finishQuestion, getQuestion, attachTranslation, event, reserveCall, finishCall, report, listReports, reportDetail, updateReport, stats, makeBackup, close: () => db.close() };
}
module.exports = { createStore, REPORT_STATES };
