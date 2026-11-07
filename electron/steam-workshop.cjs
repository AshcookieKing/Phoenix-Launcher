const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { ARMA_APP_ID, parseLibraryFolders } = require('./paths.cjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function resolveSteamExe(config) {
  const steamPath = String(config?.steamPath || '').trim();
  if (steamPath) {
    const exe = path.join(steamPath, 'steam.exe');
    if (fs.existsSync(exe)) return exe;
  }
  const defaults = [
    path.join(process.env['ProgramFiles(x86)'] || '', 'Steam', 'steam.exe'),
    path.join(process.env.ProgramFiles || '', 'Steam', 'steam.exe'),
  ];
  for (const exe of defaults) {
    if (exe && fs.existsSync(exe)) return exe;
  }
  return null;
}

function isSteamRunning() {
  if (process.platform !== 'win32') return false;
  try {
    const out = spawnSync('tasklist', ['/FI', 'IMAGENAME eq steam.exe', '/NH'], {
      encoding: 'utf8',
      windowsHide: true,
    });
    return (out.stdout || '').toLowerCase().includes('steam.exe');
  } catch {
    return false;
  }
}

async function ensureSteamClient(config) {
  const steamExe = resolveSteamExe(config);
  if (!steamExe) return false;
  if (!isSteamRunning()) {
    spawn(steamExe, ['-silent'], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    await sleep(5000);
  }
  return true;
}

function runSteamUrl(url, config) {
  const steamExe = resolveSteamExe(config);
  if (steamExe) {
    spawn(steamExe, ['-silent', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    return;
  }
  // без скрытого cmd: ссылку steam:// открывает Windows
  try {
    require('electron').shell.openExternal(url).catch(() => {});
  } catch {}
}

// Подписка и загрузка - только через Steam API (workshop-ugc.cjs): ссылок steam://subscribe у Steam нет.
// Здесь - запасной путь: страница мода в клиенте Steam (кнопка «Подписаться» там).
function openWorkshopPage(workshopId, config) {
  const id = String(workshopId || '').trim();
  if (/^\d+$/.test(id)) runSteamUrl(`steam://url/CommunityFilePage/${id}`, config);
}

async function syncWorkshopItems(workshopIds, config) {
  const ids = [...new Set(workshopIds.map((id) => String(id).trim()).filter(Boolean))].slice(0, 5);
  if (!ids.length) return { requested: 0 };
  await ensureSteamClient(config);
  for (const id of ids) {
    openWorkshopPage(id, config);
    await sleep(400);
  }
  return { requested: ids.length };
}

module.exports = {
  resolveSteamExe,
  ensureSteamClient,
  openWorkshopPage,
  syncWorkshopItems,
};
