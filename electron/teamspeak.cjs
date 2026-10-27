// TeamSpeak Phoenix: запуск именно TeamSpeak 3 (рация TFAR работает только с ним) сразу с адресом сервера.
// Ссылку ts3server:// Windows может отдавать новому TeamSpeak (5/6) или удалённому клиенту - тогда ничего не происходит,
// поэтому ищем ts3client_win64.exe сами: Program Files, реестр (деинсталляторы, обработчик ts3file), профиль.
const fs = require('fs');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

function regValues(key) {
  try {
    return execFileSync('reg', ['query', key, '/s'], { encoding: 'utf8', windowsHide: true, timeout: 5000 });
  } catch {
    return '';
  }
}

function findTs3Client() {
  // сначала Program Files (обычно свежая установка), копия в профиле - последней: там бывает старая 3.1.x,
  // которую Windows без прав администратора не запускает (EACCES, 25.10)
  const found = [
    'C:\\Program Files\\TeamSpeak 3 Client\\ts3client_win64.exe',
    'C:\\Program Files (x86)\\TeamSpeak 3 Client\\ts3client_win32.exe',
  ];
  // деинсталляторы «TeamSpeak 3 Client»: InstallLocation
  for (const root of [
    'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  ]) {
    const txt = regValues(root);
    for (const block of txt.split(/\r?\n(?=HKEY_)/)) {
      if (!/DisplayName\s+REG_SZ\s+TeamSpeak 3 Client/i.test(block)) continue;
      const loc = block.match(/InstallLocation\s+REG_SZ\s+(.+)/i);
      if (loc) found.push(path.join(loc[1].trim().replace(/^"|"$/g, ''), 'ts3client_win64.exe'));
    }
  }
  // обработчик файлов ts3file: "...\ts3client_win64.exe" "%1"
  const h = regValues('HKCR\\ts3file\\shell\\open\\command');
  const m = h.match(/"([^"]*ts3client_win(?:64|32)\.exe)"/i);
  if (m) found.push(m[1]);
  found.push(path.join(process.env.LOCALAPPDATA || '', 'TeamSpeak 3 Client', 'ts3client_win64.exe'));
  return found.find((p) => p && fs.existsSync(p)) || null;
}

// { ok: true, exe } | { ok: false, error }
function connectTeamSpeak(url) {
  const exe = findTs3Client();
  if (!exe) return { ok: false, error: 'not_found' };
  // не прямым spawn: старой 3.1.x в профиле нужны права администратора - spawn давал EACCES и необработанную ошибку
  // главного процесса (25.10)
  try {
    // PowerShell Start-Process = ShellExecute (запрос UAC, если клиенту нужны права); пути без одинарных кавычек
    const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
    const cmd = `Start-Process -FilePath ${q(exe)} -WorkingDirectory ${q(path.dirname(exe))} -ArgumentList ${q(url)}`;
    // без detached: с ним Start-Process не срабатывал (проверено); PowerShell выходит сразу после запуска клиента
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], { stdio: 'ignore', windowsHide: true });
    child.on('error', () => {});
  } catch (e) {
    return { ok: false, error: e.message || 'spawn' };
  }
  return { ok: true, exe };
}

// ---- ClientQuery (плагин clientquery TS3, 127.0.0.1:25639): подключён ли клиент к серверу ----
// ключ API клиент сам пишет в %APPDATA%\TS3Client\clientquery.ini (api_key=...)
const net = require('net');

function clientQueryKey() {
  try {
    const ini = fs.readFileSync(path.join(process.env.APPDATA || '', 'TS3Client', 'clientquery.ini'), 'utf8');
    const m = ini.match(/^\s*api_key\s*=\s*([A-Z0-9-]+)/im);
    return m ? m[1] : '';
  } catch {
    return '';
  }
}

// число вкладок TS3, подключённых к серверу; null - ClientQuery недоступен (клиент не запущен / нет плагина или ключа)
function tsConnectedCount(timeoutMs = 3000) {
  const key = clientQueryKey();
  return new Promise((resolve) => {
    const sock = net.connect(25639, '127.0.0.1');
    let buf = '';
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      sock.destroy();
      resolve(v);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    // команды по очереди: ответ каждой заканчивается строкой «error id=...»
    const queue = [];
    let pending = null;
    const send = (cmd) => new Promise((res) => { queue.push({ cmd, res }); pump(); });
    const pump = () => {
      if (pending || !queue.length || !ready) return;
      pending = queue.shift();
      sock.write(pending.cmd + '\n');
    };
    let ready = false;
    sock.on('data', (d) => {
      buf += d.toString('utf8');
      if (!ready) {
        if (!/selected schandlerid=\d+/.test(buf)) return;
        ready = true;
        buf = '';
        pump();
        return;
      }
      const m = buf.match(/error id=(\d+)[^\n]*/);
      if (!m || !pending) return;
      const body = buf.slice(0, m.index);
      buf = buf.slice(m.index + m[0].length);
      const p = pending;
      pending = null;
      p.res({ id: Number(m[1]), body });
      pump();
    });
    sock.on('error', () => finish(null));
    sock.on('close', () => finish(null));
    (async () => {
      if (key && (await send(`auth apikey=${key}`)).id !== 0) return finish(null);
      const list = await send('serverconnectionhandlerlist');
      if (list.id !== 0) return finish(null);
      const ids = [...list.body.matchAll(/schandlerid=(\d+)/g)].map((x) => x[1]);
      let n = 0;
      for (const id of ids) {
        if ((await send(`use schandlerid=${id}`)).id !== 0) continue;
        if ((await send('whoami')).id === 0) n++;   // не подключена - error id=1794 not connected
      }
      finish(n);
    })();
  });
}

// TeamSpeak перед игрой: уже на сервере - сразу; иначе запустить клиент и ждать подключения (до timeoutMs).
// onStep(message) - текст для полосы запуска. { ok, state: 'connected'|'already'|'timeout'|'no_query'|'not_found' }
async function ensureTeamSpeak(url, { timeoutMs = 90000, onStep = () => {} } = {}) {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  if ((await tsConnectedCount()) > 0) return { ok: true, state: 'already' };
  onStep('Запуск TeamSpeak...');
  const res = connectTeamSpeak(url);
  if (!res.ok) return { ok: false, state: 'not_found' };
  const t0 = Date.now();
  let seenQuery = false;
  while (Date.now() - t0 < timeoutMs) {
    await sleep(1500);
    const n = await tsConnectedCount();
    if (n !== null) seenQuery = true;
    if (n > 0) return { ok: true, state: 'connected' };
    // клиент запущен, а ClientQuery так и не ответил (плагин выключен) - не держим игру дольше 20 с
    if (!seenQuery && Date.now() - t0 > 20000) return { ok: false, state: 'no_query' };
    onStep(seenQuery ? 'Подключение к серверу TeamSpeak...' : 'Запуск TeamSpeak...');
  }
  return { ok: false, state: 'timeout' };
}

module.exports = { findTs3Client, connectTeamSpeak, tsConnectedCount, ensureTeamSpeak };
