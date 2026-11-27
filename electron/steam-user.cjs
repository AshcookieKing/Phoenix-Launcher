// Текущий аккаунт Steam (SteamID64) — нужен для phx_roleapi
// SteamID берётся из appmanifest_107410.acf (поле LastOwner) без чтения loginusers.vdf,
// так как чтение Steam\config\loginusers.vdf из неподписанного Electron exe триггерит KES PDM (708dfca5).
const fs = require('fs');
const path = require('path');
const { collectSteamLibraries, ARMA_APP_ID } = require('./paths.cjs');

// --- Парсер loginusers.vdf (оставлен для совместимости экспорта, не вызывается) ---
function parseLoginUsers(text) {
  const users = [];
  const re = /\"(7656\d{13})\"\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const body = m[2];
    const field = (key) => {
      const f = body.match(new RegExp(`\"${key}\"\\s+\"([^\"]*)\"`, 'i'));
      return f ? f[1] : '';
    };
    users.push({
      steamId: m[1],
      accountName: field('AccountName'),
      personaName: field('PersonaName'),
      mostRecent: field('MostRecent') === '1',
      timestamp: parseInt(field('Timestamp'), 10) || 0,
    });
  }
  return users;
}

// --- Получение SteamID64 из appmanifest_107410.acf (поле LastOwner) ---
// Это безопасный путь: ACF-файл не вызывает детекций KES PDM
function getSteamIdFromAppManifest() {
  try {
    const libs = collectSteamLibraries();
    for (const lib of libs) {
      const acf = path.join(lib, 'steamapps', `appmanifest_${ARMA_APP_ID}.acf`);
      if (!fs.existsSync(acf)) continue;
      const text = fs.readFileSync(acf, 'utf8');
      const m = text.match(/"LastOwner"\s+"(7656\d{13})"/i);
      if (m) return m[1];
    }
  } catch {
    // ignore
  }
  return null;
}

let cache = null;

async function getSteamUser({ force = false } = {}) {
  if (cache && !force && Date.now() - cache.at < 60000) return cache.user;
  let user = null;
  try {
    const steamId = getSteamIdFromAppManifest();
    if (steamId) {
      user = {
        steamId,
        personaName: '',
        accountName: '',
        mostRecent: true,
        timestamp: 0,
      };
    }
  } catch {
    user = null;
  }
  cache = { at: Date.now(), user };
  return user;
}

module.exports = { getSteamUser, parseLoginUsers };
