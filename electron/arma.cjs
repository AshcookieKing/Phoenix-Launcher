const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const https = require('https');
const { autoResolvePaths, ARMA_APP_ID, parseLibraryFolders, workshopManifestPath } = require('./paths.cjs');

const PERFORMANCE_PRESETS = {
  low: { cpuCount: 4, exThreads: 2, maxMem: 4096, maxVram: 1024, hugePages: false },
  medium: { cpuCount: 8, exThreads: 4, maxMem: 8192, maxVram: 2048, hugePages: false },
  high: { cpuCount: 12, exThreads: 5, maxMem: 16384, maxVram: 3072, hugePages: false },
  ultra: { cpuCount: 16, exThreads: 7, maxMem: 32768, maxVram: 4096, hugePages: false },
};

/** Параметры, которые ломают сцену главного меню Phoenix и часто дают Cannot load mipmap … noise_raw.paa */
const BANNED_LAUNCH_ARGS = new Set([
  '-skipintro',
  '-nosplash',
  '-world=empty',
  '-worldempty',
  '-nobattleye',
  '-hugepages',
]);

function performanceArgs(config) {
  const preset = PERFORMANCE_PRESETS[config.performancePreset] || PERFORMANCE_PRESETS.high;
  const cpu = config.cpuCount || preset.cpuCount;
  const mem = config.maxMem || preset.maxMem;
  const vram = config.maxVram || preset.maxVram;
  // Без -hugePages: на многих ПК без SeLockMemoryPrivilege процесс «висит» без окна
  return [
    '-cpuCount=' + cpu,
    '-exThreads=' + (config.exThreads || preset.exThreads),
    '-maxMem=' + mem,
    '-maxVram=' + vram,
    '-enableHT',
  ];
}

function normalizeArgKey(arg) {
  const raw = String(arg || '').trim();
  if (!raw) return '';
  const eq = raw.indexOf('=');
  const key = (eq >= 0 ? raw.slice(0, eq) : raw).toLowerCase();
  return key.startsWith('-') ? key : `-${key}`;
}

function isBannedLaunchArg(arg, { allowNoSplash = false } = {}) {
  const key = normalizeArgKey(arg);
  if (!key) return true;
  if (key === '-nosplash') return !allowNoSplash;
  if (key === '-world' && /=?\s*empty$/i.test(String(arg).replace(/\s+/g, ''))) return true;
  if (BANNED_LAUNCH_ARGS.has(key)) return true;
  if (key === '-world' && String(arg).toLowerCase().includes('empty')) return true;
  return false;
}

function sanitizeExtraArgs(extra, { allowNoSplash = false } = {}) {
  const parts = String(extra || '')
    .split(/\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.filter((a) => !isBannedLaunchArg(a, { allowNoSplash }));
}

// Отдельные exe ветки Steam «profiling» (диагностическая сборка). Основной arma3_x64.exe этой ветки — сборка «performance».
const PROFILING_EXES = ['arma3_x64_profiling.exe', 'arma3profiling_x64.exe'];

function profilingExe(config) {
  const dir = path.dirname(config.armaExe || '');
  for (const name of PROFILING_EXES) {
    const p = path.join(dir, name);
    if (fs.existsSync(p)) return p;
  }
  return '';
}

// Ветка Steam, на которой стоит Arma 3 (BetaKey в appmanifest_107410.acf): '' — основная, 'profiling', 'development'…
function armaBranch(config) {
  try {
    const manifest = path.join(path.dirname(config.armaExe || ''), '..', '..', 'appmanifest_107410.acf');
    const text = fs.readFileSync(manifest, 'utf8');
    const mounted = text.split('"MountedConfig"')[1] || '';
    const m = /"BetaKey"\s+"([^"]*)"/.exec(mounted);
    return m ? m[1] : '';
  } catch {
    return '';
  }
}

function resolveArmaExe(config) {
  const base = config.armaExe;
  const profiling = profilingExe(config);
  // Phoenix: profiling-exe, если Steam его поставил; выключается в настройках
  if ((config.profilingLaunch !== false || config.optimizedLaunch === true) && profiling) return profiling;
  if (fs.existsSync(base)) return base;
  if (profiling) return profiling;
  return base;
}

function profilingAvailable(config) {
  return Boolean(profilingExe(config));
}

