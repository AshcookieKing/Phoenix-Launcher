// Чекер сети Phoenix (PhoenixNetCheck.exe, исходник Desktop\PhoenixNetCheck) внутри лаунчера.
// Без окна: --json <файл> - проверки (интернет, DNS, все серверы Phoenix, TeamSpeak, сервер входа, Steam и кэш его
// загрузок, маршрут через VPN, zapret, брандмауэр, прокси, hosts, Discord). Систему не меняет.
// --fix id,id - исправления, только когда игрок нажал «Исправить» и подтвердил список; права администратора - через UAC.
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { trySpawn, spawnDetached, describeSpawnError } = require('./safe-spawn.cjs');

function helperPath() {
  const packaged = process.resourcesPath ? path.join(process.resourcesPath, 'PhoenixNetCheck.exe') : '';
  if (packaged && fs.existsSync(packaged)) return packaged;
  return path.join(__dirname, '..', 'native', 'PhoenixNetCheck.exe');
}

function createNetCheck({ dataDir, onUpdate }) {
  let last = null;
  let running = null;

  const publish = (patch) => {
    last = patch;
    onUpdate?.(last);
    return last;
  };

  // fix: null - только проверка; 'auto' - безопасные исправления; 'id,id' - выбранные
  function run({ fix = null } = {}) {
    if (running) return running;
    running = new Promise((resolve) => {
      const exe = helperPath();
      if (!fs.existsSync(exe)) {
        resolve(publish({ state: 'error', error: 'Чекер сети не найден. Переустановите лаунчер.', at: Date.now() }));
        return;
      }
      fs.mkdirSync(dataDir, { recursive: true });
      const out = path.join(dataDir, `netcheck-${randomUUID()}.json`);
      publish({ state: fix ? 'fixing' : 'checking', error: null });
      const args = ['--json', out];
      if (fix) args.push('--fix', fix);
      const started = trySpawn(exe, args, { windowsHide: true, stdio: 'ignore', cwd: dataDir });
      if (!started.child) {
        resolve(publish({ state: 'error', error: started.message, at: Date.now() }));
        return;
      }
      const child = started.child;
      // исправления ждут ответа на UAC - даём время
      const timer = setTimeout(() => child.kill(), fix ? 240000 : 90000);
      const finish = (code) => {
        clearTimeout(timer);
        try {
          if (code !== 0) throw new Error('checker exit');
          const data = JSON.parse(fs.readFileSync(out, 'utf8'));
          const results = data.results;
          if (!Array.isArray(results) || !results.length) throw new Error('empty report');
          resolve(publish({
            state: 'done',
            at: Date.now(),
            results,
            fixed: data.fixed || [],
            failed: data.failed || [],
            uacDenied: Boolean(data.uacDenied),
            problems: results.filter((r) => r.status === 'fail' || r.status === 'warn').length,
          }));
        } catch {
          resolve(publish({ state: 'error', error: 'Чекер сети не ответил', at: Date.now() }));
        } finally {
          try { fs.rmSync(out, { force: true }); } catch {}
        }
      };
      child.once('error', (e) => {
        clearTimeout(timer);
        resolve(publish({ state: 'error', error: describeSpawnError(e, exe), at: Date.now() }));
      });
      child.once('exit', finish);
    }).catch(e => publish({ state: 'error', error: e.message, at: Date.now() })).finally(() => {
      running = null;
    });
    return running;
  }

  // Полное окно чекера (zapret, маршруты мимо VPN, сброс Winsock); права администратора - только по кнопке в нём
  function openWindow() {
    return spawnDetached(helperPath(), [], { windowsHide: false });
  }

  return { run, openWindow, get: () => last };
}

module.exports = { createNetCheck, helperPath };
