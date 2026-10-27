const { app, BrowserWindow, ipcMain, shell, Notification, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const Store = require('electron-store');
const { loadPreset, resolvePresetPath } = require('./preset.cjs');
const { derivePathsFromArmaExe, validateGamePaths, detectGamePaths, ARMA_APP_ID } = require('./paths.cjs');
const arma = require('./arma.cjs');
const { prepareAndLaunch } = require('./launch.cjs');
const { listPlayerProfiles } = require('./arma-profiles.cjs');
const { queryServer } = require('./a2s.cjs');
const { getSteamUser } = require('./steam-user.cjs');
const { getMenuRoles, startMenuPair, unlinkMenu } = require('./phx-api.cjs');
const { createUpdater } = require('./updater.cjs');
const { SERVERS, LINKS } = require('./phx-config.cjs');
const { connectTeamSpeak, ensureTeamSpeak, ensureTfarPlugin, ts3Running } = require('./teamspeak.cjs');

const APP_VERSION = require('../package.json').version;
const UPDATE_CHECK_MS = 6 * 3600 * 1000;
let updater = null;

// Phoenix Launcher — отдельное хранилище, не пересекается со StarFront
app.setName('PhoenixLauncher');

const STORE_KEYS = new Set([
  'armaExe', 'steamPath', 'workshopDir', 'pathsConfigured', 'presetPath',
  'autoUpdate', 'screenMode', 'optimizedLaunch', 'profilingLaunch', 'keepLogs', 'tsAutoConnect', 'performancePreset', 'extraLaunchArgs', 'skipLogos',
  'activeProfileId', 'playerName', 'selectedServer', 'soundsEnabled', 'minimizeOnLaunch', 'animationsEnabled',
]);

const store = new Store({
  name: 'phoenix-launcher',
  defaults: {
    armaExe: '',
    steamPath: '',
    workshopDir: '',
    pathsConfigured: false,
    presetPath: '',
    screenMode: 'borderless',
    optimizedLaunch: false,
    // Phoenix: игра запускается profiling-сборкой (arma3_x64_profiling.exe, ветка Steam «profiling»)
    profilingLaunch: true,
    // обновления лаунчера из релизов GitHub: проверка при запуске и раз в 6 ч, скачивание в фоне
    autoUpdate: true,
    keepLogs: false,
    tsAutoConnect: true,
    performancePreset: 'high',
    extraLaunchArgs: '',
    skipLogos: false,
    activeProfileId: '',
    playerName: '',
    selectedServer: 'farabad',
    soundsEnabled: true,
    minimizeOnLaunch: true,
    animationsEnabled: true,
  },
});
// 1.2.4: TeamSpeak перед игрой включён по умолчанию, но electron-store уже записал старое значение по умолчанию (false)
// в phoenix-launcher.json - один раз включаем; выключенное потом вручную сохраняется
if (!store.get('tsAutoConnectMigrated')) {
  store.set('tsAutoConnect', true);
  store.set('tsAutoConnectMigrated', true);
}

let mainWindow = null;
let cachedMods = [];
let cachedPaths = null;
let pathsResolvedAt = 0;
let serversState = {};
let serverPollTimer = null;
let gameWatchTimer = null;
let pairPollTimer = null;
let armaRunningCache = { at: 0, value: false };
let appQuitting = false;

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function isArmaRunning(force = false) {
  if (!force && Date.now() - armaRunningCache.at < 4000) return armaRunningCache.value;
  let running = false;
  try {
    const out = execSync('tasklist /FO CSV /NH', { encoding: 'utf8', windowsHide: true }).toLowerCase();
    running = ['arma3_x64.exe', 'arma3_x64_profiling.exe', 'arma3profiling_x64.exe', 'arma3.exe'].some((exe) => out.includes(`"${exe}"`));
  } catch {}
  armaRunningCache = { at: Date.now(), value: running };
  return running;
}

function isPidRunning(pid) {
  if (!pid) return false;
  try {
    return execSync(`tasklist /FI "PID eq ${pid}" /NH`, { encoding: 'utf8', windowsHide: true }).includes(String(pid));
  } catch {
    return false;
  }
}

function watchGameProcess(pid) {
  if (gameWatchTimer) clearInterval(gameWatchTimer);
  let seenRunning = false;
  const startedAt = Date.now();
  gameWatchTimer = setInterval(() => {
    const running = isPidRunning(pid) || isArmaRunning(true);
    if (running && !seenRunning) {
      seenRunning = true;
      send('launch-running');
    }
    if (seenRunning && !running) {
      clearInterval(gameWatchTimer);
      gameWatchTimer = null;
      send('launch-reset');
      if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) mainWindow.show();
      return;
    }
    if (!seenRunning && Date.now() - startedAt > 120000) {
      clearInterval(gameWatchTimer);
      gameWatchTimer = null;
      send('launch-reset');
    }
  }, 4000);
}

