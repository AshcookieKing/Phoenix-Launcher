// Клиент phx_roleapi: роли/звание/батальон меню Phoenix по SteamID и привязка Discord кодом (как в игре)
const http = require('http');
const crypto = require('crypto');
const { ROLE_API, BOT_API, MENU_LOGIN_URL } = require('./phx-config.cjs');

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function request(url, { method = 'GET', body = null, timeout = 8000 } = {}) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      url,
      {
        method,
        timeout,
        headers: payload
          ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
          : {},
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(data || '{}');
          } catch {}
          resolve({ status: res.statusCode, data: json });
        });
      }
    );
    req.on('error', (e) => resolve({ status: 0, data: null, error: e.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ status: 0, data: null, error: 'timeout' });
    });
    if (payload) req.write(payload);
    req.end();
  });
}

async function getMenuRoles(steamId) {
  if (!/^7656\d{13}$/.test(String(steamId || ''))) {
    return { ok: false, error: 'Steam не найден' };
  }
  const res = await request(`${ROLE_API}/menu/roles?steam=${steamId}`);
  if (res.status !== 200 || !res.data) {
    return { ok: false, error: res.status === 429 ? 'Слишком часто, подождите' : 'Сервер ролей недоступен' };
  }
  return { ok: true, ...res.data };
}

function makeCode() {
  let code = '';
  for (let i = 0; i < 6; i++) code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
  return code;
}

// Код привязки: phx_roleapi запоминает SteamID, страница бота подтверждает его через Discord OAuth
// token - ключ лаунчера: phx_roleapi хранит его sha256 при подтверждении, «Выйти» удаляет привязку только с ним
// ticket - Steam-билет Arma 3 (steam-ticket.cjs): phx_roleapi проверяет его в Steam, и бот не просит вход в Steam в браузере
async function startMenuPair(steamId, ticket = '') {
  const code = makeCode();
  const token = crypto.randomBytes(32).toString('hex');
  const body = { steam: steamId, code, token };
  if (ticket) body.ticket = ticket;
  const res = await request(`${ROLE_API}/menu/pair`, { method: 'POST', body });
  if (res.status !== 200 || !res.data?.ok) {
    return { ok: false, error: res.data?.error === 'rate' ? 'Слишком много попыток, подождите минуту' : 'Сервер ролей недоступен' };
  }
  return { ok: true, code, token, url: MENU_LOGIN_URL + code, expiresIn: res.data.expiresIn || 600 };
}

// «Выйти из аккаунта»: привязка Discord к SteamID удаляется - меню Phoenix в игре тоже станет гостем
async function unlinkMenu(steamId, token) {
  const res = await request(`${ROLE_API}/menu/unlink`, { method: 'POST', body: { steam: steamId, token } });
  if (res.status === 200 && res.data?.ok) return { ok: true };
  if (res.status === 403 || res.status === 400) return { ok: false, noToken: true };
  return { ok: false, error: res.status === 429 ? 'Слишком часто, подождите' : 'Сервер ролей недоступен' };
}

async function botOnline() {
  const res = await request(`${BOT_API}/api/launcher/online`, { timeout: 5000 });
  return res.status === 200;
}

module.exports = { getMenuRoles, startMenuPair, unlinkMenu, botOnline };
