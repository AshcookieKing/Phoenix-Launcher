// TeamSpeak Phoenix: запуск именно TeamSpeak 3 (рация TFAR работает только с ним) сразу с адресом сервера.
// Ссылку ts3server:// Windows может отдавать новому TeamSpeak (5/6) или удалённому клиенту - тогда ничего не происходит,
// поэтому ищем ts3client_win64.exe сами: реестр (обработчик ts3file, деинсталляторы), стандартные папки.
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
  const found = [];
  // обработчик файлов ts3file: "...\ts3client_win64.exe" "%1"
  const h = regValues('HKCR\\ts3file\\shell\\open\\command');
  const m = h.match(/"([^"]*ts3client_win(?:64|32)\.exe)"/i);
  if (m) found.push(m[1]);
  // деинсталляторы «TeamSpeak 3 Client»: InstallLocation
  for (const root of [
    'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  ]) {
    const txt = regValues(root);
    for (const block of txt.split(/\r?\n(?=HKEY_)/)) {
      if (!/DisplayName\s+REG_SZ\s+TeamSpeak 3 Client/i.test(block)) continue;
      const loc = block.match(/InstallLocation\s+REG_SZ\s+(.+)/i);
      if (loc) found.push(path.join(loc[1].trim().replace(/^"|"$/g, ''), 'ts3client_win64.exe'));
    }
  }
  const local = process.env.LOCALAPPDATA || '';
  found.push(
    path.join(local, 'TeamSpeak 3 Client', 'ts3client_win64.exe'),
    'C:\\Program Files\\TeamSpeak 3 Client\\ts3client_win64.exe',
    'C:\\Program Files (x86)\\TeamSpeak 3 Client\\ts3client_win32.exe'
  );
  return found.find((p) => p && fs.existsSync(p)) || null;
}

// { ok: true, exe } | { ok: false, error: 'not_found' }
function connectTeamSpeak(url) {
  const exe = findTs3Client();
  if (!exe) return { ok: false, error: 'not_found' };
  const child = spawn(exe, [url], { cwd: path.dirname(exe), detached: true, stdio: 'ignore', windowsHide: false });
  child.unref();
  return { ok: true, exe };
}

module.exports = { findTs3Client, connectTeamSpeak };
