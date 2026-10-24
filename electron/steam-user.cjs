// Текущий аккаунт Steam (SteamID64 + имя) из Steam\config\loginusers.vdf — нужен для phx_roleapi
const fs = require('fs');
const path = require('path');
const { readRegistryPaths } = require('./paths.cjs');

function steamInstallCandidates(regSteam) {
  const list = [];
  if (regSteam) list.push(path.normalize(regSteam));
  const x86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  list.push(path.join(x86, 'Steam'));
  list.push(path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Steam'));
  return [...new Set(list)];
}

function parseLoginUsers(text) {
  const users = [];
  const re = /"(7656\d{13})"\s*\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const body = m[2];
    const field = (key) => {
      const f = body.match(new RegExp(`"${key}"\\s+"([^"]*)"`, 'i'));
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

let cache = null;

async function getSteamUser({ force = false } = {}) {
  if (cache && !force && Date.now() - cache.at < 60000) return cache.user;
  let user = null;
  try {
    const reg = await readRegistryPaths();
    for (const dir of steamInstallCandidates(reg.steamPath)) {
      const file = path.join(dir, 'config', 'loginusers.vdf');
      if (!fs.existsSync(file)) continue;
      const users = parseLoginUsers(fs.readFileSync(file, 'utf8'));
      if (!users.length) continue;
      users.sort((a, b) => Number(b.mostRecent) - Number(a.mostRecent) || b.timestamp - a.timestamp);
      user = users[0];
      break;
    }
  } catch {
    user = null;
  }
  cache = { at: Date.now(), user };
  return user;
}

module.exports = { getSteamUser, parseLoginUsers };
