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

module.exports = { findTs3Client, connectTeamSpeak };
