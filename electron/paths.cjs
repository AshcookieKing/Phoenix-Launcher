const fs = require('fs');
const path = require('path');

const ARMA_APP_ID = '107410';

// Поиск стандартных путей установки Steam на дисках без использования reg.exe (без скрытых дочерних процессов)
function findSteamRoots() {
  const candidates = [];
  const p86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const p = process.env.ProgramFiles || 'C:\\Program Files';
  candidates.push(path.join(p86, 'Steam'));
  candidates.push(path.join(p, 'Steam'));
  for (const drive of ['C', 'D', 'E', 'F', 'G']) {
    candidates.push(`${drive}:\\Steam`);
    candidates.push(`${drive}:\\SteamLibrary`);
    candidates.push(`${drive}:\\Games\\Steam`);
    candidates.push(`${drive}:\\Games\\SteamLibrary`);
  }
  return candidates.filter((d) => {
    try {
      return fs.existsSync(d);
    } catch {
      return false;
    }
  });
}

async function readRegistryPaths() {
  // Для обратной совместимости: возвращаем найденный на диске путь Steam без вызова reg.exe
  const roots = findSteamRoots();
  return { steamPath: roots[0] || undefined, armaPath: undefined };
}

function parseLibraryFolders(steamPath) {
  const libs = [steamPath];
  const vdf = path.join(steamPath, 'steamapps', 'libraryfolders.vdf');
  let text;
  try {
    text = fs.readFileSync(vdf, 'utf8');
  } catch {
    return libs;
  }
  const re = /"path"\s+"([^"]+)"/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    let p = m[1].replace(/\\\\/g, '\\');
    if (fs.existsSync(p) && !libs.includes(p)) libs.push(p);
  }
  return libs;
}

function findWorkshopDir(steamLibraries) {
  for (const lib of steamLibraries) {
    const workshop = path.join(lib, 'steamapps', 'workshop', 'content', ARMA_APP_ID);
    if (fs.existsSync(workshop)) {
      return {
        workshopDir: workshop,
        acfPath: path.join(lib, 'steamapps', 'workshop', 'appworkshop_107410.acf'),
        steamPath: lib,
      };
    }
  }
  return null;
}

function findArmaInstall(steamLibraries) {
  for (const lib of steamLibraries) {
    const armaDir = path.join(lib, 'steamapps', 'common', 'Arma 3');
    const exe = path.join(armaDir, 'arma3_x64.exe');
    if (fs.existsSync(exe)) {
      return {
        armaExe: exe,
        armaProfilingExe: path.join(armaDir, 'arma3_x64_profiling.exe'),
        armaDir,
      };
    }
  }
  return null;
}

function derivePathsFromArmaExe(armaExe) {
  if (!String(armaExe || '').trim()) {
    return { armaExe: '', steamPath: '', workshopDir: '', acfPath: '', armaDir: '' };
  }
  const normalized = path.normalize(String(armaExe).trim());
  const lower = normalized.toLowerCase();
  const marker = `${path.sep}steamapps${path.sep}common${path.sep}`;
  const idx = lower.lastIndexOf(marker);
  if (idx === -1) {
    return {
      armaExe: normalized,
      armaDir: path.dirname(normalized),
      steamPath: '',
      workshopDir: '',
      acfPath: '',
    };
  }
  const libraryRoot = normalized.slice(0, idx);
  const steamapps = path.join(libraryRoot, 'steamapps');
  return {
    armaExe: normalized,
    armaDir: path.dirname(normalized),
    steamPath: libraryRoot,
    workshopDir: path.join(steamapps, 'workshop', 'content', ARMA_APP_ID),
    acfPath: path.join(steamapps, 'workshop', `appworkshop_${ARMA_APP_ID}.acf`),
  };
}

function derivePathsFromSteamLibrary(libraryRoot) {
  if (!String(libraryRoot || '').trim()) return { steamPath: '', workshopDir: '', acfPath: '', armaExe: '' };
  const root = path.normalize(String(libraryRoot).trim());
  const steamapps = path.join(root, 'steamapps');
  const armaExe = path.join(steamapps, 'common', 'Arma 3', 'arma3_x64.exe');
  return {
    steamPath: root,
    workshopDir: path.join(steamapps, 'workshop', 'content', ARMA_APP_ID),
    acfPath: path.join(steamapps, 'workshop', `appworkshop_${ARMA_APP_ID}.acf`),
    armaExe: fs.existsSync(armaExe) ? armaExe : '',
    armaDir: fs.existsSync(armaExe) ? path.dirname(armaExe) : '',
  };
}

