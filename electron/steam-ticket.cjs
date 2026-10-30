// Steam-билет Arma 3 для входа через Discord (как в игре): native\steam_ticket.exe берёт steam_api64.dll из папки Arma 3,
// входит в Steam как Arma 3 и держит билет, пока phx_roleapi проверяет его через Steam Web API. С билетом бот Phoenix
// не просит подтверждать Steam в браузере. Без Steam/Arma - { ok: false }, вход идёт по-старому (Steam в браузере).
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

function helperPath() {
  const packaged = process.resourcesPath ? path.join(process.resourcesPath, 'steam_ticket.exe') : '';
  if (packaged && fs.existsSync(packaged)) return packaged;
  return path.join(__dirname, '..', 'native', 'steam_ticket.exe');
}

let current = null;

// Завершить помощника (вход готов, отменён или истёк): Steam снимает статус «в игре»
function releaseSteamTicket() {
  if (current && current.exitCode === null) {
    try {
      current.kill();
    } catch {}
  }
  current = null;
}

// { ok: true, steamId, ticket } | { ok: false, error }
function getSteamTicket(armaDir, { holdSeconds = 45, timeoutMs = 15000 } = {}) {
  releaseSteamTicket();
  const exe = helperPath();
  if (!armaDir || !fs.existsSync(path.join(armaDir, 'steam_api64.dll')) || !fs.existsSync(exe)) {
    return Promise.resolve({ ok: false, error: 'no_helper' });
  }
  return new Promise((resolve) => {
    let done = false;
    let out = '';
    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (!result.ok) releaseSteamTicket();
      resolve(result);
    };
    const child = spawn(exe, [armaDir, String(holdSeconds)], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    current = child;
    const timer = setTimeout(() => finish({ ok: false, error: 'timeout' }), timeoutMs);
    child.on('error', (e) => finish({ ok: false, error: e.message || 'spawn' }));
    child.on('exit', () => {
      if (current === child) current = null;
      finish({ ok: false, error: 'exit' });
    });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      out += chunk;
      // steam_api пишет в stdout свои строки - нужна наша (OK / ERR)
      const line = out.split(/\r?\n/).find((l) => /^(OK|ERR) /.test(l));
      if (!line) return;
      const [tag, a, b] = line.trim().split(/\s+/);
      if (tag === 'OK' && /^7656\d{13}$/.test(a || '') && /^[0-9A-F]{16,2048}$/.test(b || '')) {
        finish({ ok: true, steamId: a, ticket: b });
      } else {
        finish({ ok: false, error: a || 'helper' });
      }
    });
  });
}

module.exports = { getSteamTicket, releaseSteamTicket };