// --- Пути к игре ---

function buildPathPayload(resolved) {
  const armaExe = store.get('armaExe') || resolved.armaExe || '';
  const steamPath = store.get('steamPath') || resolved.steamPath || '';
  const workshopDir = store.get('workshopDir') || resolved.workshopDir || '';
  const acfPath =
    resolved.acfPath || (steamPath ? path.join(steamPath, 'steamapps', 'workshop', `appworkshop_${ARMA_APP_ID}.acf`) : '');
  const validation = validateGamePaths({ armaExe, workshopDir });
  return { armaExe, steamPath, workshopDir, acfPath, pathsValid: validation.valid, pathErrors: validation.errors };
}

async function ensurePaths(force = false) {
  if (!force && cachedPaths && Date.now() - pathsResolvedAt < 60000) return cachedPaths;
  const resolved = await arma.autoResolvePaths({
    armaExe: store.get('armaExe'),
    steamPath: store.get('steamPath'),
    workshopDir: store.get('workshopDir'),
  });
  cachedPaths = buildPathPayload(resolved);
  // Первый запуск: если Steam и Arma нашлись сами — сразу сохраняем
  if (!store.get('pathsConfigured') && cachedPaths.pathsValid) {
    store.set('armaExe', cachedPaths.armaExe);
    store.set('steamPath', cachedPaths.steamPath);
    store.set('workshopDir', cachedPaths.workshopDir);
    store.set('pathsConfigured', true);
  }
  pathsResolvedAt = Date.now();
  return cachedPaths;
}

function getConfig() {
  const p = cachedPaths || {};
  return {
    armaExe: store.get('armaExe') || p.armaExe,
    steamPath: store.get('steamPath') || p.steamPath,
    workshopDir: store.get('workshopDir') || p.workshopDir,
    acfPath: p.acfPath,
    playerName: store.get('playerName'),
    screenMode: store.get('screenMode') || 'borderless',
    optimizedLaunch: store.get('optimizedLaunch') === true,
    profilingLaunch: store.get('profilingLaunch') !== false,
    keepLogs: store.get('keepLogs') === true,
    tsAutoConnect: store.get('tsAutoConnect') !== false,
    performancePreset: store.get('performancePreset') || 'high',
    extraLaunchArgs: store.get('extraLaunchArgs'),
    skipLogos: store.get('skipLogos') === true,
  };
}

// --- Пресет модов ---

function getPresetPath() {
  const custom = store.get('presetPath');
  if (custom && fs.existsSync(custom)) return custom;
  return resolvePresetPath({ cwd: process.cwd(), resources: process.resourcesPath, dirname: __dirname });
}

function loadModsList() {
  const presetPath = getPresetPath();
  if (!fs.existsSync(presetPath)) throw new Error(`Пресет не найден: ${presetPath}`);
  cachedMods = loadPreset(presetPath);
  return cachedMods;
}

function settingsPayload() {
  const p = cachedPaths || {};
  return {
    ...store.store,
    appVersion: APP_VERSION,
    presetPath: getPresetPath(),
    customPreset: Boolean(store.get('presetPath')),
    modCount: cachedMods.length,
    paths: p,
    pathsValid: p.pathsValid === true,
    pathErrors: p.pathErrors || [],
    profilingInstalled: Boolean(p.armaExe) && arma.profilingAvailable({ armaExe: p.armaExe }),
    armaBranch: p.armaExe ? arma.armaBranch({ armaExe: p.armaExe }) : '',
    profiles: listPlayerProfiles().slice(0, 30),
    servers: SERVERS,
    links: LINKS,
  };
}

// --- Онлайн серверов (A2S) ---

async function pollServers() {
  const results = await Promise.all(SERVERS.map((s) => queryServer(s.host, s.queryPort)));
  SERVERS.forEach((s, i) => {
    serversState[s.id] = results[i];
  });
  send('servers-update', serversState);
  return serversState;
}

