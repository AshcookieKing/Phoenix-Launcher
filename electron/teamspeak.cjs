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

// путь к клиенту запоминаем: опрос реестра занимает секунды и подвешивает окно лаунчера
let ts3ExeCache = null;
function findTs3Client() {
  if (ts3ExeCache && fs.existsSync(ts3ExeCache)) return ts3ExeCache;
  ts3ExeCache = findTs3ClientUncached();
  return ts3ExeCache;
}

function findTs3ClientUncached() {
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
  // Прямой запуск клиента. Старой 3.1.x в профиле нужны права администратора - spawn тогда даёт EACCES (25.10):
  // ошибка ловится, и ссылку ts3server:// открывает Windows (ShellExecute сам спросит UAC). Без PowerShell -
  // скрытый PowerShell антивирусы (Kaspersky PDM) считают признаком вредоноса.
  const viaShell = () => {
    try {
      require('electron').shell.openExternal(url).catch(() => {});
    } catch {}
  };
  try {
    const child = spawn(exe, [url], { cwd: path.dirname(exe), detached: true, stdio: 'ignore', windowsHide: false });
    child.on('error', viaShell);
    child.unref();
  } catch {
    viaShell();
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

// ---- плагин TFAR для TeamSpeak 3: из мода TFAR (teamspeak\task_force_radio.ts3_plugin = zip с plugins\...) ----
const crypto = require('crypto');
const { readZip } = require('./zip.cjs');

// папка настроек TS3: портативная установка держит её рядом с клиентом (config\), обычная - %APPDATA%\TS3Client
function ts3ConfigDir(exe) {
  if (exe) {
    const c = path.join(path.dirname(exe), 'config');
    if (fs.existsSync(path.join(c, 'settings.db'))) return c;
  }
  return path.join(process.env.APPDATA || '', 'TS3Client');
}

function fileHash(f) {
  try {
    return crypto.createHash('sha1').update(fs.readFileSync(f)).digest('hex');
  } catch {
    return '';
  }
}

// файлы plugins\... из пакета (zip читается в памяти - без PowerShell и временной папки)
function packagePlugins(pkg) {
  return readZip(pkg)
    .filter((e) => /^plugins\//i.test(e.name))
    .map((e) => ({ rel: e.name.slice('plugins/'.length), data: e.data }))
    // только файлы внутри plugins\: без «..» и абсолютных путей
    .filter((e) => e.rel && !e.rel.split('/').some((s) => s === '..' || s === '') && !/^[a-z]:/i.test(e.rel));
}

// Есть такой же TFAR_win64.dll - ничего не делаем; нет / другой - копируем plugins\ из пакета в настройки TS3.
// { state: 'ok'|'installed'|'no_package'|'no_client'|'locked'|'error', running }
function ensureTfarPlugin(pkg) {
  const exe = findTs3Client();
  if (!exe) return { state: 'no_client' };
  if (!pkg || !fs.existsSync(pkg)) return { state: 'no_package' };
  const plugins = path.join(ts3ConfigDir(exe), 'plugins');
  let files;
  try {
    files = packagePlugins(pkg);
  } catch {
    return { state: 'error' };
  }
  const dll = files.find((f) => f.rel.toLowerCase() === 'tfar_win64.dll');
  if (!dll) return { state: 'error' };
  const want = crypto.createHash('sha1').update(dll.data).digest('hex');
  if (want === fileHash(path.join(plugins, 'TFAR_win64.dll'))) return { state: 'ok' };
  try {
    for (const f of files) {
      const dst = path.join(plugins, ...f.rel.split('/'));
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.writeFileSync(dst, f.data);
    }
  } catch (e) {
    // старый TFAR_win64.dll загружен запущенным TeamSpeak - заменить нельзя
    return { state: /EBUSY|EPERM|EACCES/.test(e.code || '') ? 'locked' : 'error' };
  }
  return { state: 'installed' };
}

function ts3Running() {
  try {
    return /ts3client_win/i.test(execFileSync('tasklist', ['/FI', 'IMAGENAME eq ts3client_win64.exe', '/NH'],
      { encoding: 'utf8', windowsHide: true, timeout: 5000 }));
  } catch {
    return false;
  }
}

module.exports = { findTs3Client, connectTeamSpeak, tsConnectedCount, ensureTeamSpeak, ensureTfarPlugin, ts3Running };
