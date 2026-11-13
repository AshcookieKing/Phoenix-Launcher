const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { setTimeout: sleep } = require('node:timers/promises');
const { readRegistryPaths } = require('./paths.cjs');

async function resolveSteamExe(config) {
  const steamPath = String(config?.steamPath || '').trim();
  if (steamPath) {
    const exe = path.join(steamPath, 'steam.exe');
    if (fs.existsSync(exe)) return exe;
  }
  const { steamPath: clientPath } = await readRegistryPaths();
  const defaults = [
    clientPath && path.join(clientPath, 'steam.exe'),
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

async function ensureSteamClient(config, signal) {
  if (isSteamRunning()) return true;
  const steamExe = await resolveSteamExe(config);
  if (!steamExe) return false;
  signal?.throwIfAborted();
  const started = await new Promise((resolve) => {
    const child = spawn(steamExe, ['-silent'], { detached: true, stdio: 'ignore', windowsHide: true });
    child.once('error', () => resolve(false));
    child.once('spawn', () => { child.unref(); resolve(true); });
  });
  if (!started) return false;
  await sleep(5000, undefined, { signal });
  return true;
}

module.exports = {
  resolveSteamExe,
  ensureSteamClient,
};