function startServerPolling() {
  if (serverPollTimer) clearInterval(serverPollTimer);
  pollServers().catch(() => {});
  serverPollTimer = setInterval(() => pollServers().catch(() => {}), 10000);
}

// --- Аккаунт: Steam + роли меню Phoenix ---

async function getAccount(force = false) {
  const steam = await getSteamUser({ force });
  if (!steam) return { steam: null, roles: null };
  const roles = await getMenuRoles(steam.steamId);
  return {
    steam: { steamId: steam.steamId, personaName: steam.personaName || steam.accountName },
    roles,
  };
}

function stopPairPolling() {
  if (pairPollTimer) clearInterval(pairPollTimer);
  pairPollTimer = null;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 760,
    minWidth: 1100,
    minHeight: 680,
    frame: false,
    show: !process.env.PHX_SELFTEST,
    backgroundColor: '#140604',
    icon: path.join(__dirname, '..', 'public', 'assets', 'phoenix_emblem.png'),
    title: 'Phoenix Launcher',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.PHX_SELFTEST) require('./selftest.cjs').runSelfTest(app, mainWindow, process.env.PHX_SELFTEST);

  const devUrl = process.env.VITE_DEV_SERVER_URL;
  if (devUrl) mainWindow.loadURL(devUrl);
  else mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));

  // Ссылки из интерфейса — только во внешнем браузере
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('close', (event) => {
    if (appQuitting || !isArmaRunning(true)) return;
    event.preventDefault();
    mainWindow.hide();
  });
}

// Один экземпляр: повторный запуск exe возвращает спрятанное окно (пока идёт игра)
// самопроверка (PHX_SELFTEST) идёт и рядом с открытым лаунчером
if (!process.env.PHX_SELFTEST && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (!mainWindow.isVisible()) mainWindow.show();
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
}

app.whenReady().then(async () => {
  try {
    loadModsList();
  } catch (e) {
    console.error(e);
  }
  await ensurePaths();
  createWindow();
  mainWindow.webContents.once('did-finish-load', () => startServerPolling());
  updater = createUpdater({
    appVersion: APP_VERSION,
    onStatus: (s) => mainWindow?.webContents.send('update-status', s),
    isAutoEnabled: () => store.get('autoUpdate') !== false,
  });
  if (!process.env.PHX_SELFTEST) {
    setTimeout(() => updater.check(), 5000);
    setInterval(() => updater.check(), UPDATE_CHECK_MS);
  }
});

ipcMain.handle('get-update-status', () => updater?.getStatus() ?? { state: 'idle', current: APP_VERSION });
ipcMain.handle('check-update', () => updater?.check({ manual: true }));
ipcMain.handle('install-update', () => {
  appQuitting = true;
  return updater?.install(app) ?? { ok: false, error: 'Обновление недоступно' };
});

app.on('before-quit', () => {
  appQuitting = true;
  if (serverPollTimer) clearInterval(serverPollTimer);
  if (gameWatchTimer) clearInterval(gameWatchTimer);
  stopPairPolling();
});

app.on('window-all-closed', () => {
  if (!isArmaRunning(true)) app.quit();
});

// --- IPC ---

ipcMain.handle('get-settings', async () => {
  await ensurePaths();
  return settingsPayload();
});

ipcMain.handle('save-settings', async (_, next = {}) => {
  for (const [key, value] of Object.entries(next)) {
    if (value !== undefined && STORE_KEYS.has(key)) store.set(key, value);
  }
  if (next.extraLaunchArgs !== undefined) {
    store.set('extraLaunchArgs', String(next.extraLaunchArgs || '').trim());
  }
  if (next.activeProfileId !== undefined) {
    const prof = listPlayerProfiles().find((p) => p.id === next.activeProfileId);
    store.set('playerName', prof ? prof.displayName : '');
  }
  return settingsPayload();
});

ipcMain.handle('get-servers', async () => (Object.keys(serversState).length ? serversState : pollServers()));
ipcMain.handle('refresh-servers', () => pollServers());

ipcMain.handle('get-mods', () => {
  if (!cachedMods.length) loadModsList();
  return cachedMods;
});

ipcMain.handle('check-mods', async (_, { force = false } = {}) => {
  if (!cachedMods.length) loadModsList();
  await ensurePaths();
  const config = getConfig();
  if (!config.workshopDir) return cachedMods.map((m) => ({ ...m, status: 'missing' }));
  return arma.checkMods(cachedMods, config, { force });
});

