const path = require('node:path');
const { setTimeout: sleep } = require('node:timers/promises');
const arma = require('./arma.cjs');
const { runWorkshop, helperAvailable, STATE } = require('./workshop-ugc.cjs');
const { ensureSteamClient } = require('./steam-workshop.cjs');

const OFFLINE_FALLBACK = new Set(['no_helper', 'no_dll', 'no_steam', 'not_logged_on', 'init', 'no_ugc', 'spawn']);

function namesOf(mods) {
  return mods.slice(0, 6).map((m) => m.name || m.workshopId).join(', ');
}

function reportDownload(mods, items, onProgress, from, to) {
  let ready = 0;
  let fractions = 0;
  let current = '';
  for (const mod of mods) {
    const item = items.get(mod.workshopId);
    if (!item) continue;
    if (item.ready) {
      ready++;
    } else if (item.total > 0) {
      fractions += Math.min(1, item.done / item.total);
      if (!current && (item.state & STATE.DOWNLOADING)) {
        const gib = (bytes) => (bytes / 1073741824).toFixed(1);
        current = ` · ${mod.name || mod.workshopId}: ${gib(item.done)} из ${gib(item.total)} ГБ`;
      }
    }
  }
  const percent = from + (to - from) * (ready + fractions) / mods.length;
  onProgress(Math.min(to - 1, Math.round(percent)), `Steam Workshop: установлено ${ready}/${mods.length}${current}`);
}

async function syncWorkshop(mods, config, onProgress, signal, { from = 10, to = 88 } = {}) {
  if (!mods.length) return { ok: false, error: 'Список модов пуст. Проверьте выбранный пресет.' };
  const armaDir = path.dirname(config.armaExe || '');
  if (!config.armaExe || !helperAvailable(armaDir)) {
    return { ok: false, code: 'no_helper', error: 'Steam Workshop недоступен. Проверьте путь к Arma 3 и наличие steam_api64.dll в папке игры.' };
  }

  const allItems = new Map();
  const diskOptions = { force: true, localOnly: true };
  let pending = mods;
  let triedSteamStart = false;
  const retriedStalls = new Set();
  let retriedFiles = false;
  while (true) {
    signal?.throwIfAborted();
    onProgress(from, 'Проверка файлов модов…');
    const before = retriedFiles ? pending : await arma.checkMods(pending, config, diskOptions);
    const repairIds = before.filter((m) => m.status !== 'ok' || retriedFiles).map((m) => m.workshopId);
    signal?.throwIfAborted();
    const run = runWorkshop(armaDir, 'sync', pending.map((m) => m.workshopId), {
      repairIds,
      onStatus(items) {
        for (const [id, item] of items) allItems.set(id, item);
        reportDownload(mods, allItems, onProgress, from, to);
      },
    });
    signal?.addEventListener('abort', run.cancel, { once: true });
    let result;
    try {
      result = await run.promise;
    } finally {
      signal?.removeEventListener('abort', run.cancel);
    }
    signal?.throwIfAborted();
    if (!result.ok) {
      if (result.code === 'no_steam' && !triedSteamStart) {
        triedSteamStart = true;
        onProgress(from, 'Запуск Steam…');
        if (!await ensureSteamClient(config, signal)) return result;
        await sleep(10000, undefined, { signal });
        continue;
      }
      if (result.code === 'stalled' && !retriedStalls.has(result.workshopId)) {
        retriedStalls.add(result.workshopId);
        onProgress(from, 'Очередь Steam остановилась. Даём клиенту применить файлы перед повтором…');
        await sleep(10000, undefined, { signal });
        continue;
      }
      return result;
    }

    for (const [id, item] of result.items) allItems.set(id, item);
    onProgress(to - 1, 'Проверка загруженных файлов…');
    const checked = await arma.checkMods(mods, config, { ...diskOptions, items: allItems });
    signal?.throwIfAborted();
    const incomplete = checked.filter((m) => m.status !== 'ok' || !allItems.get(m.workshopId)?.ready);
    if (!incomplete.length) {
      onProgress(to, `Проверено модов: ${checked.length} из ${mods.length}`);
      return { ok: true, checked };
    }
    if (retriedFiles) {
      return { ok: false, error: `Steam завершил загрузку, но файлы модов неполны: ${namesOf(incomplete)}. Откройте официальный лаунчер Arma 3 и выберите «Восстановить» для этих модов.` };
    }
    retriedFiles = true;
    pending = incomplete;
    onProgress(to - 1, `Повторная загрузка неполных модов: ${namesOf(incomplete)}…`);
    await sleep(2000, undefined, { signal });
  }
}

async function prepareAndLaunch({ mods, config, server, profileName, onProgress, signal }) {
  onProgress(3, 'Проверка путей Arma 3…');
  if (!config.armaExe || !config.workshopDir) {
    return { ok: false, error: 'Укажите пути к Arma 3 и Workshop в настройках.' };
  }
  const result = await syncWorkshop(mods, config, onProgress, signal);
  let checked = result.checked;
  if (!result.ok) {
    if (!OFFLINE_FALLBACK.has(result.code)) return result;
    checked = await arma.checkMods(mods, config, { force: true });
    signal?.throwIfAborted();
    const incomplete = checked.filter((m) => m.status !== 'ok');
    if (incomplete.length) {
      return { ok: false, error: `${result.error} Требуется загрузка или обновление: ${namesOf(incomplete)}.`, missing: incomplete };
    }
  }

  const modParam = arma.buildModParam(checked);
  const launchConfig = { ...config, autoConnectServer: Boolean(server) };
  if (profileName) launchConfig.playerName = profileName;
  if (server) {
    launchConfig.serverHost = server.host;
    launchConfig.serverPort = server.port;
    onProgress(95, `Запуск Arma 3 → ${server.name} (${server.host}:${server.port})…`);
  } else {
    onProgress(95, 'Запуск Arma 3 в меню Phoenix…');
  }
  if (launchConfig.profilingLaunch !== false && !arma.profilingAvailable(launchConfig)) {
    onProgress(96, 'Profiling-exe не найден — запуск основной сборки (performance)…');
    await sleep(2500, undefined, { signal });
  }
  signal?.throwIfAborted();
  const launchResult = await arma.launchGame(launchConfig, modParam, signal);
  onProgress(100, /profiling/i.test(launchResult.exe) ? 'Игра запускается (profiling-версия)' : 'Игра запускается');
  return { ok: true, pid: launchResult.pid, modCount: checked.length };
}

module.exports = { prepareAndLaunch, syncWorkshop };
