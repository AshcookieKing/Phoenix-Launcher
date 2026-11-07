// Моды через Steam API (native\steam_workshop.exe, ISteamUGC): подписка, загрузка и настоящий прогресс по байтам.
// Ссылок steam://subscribe у Steam нет - старый способ не качал ничего, отсюда «лаунчер недокачивает моды».
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const STATE = { SUBSCRIBED: 1, INSTALLED: 4, NEEDS_UPDATE: 8, DOWNLOADING: 16, PENDING: 32 };

const ERRORS = {
  no_steam: 'Steam не запущен — запустите Steam и войдите в аккаунт.',
  not_logged_on: 'Steam не в сети — войдите в аккаунт Steam.',
  init: 'Steam не отвечает — перезапустите Steam.',
  no_ugc: 'Steam Workshop недоступен в этой версии Steam.',
};

function helperPath() {
  const packaged = process.resourcesPath ? path.join(process.resourcesPath, 'steam_workshop.exe') : '';
  if (packaged && fs.existsSync(packaged)) return packaged;
  return path.join(__dirname, '..', 'native', 'steam_workshop.exe');
}

function helperAvailable(armaDir) {
  return Boolean(armaDir) && fs.existsSync(path.join(armaDir, 'steam_api64.dll')) && fs.existsSync(helperPath());
}

function isReady(st) {
  return Boolean(st & STATE.INSTALLED) && !(st & (STATE.NEEDS_UPDATE | STATE.DOWNLOADING | STATE.PENDING));
}

// mode: 'sync' (подписаться, скачать, ждать окончания) | 'state' (одно состояние)
// onStatus(Map id -> { state, done, total, stamp, folder, ready }) - раз в секунду
// Возвращает { promise, cancel }; promise -> { ok, items } | { ok: false, error, code, cancelled }
function runWorkshop(armaDir, mode, ids, { onStatus } = {}) {
  const list = [...new Set(ids.map(String).filter((id) => /^\d+$/.test(id)))];
  let child = null;
  let cancelled = false;
  const promise = new Promise((resolve) => {
    if (!list.length) return resolve({ ok: true, items: new Map() });
    if (!helperAvailable(armaDir)) return resolve({ ok: false, code: 'no_helper', error: 'Помощник Steam недоступен' });
    const items = new Map();
    let buf = '';
    let done = false;
    let ready = false;
    const finish = (res) => {
      if (done) return;
      done = true;
      resolve(res);
    };
    child = spawn(helperPath(), [armaDir, mode, ...list], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    child.on('error', (e) => finish({ ok: false, code: 'spawn', error: e.message }));
    child.on('exit', (code) => {
      if (cancelled) return finish({ ok: false, cancelled: true, error: 'Отменено' });
      if (mode === 'state' && ready) return finish({ ok: true, items });
      finish({ ok: false, code: 'exit', error: `Помощник Steam завершился (${code})` });
    });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buf += chunk;
      const lines = buf.split(/\r?\n/);
      buf = lines.pop();
      let tickEnd = false;
      for (const line of lines) {
        // steam_api пишет в stdout и свои строки - берём только наши
        if (line === 'READY') ready = true;
        else if (line === 'DONE') {
          onStatus?.(items);
          finish({ ok: true, items });
        } else if (line.startsWith('ERR ')) {
          const code = line.slice(4).trim().split(/\s+/)[0];
          finish({ ok: false, code, error: ERRORS[code] || `Steam: ${code}` });
        } else if (line.startsWith('S ')) {
          const m = line.match(/^S (\d+) (\d+) (\d+) (\d+) (\d+) ?(.*)$/);
          if (!m) continue;
          const st = Number(m[2]);
          items.set(m[1], { state: st, done: Number(m[3]), total: Number(m[4]), stamp: Number(m[5]), folder: m[6] || '', ready: isReady(st) });
          if (m[1] === list[list.length - 1]) tickEnd = true;
        }
      }
      if (tickEnd) onStatus?.(items);
    });
  });
  const cancel = () => {
    cancelled = true;
    if (child && child.exitCode === null) {
      try {
        child.kill();
      } catch {}
    }
  };
  return { promise, cancel };
}

module.exports = { runWorkshop, helperAvailable, isReady, STATE };