function removeSteamAppId(armaDir) {
  // steam_appid.txt в Steam-установке Arma ломает запуск: процесс висит без окна
  try {
    const file = path.join(armaDir, 'steam_appid.txt');
    if (fs.existsSync(file)) fs.unlinkSync(file);
  } catch {
    /* ignore */
  }
}

async function ensureSteamRunning(config, signal) {
  try {
    const { ensureSteamClient } = require('./steam-workshop.cjs');
    await ensureSteamClient(config, signal);
  } catch {
    /* ignore */
  }
}

function syncWorkshopWithArma(config) {
  const result = { modFolders: 0, installedIds: [] };
  if (!fs.existsSync(config.workshopDir)) return result;
  try {
    const ids = fs.readdirSync(config.workshopDir).filter((id) => /^\d+$/.test(id));
    result.modFolders = ids.length;
    result.installedIds = ids;
  } catch {}
  if (fs.existsSync(config.acfPath)) {
    result.acfMtime = fs.statSync(config.acfPath).mtimeMs;
  }
  return result;
}

function workshopLocations(config) {
  const locations = new Map();
  const add = (contentDir, acfPath) => {
    if (contentDir && !locations.has(contentDir)) locations.set(contentDir, acfPath);
  };
  add(config.workshopDir, workshopManifestPath(config.workshopDir) || config.acfPath);
  const libraries = config.steamPath ? parseLibraryFolders(config.steamPath) : [];
  for (const lib of [...libraries, ...(config.libraries || [])]) {
    const contentDir = path.join(lib, 'steamapps', 'workshop', 'content', ARMA_APP_ID);
    add(contentDir, workshopManifestPath(contentDir));
  }
  return locations;
}

function locateModFolder(workshopId, config) {
  for (const [contentDir, acfPath] of workshopLocations(config)) {
    const folder = path.join(contentDir, workshopId);
    if (fs.existsSync(folder)) return { folder, acfPath };
  }
  return null;
}

// В ACF только WorkshopItemsInstalled описывает установленные файлы.
// WorkshopItemDetails может содержать целевой манифест ещё до окончания загрузки.
function readWorkshopManifest(file) {
  if (!file) return {};
  try {
    const text = fs.readFileSync(file, 'utf8');
    const tokens = text.match(/"(?:\\.|[^"\\])*"|[{}]/g) || [];
    let i = 0;
    function section() {
      const fields = Object.create(null);
      while (i < tokens.length && tokens[i] !== '}') {
        const key = tokens[i++].slice(1, -1);
        const value = tokens[i++];
        fields[key] = value === '{' ? section() : value.slice(1, -1);
      }
      i++;
      return fields;
    }
    return section().AppWorkshop || {};
  } catch {
    return {};
  }
}

function findModRoot(workshopFolder) {
  const queue = [workshopFolder];
  let hasFiles = false;
  for (let depth = 0; depth < 5 && queue.length; depth++) {
    const levelCount = queue.length;
    for (let i = 0; i < levelCount; i++) {
      const dir = queue.shift();
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const child = path.join(dir, entry.name);
          if (entry.name.toLowerCase() === 'addons' && (entry.isDirectory() || entry.isSymbolicLink()) &&
              fs.readdirSync(child).length) return dir;
          if (entry.isDirectory()) {
            queue.push(child);
          } else if (entry.isFile() || entry.isSymbolicLink()) {
            hasFiles = true;
          }
        }
      } catch {}
    }
  }
  // Расширения, композиции и старые форматы Workshop могут поставляться без addons.
  return hasFiles ? workshopFolder : null;
}

// ACF и GetItemInstallInfo сообщают суммарный размер файлов. Читаем только
// метаданные; дополнительные файлы игрока не делают установленный мод устаревшим.
async function hasInstalledBytes(folder, expectedSize) {
  const pending = [folder];
  const visited = new Set();
  let bytes = 0;
  try {
    while (pending.length) {
      const dir = await fs.promises.realpath(pending.pop());
      if (visited.has(dir)) continue;
      visited.add(dir);
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });
      const files = [];
      for (const entry of entries) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) pending.push(file);
        else if (entry.isSymbolicLink()) {
          const stat = await fs.promises.stat(file).catch(() => null);
          if (stat?.isDirectory()) pending.push(file);
          else if (stat?.isFile()) bytes += stat.size;
        } else if (entry.isFile()) files.push(file);
      }
      for (let i = 0; i < files.length && bytes < expectedSize; i += 64) {
        const stats = await Promise.all(files.slice(i, i + 64).map((file) => fs.promises.stat(file)));
        for (const stat of stats) bytes += stat.size;
      }
      if (bytes >= expectedSize) return true;
    }
  } catch {
    // Steam мог заменить файл прямо во время проверки.
  }
  return false;
}

