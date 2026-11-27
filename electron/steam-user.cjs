// Текущий аккаунт Steam (SteamID64 + ник + аватар) — нужен для phx_roleapi и карточки профиля.
// SteamID берётся из appmanifest_107410.acf (поле LastOwner) без чтения loginusers.vdf,
// так как чтение Steam\config\loginusers.vdf из неподписанного Electron exe триггерит KES PDM (708dfca5).
// Ник и аватарка подгружаются с публичного XML-профиля Steam (без API-ключа).
const fs = require('fs');
const path = require('path');
const https = require('https');
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

function extractXmlTag(xml, tag) {
  const re = new RegExp(`<${tag}>\\s*(?:<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>|([^<]*))\\s*</${tag}>`, 'i');
  const m = xml.match(re);
  return m ? (m[1] ?? m[2] ?? '').trim() : '';
}

function fetchPublicSteamProfile(steamId, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const req = https.get(
      `https://steamcommunity.com/profiles/${steamId}/?xml=1`,
      { timeout: timeoutMs, headers: { 'User-Agent': 'PhoenixLauncher/1.4' } },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          return resolve(null);
        }
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          data += chunk;
          if (data.length > 128 * 1024) {
            req.destroy();
            resolve(null);
          }
        });
        res.on('end', () => {
          const personaName = extractXmlTag(data, 'steamID');
          const avatarUrl = extractXmlTag(data, 'avatarMedium') || extractXmlTag(data, 'avatarIcon');
          resolve(personaName || avatarUrl ? { personaName, avatarUrl } : null);
        });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.on('error', () => resolve(null));
  });
}

let cache = null;

async function getSteamUser({ force = false } = {}) {
  if (cache && !force && Date.now() - cache.at < 60000) return cache.user;
  let user = null;
  try {
    const steamId = getSteamIdFromAppManifest();
    if (steamId) {
      const profile = await fetchPublicSteamProfile(steamId);
      const prev = cache?.user?.steamId === steamId ? cache.user : null;
      const personaName = profile?.personaName || prev?.personaName || '';
      const avatarUrl = profile?.avatarUrl || prev?.avatarUrl || '';
      user = {
        steamId,
        personaName,
        accountName: personaName,
        avatarUrl,
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
