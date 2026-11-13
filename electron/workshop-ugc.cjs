// Steam Workshop helper for Arma 3. Each process owns its Steam API session until it exits.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const STATE = { SUBSCRIBED: 1, INSTALLED: 4, NEEDS_UPDATE: 8, DOWNLOADING: 16, PENDING: 32 };
const ERRORS = {
  no_dll: 'Не удалось загрузить steam_api64.dll из папки Arma 3.',
  no_steam: 'Запустите Steam и войдите в аккаунт.',
  not_logged_on: 'Потеряно соединение с аккаунтом Steam. Войдите в Steam и повторите загрузку.',
  init: 'Steam не отвечает. Перезапустите клиент Steam.',
  no_ugc: 'Steam Workshop недоступен. Проверьте обновления Steam и файлы Arma 3.',
  stalled: 'Загрузка остановилась. Проверьте очередь «Загрузки» в Steam и свободное место на диске.',
  incomplete: 'Steam не подтвердил установку всех модов.',
};
const STEAM_RESULTS = {
  3: 'нет соединения со Steam',
  9: 'файл отсутствует в Workshop',
  10: 'Steam занят',
  15: 'нет доступа к моду',
  16: 'истекло время ожидания ответа Steam',
  20: 'сервис Steam недоступен',
  24: 'у аккаунта недостаточно прав',
  25: 'превышен лимит Steam',
  37: 'ошибка чтения или записи файлов',
  84: 'слишком много запросов к Steam',
  54: 'на диске недостаточно места',
};

function helperPath() {
  const packaged = process.resourcesPath && path.join(process.resourcesPath, 'steam_workshop.exe');
  if (packaged && fs.existsSync(packaged)) return packaged;
  return path.join(__dirname, '..', 'native', 'steam_workshop.exe');
}

function helperAvailable(armaDir) {
  return Boolean(armaDir) && fs.existsSync(path.join(armaDir, 'steam_api64.dll')) && fs.existsSync(helperPath());
}

function isReady(st) {
  return Boolean(st & STATE.SUBSCRIBED) && Boolean(st & STATE.INSTALLED) &&
    !(st & (STATE.NEEDS_UPDATE | STATE.DOWNLOADING | STATE.PENDING));
}

function runWorkshop(armaDir, mode, ids, { onStatus, repairIds = [] } = {}) {
  const list = [...new Set(ids.map(String))];
  const repairs = new Set(repairIds.map(String));
  let child;
  let cancelled = false;
  const promise = new Promise((resolve) => {
    const items = new Map();
    if (!list.length) return resolve({ ok: true, items });
    if (list.some((id) => !/^[1-9]\d{0,19}$/.test(id) || BigInt(id) > 0xffffffffffffffffn)) {
      return resolve({ ok: false, code: 'invalid_id', error: 'В списке модов указан неверный ID Workshop.' });
    }
    if (!helperAvailable(armaDir)) return resolve({ ok: false, code: 'no_helper', error: 'Помощник Steam недоступен.' });

    const args = list.map((id) => (mode === 'sync' && repairs.has(id) ? '+' + id : id));
    let buffer = '';
    let initialized = false;
    let complete = false;
    let failure;
    const errors = [];
    const parseLine = (line) => {
      if (line === 'READY') initialized = true;
      else if (line === 'TICK') onStatus?.(items);
      else if (line === 'DONE') complete = true;
      else if (line.startsWith('ERR ')) {
        const [code, workshopId] = line.slice(4).split(' ');
        let error = ERRORS[code] || 'Ошибка Steam Workshop (' + code + ').';
        if (workshopId) error += ' ID ' + workshopId + '.';
        failure = { ok: false, code, error, workshopId };
      } else if (line.startsWith('ITEM_ERR ')) {
        const [, action, id, result] = line.split(' ');
        const operation = action === 'subscribe' ? 'подписка' : 'загрузка';
        const reason = STEAM_RESULTS[result] || (Number(result) ? 'код Steam ' + result : 'Steam отклонил запрос');
        errors.push(id + ' (' + operation + ', ' + reason + ')');
      } else if (line.startsWith('S ')) {
        const match = /^S (\d+) (\d+) (\d+) (\d+) (\d+) (\d+) (.*)$/.exec(line);
        if (!match) return;
        const [, id, flags, done, total, stamp, size, folder] = match;
        const state = Number(flags);
        items.set(id, { state, done: Number(done), total: Number(total), stamp: Number(stamp), size: Number(size),
          folder, ready: isReady(state) && Boolean(folder) });
      }
    };

    child = spawn(helperPath(), [path.resolve(armaDir), mode, ...args], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
    child.on('error', (err) => { failure = { ok: false, code: 'spawn', error: err.message }; });
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      const lines = (buffer + chunk).split(/\r?\n/);
      buffer = lines.pop();
      for (const line of lines) parseLine(line);
    });
    child.once('close', (exitCode) => {
      if (buffer) parseLine(buffer);
      if (cancelled) return resolve({ ok: false, cancelled: true, error: 'Отменено' });
      if (errors.length) {
        failure ||= { ok: false, code: 'incomplete', error: ERRORS.incomplete };
        failure.error += ' Ошибки модов: ' + errors.join(', ') + '.';
      }
      if (failure) return resolve(failure);
      const allReported = list.every((id) => items.has(id));
      const finished = mode === 'state' || (complete && list.every((id) => items.get(id)?.ready));
      if (exitCode === 0 && initialized && allReported && finished) return resolve({ ok: true, items });
      resolve({ ok: false, code: 'incomplete', error: ERRORS.incomplete + ' Код завершения: ' + exitCode + '.' });
    });
  });
  const cancel = () => {
    cancelled = true;
    if (child && child.exitCode === null) child.kill();
  };
  return { promise, cancel };
}

module.exports = { runWorkshop, helperAvailable, isReady, STATE };
