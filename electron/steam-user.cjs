// Текущий аккаунт Steam (SteamID64 + имя) — нужен для phx_roleapi
// SteamID берётся из appmanifest_107410.acf (поле LastOwner) без чтения loginusers.vdf на старте.
// loginusers.vdf читается только лениво — для имени пользователя, если ACF-метод не дал имя.
const fs = require('fs');
const path = require('path');
const { collectSteamLibraries, ARMA_APP_ID } = require('./paths.cjs');

// --- Парсер loginusers.vdf (используется только лениво, не при старте) ---
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

// --- Получение имени из loginusers.vdf по известному steamId (ленивый вызов) ---
function getPersonaNameFromLoginUsers(steamId) {
  try {
    const libs = collectSteamLibraries();
    // Ищем Steam-корень (там где есть config/loginusers.vdf)
    const steamRoots = new Set();
    for (const lib of libs) {
      // libraryfolders.vdf лежит в <steamRoot>/steamapps/, а сам Steam-корень на уровень выше
      const candidate = path.join(lib, 'config', 'loginusers.vdf');
      if (fs.existsSync(candidate)) steamRoots.add(lib);
      // Пробуем родительский каталог (Steam-корень)
      const parent = path.dirname(lib);
      const candidateParent = path.join(parent, 'config', 'loginusers.vdf');
      if (fs.existsSync(candidateParent)) steamRoots.add(parent);
    }
    for (const root of steamRoots) {
      const file = path.join(root, 'config', 'loginusers.vdf');
      if (!fs.existsSync(file)) continue;
      const users = parseLoginUsers(fs.readFileSync(file, 'utf8'));
      const found = users.find((u) => u.steamId === steamId);
      if (found) return found.personaName || found.accountName || null;
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
    // Шаг 1: получаем SteamID из ACF-файла игры — не триггерит KES PDM
    const steamId = getSteamIdFromAppManifest();
    if (steamId) {
      // Шаг 2: имя пробуем взять из loginusers.vdf (ленивый вызов, только если ID найден)
      // Если KES снова будет ловить этот вызов — его можно убрать, имя не критично для работы
      const personaName = getPersonaNameFromLoginUsers(steamId);
      user = {
        steamId,
        personaName: personaName || '',
        accountName: personaName || '',
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
