// Моды сборки Phoenix: подписка и загрузка через Steam API (workshop-ugc.cjs), проверка и запуск Arma 3
const fs = require('fs');
const path = require('path');
const arma = require('./arma.cjs');
const { ARMA_APP_ID } = require('./paths.cjs');
const { runWorkshop, helperAvailable, STATE } = require('./workshop-ugc.cjs');
const { ensureSteamClient } = require('./steam-workshop.cjs');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const STALL_MS = 90000;

function gb(bytes) {
  const v = bytes / 1073741824;
  return v >= 10 ? v.toFixed(0) : v.toFixed(1);
}

function namesOf(mods) {
  return mods
    .slice(0, 6)
    .map((m) => m.name || m.workshopId)
    .join(', ');
}

// Подписка на все моды сборки и загрузка недостающих/устаревших; ждёт, пока Steam не скачает всё.
// control.cancel - выставляется на время работы (кнопка «Отмена»). onProgress(percent, message).
async function syncWorkshop(mods, config, onProgress, control = {}, { from = 10, to = 88 } = {}) {
  const armaDir = path.dirname(config.armaExe || '');
  const ids = mods.map((m) => m.workshopId);
  const names = new Map(mods.map((m) => [m.workshopId, m.name]));
  let lastDone = -1;
  let lastChange = Date.now();

  const report = (items) => {
    let ready = 0;
    let done = 0;
    let total = 0;
    let current = '';
    for (const id of ids) {
      const it = items.get(id);
      if (!it) continue;
      if (it.ready) ready++;
      else {
        done += it.done;
        total += it.total;
        if (!current && it.state & STATE.DOWNLOADING) current = names.get(id) || id;
      }
    }
    const n = ids.length;
    if (done !== lastDone) {
      lastDone = done;
      lastChange = Date.now();
    }
    const frac = total > 0 ? done / total : 0;
    const percent = from + (to - from) * ((ready + frac * (n - ready)) / Math.max(n, 1));
    let msg;
    if (ready === n) msg = `Все ${n} модов на месте`;
    else if (total > 0) msg = `Steam качает моды: готово ${ready}/${n} · ${gb(done)} из ${gb(total)} ГБ${current ? ` · ${current}` : ''}`;
    else msg = `Steam ставит моды в загрузку: готово ${ready}/${n}…`;
    if (ready < n && Date.now() - lastChange > STALL_MS) msg += ' · загрузка стоит — проверьте Steam → Загрузки';
    onProgress(Math.round(percent), msg);
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    onProgress(from, 'Steam: проверка модов сборки…');
    const run = runWorkshop(armaDir, 'sync', ids, { onStatus: report });
    control.cancel = run.cancel;
    const res = await run.promise;
    control.cancel = null;
    if (res.ok || res.cancelled) return res;
    // Steam закрыт - запустить и повторить один раз
    if (res.code === 'no_steam' && attempt === 0) {
      onProgress(from, 'Запуск Steam…');
      await ensureSteamClient(config);
      await sleep(15000);
      continue;
    }
    return res;
  }
  return { ok: false, error: 'Steam не запустился' };
}

// Пути модов для -mod: папка от Steam (GetItemInstallInfo), иначе поиск по библиотекам Steam
function resolveModPaths(mods, config, items) {
  return mods.map((mod) => {
    const it = items?.get(mod.workshopId);
    let folder = it?.folder && fs.existsSync(it.folder) ? it.folder : '';
    if (!folder) folder = arma.locateModFolder(mod.workshopId, config)?.folder || '';
    const modPath = folder ? arma.findModRoot(folder) : null;
    return { ...mod, folder, path: modPath, status: modPath ? 'ok' : 'missing' };
  });
}

async function prepareAndLaunch({ mods, config, server, profileName, onProgress, control = {} }) {
  onProgress(3, 'Проверка путей Arma 3…');
  if (!config.armaExe || !config.workshopDir) {
    return { ok: false, error: 'Укажите пути к Arma 3 и Workshop в настройках.' };
  }
  if (!config.acfPath && config.steamPath) {
    config.acfPath = path.join(config.steamPath, 'steamapps', 'workshop', `appworkshop_${ARMA_APP_ID}.acf`);
  }

  let checked;
  if (helperAvailable(path.dirname(config.armaExe))) {
    const res = await syncWorkshop(mods, config, onProgress, control);
    if (res.cancelled) return { ok: false, cancelled: true, error: 'Запуск отменён' };
    if (!res.ok) {
      // Steam API не ответил: запуск с тем, что уже стоит, если стоит всё
      checked = await arma.checkMods(mods, config, { force: true });
      const missing = checked.filter((m) => m.status === 'missing');
      if (missing.length) {
        return { ok: false, error: `${res.error} Не хватает модов: ${missing.length} (${namesOf(missing)}).`, missing };
      }
      onProgress(88, `${res.error} Запуск с установленными модами…`);
      await sleep(2000);
    } else {
      checked = resolveModPaths(mods, config, res.items);
      const missing = checked.filter((m) => m.status === 'missing');
      if (missing.length) {
        return { ok: false, error: `Steam не отдал папки модов: ${missing.length} (${namesOf(missing)}).`, missing };
      }
      // помощник вошёл в Steam как Arma 3 - дать Steam снять этот статус до запуска самой игры
      await sleep(1500);
    }
  } else {
    onProgress(12, 'Проверка модов Phoenix…');
    checked = await arma.checkMods(mods, config, { force: true });
    const missing = checked.filter((m) => m.status === 'missing');
    if (missing.length) {
      return {
        ok: false,
        error: `Не установлено модов: ${missing.length} (${namesOf(missing)}). Подпишитесь на них в Steam (вкладка «Моды» → страница мода).`,
        missing,
      };
    }
  }

  const modParam = arma.buildModParam(checked);
  const launchConfig = { ...config };
  if (profileName) launchConfig.playerName = profileName;
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
    onProgress(96, 'Profiling-exe не найден — запуск основной сборки (performance)…');
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

module.exports = { prepareAndLaunch, syncWorkshop };