ipcMain.handle('sync-mods', async (_, ids = []) => {
  await ensurePaths();
  await arma.openSteamSubscribe(ids, getConfig());
  return { ok: true, requested: ids.length };
});

ipcMain.handle('launch', async (event, { serverId = null } = {}) => {
  if (isArmaRunning(true)) {
    return { ok: false, error: 'Arma 3 уже запущена — закройте игру или переключитесь на неё.' };
  }
  if (!cachedMods.length) loadModsList();
  await ensurePaths();
  const server = serverId ? SERVERS.find((s) => s.id === serverId) : null;
  const progress = (percent, message) => event.sender.send('launch-progress', { percent, message });
  try {
    // TeamSpeak до игры (настройка «Подключаться к TeamSpeak при запуске игры»): ждём, пока клиент зайдёт на сервер,
    // иначе TFAR в игре стартует без TS. Не дождались (нет плагина ClientQuery / таймаут) - игра всё равно запускается.
    if (store.get('tsAutoConnect') !== false) {
      progress(1, 'Проверка плагина TFAR...');
      await checkTfarPlugin();
      progress(2, 'Запуск TeamSpeak...');
      const ts = await ensureTeamSpeak(LINKS.teamspeak, { onStep: (m) => progress(3, m) });
      if (ts.ok) progress(5, 'TeamSpeak подключён');
    }
    const result = await prepareAndLaunch({
      mods: cachedMods,
      config: getConfig(),
      server,
      onProgress: progress,
    });
    if (result.ok) {
      watchGameProcess(result.pid);
      if (store.get('minimizeOnLaunch') !== false) setTimeout(() => mainWindow?.minimize(), 800);
    }
    return result;
  } catch (e) {
    return { ok: false, error: e.message || 'Ошибка запуска' };
  }
});

ipcMain.handle('get-account', (_, { force = false } = {}) => getAccount(force));

// Привязка Discord к меню Phoenix: тот же путь, что у кнопки «Войти через Discord» в игре
ipcMain.handle('menu-pair-start', async () => {
  const steam = await getSteamUser({ force: true });
  if (!steam) return { ok: false, error: 'Не найден аккаунт Steam. Запустите Steam и войдите.' };
  const pair = await startMenuPair(steam.steamId);
  if (!pair.ok) return pair;
  shell.openExternal(pair.url);
  stopPairPolling();
  const started = Date.now();
  pairPollTimer = setInterval(async () => {
    if (Date.now() - started > pair.expiresIn * 1000) {
      stopPairPolling();
      send('pair-status', { status: 'expired' });
      return;
    }
    const roles = await getMenuRoles(steam.steamId);
    if (roles.ok && roles.linked && !roles.pending) {
      stopPairPolling();
      // ключ лаунчера для «Выйти из аккаунта» (по SteamID)
      store.set('menuTokens', { ...(store.get('menuTokens') || {}), [steam.steamId]: pair.token });
      send('pair-status', { status: 'linked' });
      send('account-update', {
        steam: { steamId: steam.steamId, personaName: steam.personaName || steam.accountName },
        roles,
      });
      if (Notification.isSupported()) {
        new Notification({ title: 'Phoenix Launcher', body: 'Discord привязан к меню Phoenix' }).show();
      }
    }
  }, 4000);
  return { ok: true, code: pair.code, url: pair.url };
});

// «Выйти из аккаунта»: удалить привязку Discord на сервере ролей (ключом, полученным при входе в лаунчере)
ipcMain.handle('menu-logout', async () => {
  const steam = await getSteamUser({ force: true });
  if (!steam) return { ok: false, error: 'Не найден аккаунт Steam.' };
  const tokens = store.get('menuTokens') || {};
  const token = tokens[steam.steamId];
  if (!token) return { ok: false, noToken: true };
  const res = await unlinkMenu(steam.steamId, token);
  if (res.ok || res.noToken) {
    delete tokens[steam.steamId];
    store.set('menuTokens', tokens);
  }
  if (res.ok) send('account-update', await getAccount(true));
  return res;
});

ipcMain.handle('menu-pair-cancel', () => {
  stopPairPolling();
  return { ok: true };
});

