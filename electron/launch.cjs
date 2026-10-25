// Проверка модов пресета Phoenix, докачка через Steam и запуск Arma 3
const path = require('path');
const arma = require('./arma.cjs');
const { ARMA_APP_ID } = require('./paths.cjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function pollModsReady(mods, config, missingIds, onProgress, maxWaitMs = 900000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const checked = await arma.checkMods(mods, config, { force: true });
    const stillMissing = checked.filter((m) => m.status === 'missing');
    const done = missingIds.length - stillMissing.length;
    onProgress(
      Math.min(85, 45 + Math.round((done / Math.max(missingIds.length, 1)) * 40)),
      `Загрузка модов в Steam… (${done}/${missingIds.length})`
    );
    if (!stillMissing.length) return checked;
    await sleep(10000);
  }
  return arma.checkMods(mods, config, { force: true });
}

function namesOf(mods) {
  return mods
    .slice(0, 6)
    .map((m) => m.name || m.workshopId)
    .join(', ');
}

async function prepareAndLaunch({ mods, config, server, onProgress }) {
  onProgress(3, 'Проверка путей Arma 3…');
  if (!config.armaExe || !config.workshopDir) {
    return { ok: false, error: 'Укажите пути к Arma 3 и Workshop в настройках.' };
  }
  if (!config.acfPath && config.steamPath) {
    config.acfPath = path.join(config.steamPath, 'steamapps', 'workshop', `appworkshop_${ARMA_APP_ID}.acf`);
  }

  onProgress(12, 'Проверка модов Phoenix…');
  let checked = await arma.checkMods(mods, config, { force: true });
  let missing = checked.filter((m) => m.status === 'missing');
  const outdated = checked.filter((m) => m.status === 'outdated');

  const toSync = [...new Set([...outdated, ...missing].map((m) => m.workshopId))];
  if (toSync.length) {
    onProgress(26, `Загрузка ${toSync.length} мод(ов) через Steam…`);
    await arma.openSteamSubscribe(toSync, config);
    onProgress(34, 'Steam качает моды — подождите…');
    await sleep(15000);
    checked = await arma.checkMods(mods, config, { force: true });
    missing = checked.filter((m) => m.status === 'missing');
  }

  if (missing.length) {
    onProgress(40, 'Ожидание загрузки модов…');
    checked = await pollModsReady(mods, config, missing.map((m) => m.workshopId), onProgress);
    const stillMissing = checked.filter((m) => m.status === 'missing');
    if (stillMissing.length) {
      return {
        ok: false,
        error: `Не установлено модов: ${stillMissing.length} (${namesOf(stillMissing)}). Откройте Steam → Загрузки и дождитесь окончания.`,
        missing: stillMissing,
      };
    }
  }

  if (checked.some((m) => m.status === 'outdated')) {
    onProgress(88, 'Часть модов ещё обновляется — запуск с установленными…');
    await sleep(1500);
  }

  const modParam = arma.buildModParam(checked);
  const launchConfig = { ...config };
  if (server) {
    launchConfig.autoConnectServer = true;
    launchConfig.serverHost = server.host;
    launchConfig.serverPort = server.port;
    onProgress(95, `Запуск Arma 3 → ${server.name} (${server.host}:${server.port})…`);
  } else {
    launchConfig.autoConnectServer = false;
    onProgress(95, 'Запуск Arma 3 в меню Phoenix…');
  }

  if (launchConfig.profilingLaunch !== false && !arma.profilingAvailable(launchConfig)) {
    onProgress(96, 'Profiling-версия не установлена (Steam → Arma 3 → Бета-версии → profiling) — запуск обычной…');
    await sleep(2500);
  }
  const launchResult = await arma.launchGame(launchConfig, modParam);
  onProgress(100, /profiling/i.test(launchResult.exe) ? 'Игра запускается (profiling-версия)' : 'Игра запускается');
  return {
    ok: true,
    pid: launchResult.pid,
    modCount: modParam.split(';').filter(Boolean).length,
  };
}

module.exports = { prepareAndLaunch };
