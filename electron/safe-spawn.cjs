// Запуск дочерних процессов без исключений. Node бросает «spawn UNKNOWN» СИНХРОННО (не событием 'error'), когда
// Windows отказывает в CreateProcess по причине, которой нет в таблице libuv: файл заблокирован антивирусом
// (ERROR_VIRUS_INFECTED), Smart App Control / политика запуска, повреждённый exe. Раньше такой выброс внутри
// new Promise() обрывал весь запуск игры строкой «spawn UNKNOWN» в доке - теперь это обычный результат с понятным
// текстом, а вызывающий выбирает запасной путь.
const path = require('path');
const { spawn } = require('child_process');

function describeSpawnError(err, exe) {
  const name = path.basename(String(exe || ''));
  const code = err?.code || '';
  if (code === 'ENOENT') return `Файл не найден: ${name}. Переустановите лаунчер.`;
  if (code === 'EACCES' || code === 'EPERM') return `Нет прав на запуск ${name}.`;
  if (code === 'UNKNOWN' || /UNKNOWN/.test(String(err?.message))) {
    return `Windows не запустила ${name}. Проверьте журнал защиты Windows и целостность файла.`;
  }
  return `Не удалось запустить ${name}: ${err?.message || err}`;
}

// { child } | { error, code, message }
function trySpawn(exe, args = [], options = {}) {
  try {
    const child = spawn(exe, args, options);
    return { child };
  } catch (err) {
    return { error: err, code: err?.code || 'UNKNOWN', message: describeSpawnError(err, exe) };
  }
}

// Запуск «и забыть» (detached): дождаться 'spawn' или 'error'. -> { ok, pid } | { ok: false, code, message }
function spawnDetached(exe, args = [], options = {}) {
  const res = trySpawn(exe, args, { detached: true, stdio: 'ignore', ...options });
  if (!res.child) return Promise.resolve({ ok: false, code: res.code, message: res.message });
  const child = res.child;
  return new Promise((resolve) => {
    child.once('error', (err) => resolve({ ok: false, code: err?.code || 'UNKNOWN', message: describeSpawnError(err, exe) }));
    child.once('spawn', () => {
      child.unref();
      resolve({ ok: true, pid: child.pid });
    });
  });
}

module.exports = { trySpawn, spawnDetached, describeSpawnError };