function validateGamePaths({ armaExe, workshopDir } = {}) {
  const errors = [];
  const exe = String(armaExe || '').trim();
  const workshop = String(workshopDir || '').trim();
  if (!exe || !fs.existsSync(exe)) {
    errors.push('Укажите существующий файл arma3_x64.exe');
  } else if (!/^arma3_x64(_profiling)?\.exe$/i.test(path.basename(exe))) {
    errors.push('Нужен файл arma3_x64.exe (или profiling)');
  }
  const expected = derivePathsFromArmaExe(exe).workshopDir;
  const isDerived = workshop && expected && path.relative(expected, workshop) === '';
  let validWorkshop = false;
  try {
    const stat = workshop ? fs.statSync(workshop, { throwIfNoEntry: false }) : undefined;
    validWorkshop = stat ? stat.isDirectory() : Boolean(isDerived);
  } catch {}
  if (!validWorkshop) {
    errors.push('Укажите папку Workshop модов Arma 3');
  }
  return { valid: errors.length === 0, errors };
}

function collectSteamLibraries() {
  const libraries = [];
  const addLib = (root) => {
    if (!root || !fs.existsSync(root)) return;
    for (const lib of parseLibraryFolders(root)) {
      if (!libraries.includes(lib)) libraries.push(lib);
    }
  };
  for (const root of findSteamRoots()) {
    addLib(root);
  }
  return libraries;
}

async function detectGamePaths() {
  const libraries = collectSteamLibraries();
  const arma = findArmaInstall(libraries);
  const armaExe = arma?.armaExe || '';
  const derived = derivePathsFromArmaExe(armaExe);
  const workshop = derived.workshopDir ? derived : findWorkshopDir(libraries);

  return {
    armaExe,
    steamPath: workshop?.steamPath || '',
    workshopDir: workshop?.workshopDir || '',
    acfPath: workshop?.acfPath || '',
    armaDir: armaExe ? path.dirname(armaExe) : '',
    libraries,
  };
}

async function autoResolvePaths(stored = {}) {
  // Если путь к игре уже сохранен и файл существует — работаем мгновенно без сканирования дисков
  const storedExe = stored.armaExe && fs.existsSync(stored.armaExe) ? stored.armaExe : '';
  if (storedExe) {
    const derived = derivePathsFromArmaExe(storedExe);
    const storedWorkshop = stored.workshopDir && fs.existsSync(stored.workshopDir) ? stored.workshopDir : '';
    const storedSteam = stored.steamPath && fs.existsSync(stored.steamPath) ? stored.steamPath : '';
    const workshopDir = storedWorkshop || derived.workshopDir;
    const steamPath = storedSteam || derived.steamPath;
    const acfPath = workshopManifestPath(workshopDir) ||
      (steamPath ? path.join(steamPath, 'steamapps', 'workshop', `appworkshop_${ARMA_APP_ID}.acf`) : '');

    return {
      steamPath,
      workshopDir,
      acfPath,
      armaExe: storedExe,
      armaProfilingExe: path.join(path.dirname(storedExe), 'arma3_x64_profiling.exe'),
      armaDir: path.dirname(storedExe),
      libraries: steamPath ? [steamPath] : [],
      suggestedSteamPath: steamPath,
    };
  }

  // Если пути не сохранены — ищем в стандартных библиотеках Steam на диске
  const detected = await detectGamePaths();
  const armaExe = detected.armaExe;
  const derived = derivePathsFromArmaExe(armaExe);
  const workshopDir = derived.workshopDir || detected.workshopDir;
  const steamPath = derived.steamPath || detected.steamPath;
  const acfPath = workshopManifestPath(workshopDir) ||
    (steamPath ? path.join(steamPath, 'steamapps', 'workshop', `appworkshop_${ARMA_APP_ID}.acf`) : '');

  return {
    steamPath,
    workshopDir,
    acfPath,
    armaExe,
    armaProfilingExe: armaExe ? path.join(path.dirname(armaExe), 'arma3_x64_profiling.exe') : undefined,
    armaDir: armaExe ? path.dirname(armaExe) : '',
    libraries: detected.libraries,
    suggestedSteamPath: detected.steamPath || '',
  };
}

function workshopManifestPath(contentDir) {
  if (!contentDir || path.basename(contentDir) !== ARMA_APP_ID) return '';
  const content = path.dirname(contentDir);
  if (path.basename(content).toLowerCase() !== 'content') return '';
  const workshop = path.dirname(content);
  if (path.basename(workshop).toLowerCase() !== 'workshop') return '';
  return path.join(workshop, `appworkshop_${ARMA_APP_ID}.acf`);
}

module.exports = {
  ARMA_APP_ID,
  readRegistryPaths,
  parseLibraryFolders,
  autoResolvePaths,
  detectGamePaths,
  collectSteamLibraries,
  derivePathsFromArmaExe,
  derivePathsFromSteamLibrary,
  validateGamePaths,
  workshopManifestPath,
};