function fetchSteamFileDetails(ids) {
  return new Promise((resolve) => {
    if (!ids.length) return resolve({});
    const body = new URLSearchParams();
    body.set('itemcount', String(ids.length));
    ids.forEach((id, i) => body.set(`publishedfileids[${i}]`, id));

    const req = https.request(
      {
        hostname: 'api.steampowered.com',
        path: '/ISteamRemoteStorage/GetPublishedFileDetails/v1/',
        method: 'POST',
        signal: AbortSignal.timeout(8000),
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body.toString()),
        },
      },
      (res) => {
        let data = '';
        res.on('error', () => resolve({}));
        res.on('aborted', () => resolve({}));
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const out = {};
            for (const item of json?.response?.publishedfiledetails || []) {
              out[item.publishedfileid] = {
                title: item.title,
                timeUpdated: parseInt(item.time_updated, 10) || 0,
              };
            }
            resolve(out);
          } catch {
            resolve({});
          }
        });
      }
    );
    req.on('error', () => resolve({}));
    req.write(body.toString());
    req.end();
  });
}

let remoteCache = { key: '', at: 0, details: {} };

async function checkMods(mods, config, { force = false, localOnly = false, items } = {}) {
  const locations = workshopLocations(config);
  const manifests = new Map();
  function manifestFor(file) {
    if (!manifests.has(file)) manifests.set(file, readWorkshopManifest(file));
    return manifests.get(file);
  }
  let remote = {};
  if (!localOnly && mods.length) {
    const ids = mods.map((m) => m.workshopId);
    const key = ids.join(',');
    if (force || remoteCache.key !== key || Date.now() - remoteCache.at >= 300000) {
      remote = await fetchSteamFileDetails(ids);
      remoteCache = { key, at: Date.now(), details: remote };
    } else remote = remoteCache.details;
  }

  const results = [];
  for (const mod of mods) {
    const id = String(mod.workshopId);
    const info = items?.get(id);
    const title = remote[id]?.title;
    const remoteTime = remote[id]?.timeUpdated || 0;
    let result = { ...mod, name: mod.name || title || id, title, remoteTime, localTime: 0,
      folder: config.workshopDir ? path.join(config.workshopDir, id) : '', path: null, status: 'missing' };
    // Ответ работающего Steam относится к одной конкретной установке.
    const candidates = info?.folder
      ? [[path.dirname(info.folder), workshopManifestPath(path.dirname(info.folder)) || locations.get(path.dirname(info.folder))]]
      : locations;
    for (const [contentDir, acfPath] of candidates) {
      const folder = info?.folder || path.join(contentDir, id);
      const manifest = manifestFor(acfPath);
      const installed = manifest.WorkshopItemsInstalled?.[id];
      const detail = manifest.WorkshopItemDetails?.[id] || {};
      if (!info?.ready && !installed) continue;
      // После DONE Steam может ещё не записать новый ACF на диск.
      const size = Number(info?.size) || Number(installed?.size) || 1;
      const modPath = findModRoot(folder);
      if (!modPath || !(await hasInstalledBytes(folder, Math.max(1, size)))) continue;
      const localTime = Number(info?.stamp) || Number(installed?.timeupdated) || 0;
      const target = detail.latest_manifest && detail.latest_manifest !== '0' ? detail.latest_manifest : detail.manifest;
      const targetTime = Number(detail.latest_timeupdated) || Number(detail.timeupdated) || 0;
      const staleTime = targetTime > localTime || remoteTime > localTime + 120;
      const staleManifest = target && target !== '0' && target !== installed?.manifest;
      const downloading = Number(detail.BytesDownloaded || 0) < Number(detail.BytesToDownload || 0);
      const outdated = info?.ready
        ? Number(info.stamp) > 0 && staleTime
        : info?.ready === false || staleTime || staleManifest || downloading;
      result = { ...result, folder, path: modPath, localTime, status: outdated ? 'outdated' : 'ok' };
      if (!outdated) break;
    }
    results.push(result);
  }
  return results;
}