// Плагин TFAR в TeamSpeak 3: нет или устарел - ставим из мода TFAR (Steam Workshop 894678801)
const TFAR_WORKSHOP_ID = '894678801';
async function checkTfarPlugin() {
  const mod = arma.locateModFolder(TFAR_WORKSHOP_ID, getConfig());
  const pkg = mod ? path.join(mod.folder, 'teamspeak', 'task_force_radio.ts3_plugin') : '';
  const wasRunning = ts3Running();
  const res = ensureTfarPlugin(pkg);
  if (res.state === 'installed' && wasRunning) {
    await dialog.showMessageBox(mainWindow, { type: 'info', title: 'TeamSpeak 3', message: 'Плагин TFAR установлен',
      detail: 'Перезапустите TeamSpeak 3, чтобы рация в игре заработала.', buttons: ['OK'] });
  } else if (res.state === 'locked') {
    await dialog.showMessageBox(mainWindow, { type: 'warning', title: 'TeamSpeak 3', message: 'Плагин TFAR устарел',
      detail: 'Закройте TeamSpeak 3 и нажмите «Подключиться» ещё раз - лаунчер обновит плагин.', buttons: ['OK'] });
  }
  return res;
}

// TeamSpeak 3 сразу на сервере Phoenix; нет клиента - предложить скачать (askIfMissing)
async function tsConnect(askIfMissing = true) {
  const res = connectTeamSpeak(LINKS.teamspeak);
  if (res.ok || !askIfMissing) return res;
  const r = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: 'TeamSpeak 3',
    message: 'TeamSpeak 3 не найден',
    detail: `Рация в игре (TFAR) работает только с TeamSpeak 3. Установите его и нажмите кнопку ещё раз.
Сервер: ${LINKS.teamspeakHost}`,
    buttons: ['Скачать TeamSpeak 3', 'Закрыть'],
    defaultId: 0,
    cancelId: 1,
  });
  if (r.response === 0) shell.openExternal('https://www.teamspeak.com/en/downloads/#ts3client');
  return res;
}

ipcMain.handle('ts-connect', () => tsConnect(true));

ipcMain.handle('open-url', (_, url) => {
  if (/^(https?|steam|ts3server):\/\//i.test(String(url || ''))) shell.openExternal(url);
  return { ok: true };
});

ipcMain.handle('open-folder', (_, target) => {
  const p = String(target || '');
  if (p && fs.existsSync(p)) shell.openPath(p);
  return { ok: true };
});

ipcMain.handle('auto-detect-paths', async () => {
  const detected = await detectGamePaths();
  const validation = validateGamePaths(detected);
  if (!validation.valid) return { success: false, errors: validation.errors, ...detected };
  store.set('armaExe', detected.armaExe);
  store.set('steamPath', detected.steamPath);
  store.set('workshopDir', detected.workshopDir);
  store.set('pathsConfigured', true);
  await ensurePaths(true);
  return { success: true, settings: settingsPayload() };
});

ipcMain.handle('pick-arma-exe', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Выберите arma3_x64.exe',
    filters: [{ name: 'Arma 3', extensions: ['exe'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths?.[0]) return { success: false, canceled: true };
  const derived = derivePathsFromArmaExe(result.filePaths[0]);
  const validation = validateGamePaths(derived);
  if (!validation.valid) return { success: false, errors: validation.errors };
  store.set('armaExe', derived.armaExe);
  store.set('steamPath', derived.steamPath);
  store.set('workshopDir', derived.workshopDir);
  store.set('pathsConfigured', true);
  await ensurePaths(true);
  return { success: true, settings: settingsPayload() };
});

ipcMain.handle('pick-workshop-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Выберите папку Workshop модов Arma 3 (…\\workshop\\content\\107410)',
    properties: ['openDirectory'],
  });
  if (result.canceled || !result.filePaths?.[0]) return { success: false, canceled: true };
  store.set('workshopDir', result.filePaths[0]);
  await ensurePaths(true);
  return { success: true, settings: settingsPayload() };
});

ipcMain.handle('pick-preset-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Выберите HTML-пресет Arma 3',
    filters: [{ name: 'HTML preset', extensions: ['html'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths?.[0]) return { success: false, canceled: true };
  store.set('presetPath', result.filePaths[0]);
  try {
    loadModsList();
  } catch (e) {
    store.set('presetPath', '');
    loadModsList();
    return { success: false, error: e.message };
  }
  return { success: true, settings: settingsPayload() };
});

ipcMain.handle('reset-preset', () => {
  store.set('presetPath', '');
  loadModsList();
  return { success: true, settings: settingsPayload() };
});

ipcMain.on('window-minimize', () => mainWindow?.minimize());
ipcMain.on('window-close', () => {
  if (isArmaRunning(true) && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
    return;
  }
  mainWindow?.close();
});