function buildModParam(modResults) {
  return modResults
    .filter((m) => m.status !== 'missing' && m.path)
    .map((m) => m.path)
    .join(';');
}

function buildLaunchArgs(config, modParam) {
  const allowNoSplash = config.skipLogos === true;
  const args = [];

  // Логотипы BI: только по явному флагу. Оптимизированный запуск их НЕ пропускает.
  if (allowNoSplash) args.push('-noSplash');

  // Perf-флаги только при «Оптимизированный запуск» — иначе лишние -maxMem/-cpuCount
  // иногда дают долгий чёрный экран / «висящий» процесс без окна
  if (config.optimizedLaunch === true) {
    args.push('-noPause', ...performanceArgs(config));
  } else {
    // безопасные флаги по умолчанию: все ядра, лимит памяти (не больше 3/4 ОЗУ ПК)
    const ramMb = Math.floor(require('os').totalmem() / 1048576);
    args.push('-enableHT', '-maxMem=' + Math.max(2048, Math.min(16384, Math.floor(ramMb * 0.75))));
  }
  // без записи RPT-лога каждый кадр; config.keepLogs = true - оставить лог (для разбора вылетов)
  if (config.keepLogs !== true) args.push('-noLogs');

  const mode = config.screenMode || 'borderless';
  if (mode === 'windowed') args.push('-window');
  else if (mode === 'fullscreen') args.push('-fullscreen');
  else args.push('-noBorder');

  if (modParam) args.push(`-mod=${modParam}`);
  const name = String(config.playerName || config.armaProfileName || '').trim();
  if (name) args.push(`-name=${name}`);

  // Автоподключение пропускает главное меню и интро → noise_raw.paa и «нет интро».
  // По умолчанию запускаем в меню; -connect только если включено в настройках.
  const autoConnect = config.autoConnectServer === true;
  if (autoConnect && config.serverHost) {
    args.push(`-connect=${config.serverHost}`);
    if (config.serverPort) args.push(`-port=${config.serverPort}`);
    const password = String(config.serverPassword || '').trim();
    if (password) args.push(`-password=${password}`);
  }

  args.push(...sanitizeExtraArgs(config.extraLaunchArgs, { allowNoSplash }));

  // Финальная страховка от запрещённых флагов (в т.ч. из старых пресетов)
  return args.filter((a) => !isBannedLaunchArg(a, { allowNoSplash }));
}

async function launchGame(config, modParam, signal) {
  const armaExe = resolveArmaExe(config);
  if (!fs.existsSync(armaExe)) {
    throw new Error('Arma 3 не найдена. Установите игру через Steam.');
  }
  const armaDir = path.dirname(armaExe);
  removeSteamAppId(armaDir);
  await ensureSteamRunning(config, signal);
  signal?.throwIfAborted();

  const args = buildLaunchArgs(config, modParam);

  return new Promise((resolve, reject) => {
    // Без windowsHide — иначе GUI иногда не появляется и процесс «висит» в фоне
    const child = spawn(armaExe, args, {
      cwd: armaDir,
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
      env: {
        ...process.env,
        SteamAppId: String(ARMA_APP_ID),
        SteamGameId: String(ARMA_APP_ID),
      },
    });

    child.on('error', (err) => {
      reject(new Error(err?.message || 'Не удалось запустить Arma 3'));
    });

    const pid = child.pid;
    if (!pid) {
      reject(new Error('Arma 3 не стартовала (нет PID)'));
      return;
    }
    child.unref();
    resolve({
      ok: true,
      exe: path.basename(armaExe),
      pid,
      viaSteam: false,
      args,
    });
  });
}

module.exports = {
  autoResolvePaths,
  syncWorkshopWithArma,
  resolveArmaExe,
  checkMods,
  buildModParam,
  buildLaunchArgs,
  launchGame,
  findModRoot,
  locateModFolder,
  ARMA_APP_ID,
  PERFORMANCE_PRESETS,
  profilingAvailable,
  armaBranch,
};
