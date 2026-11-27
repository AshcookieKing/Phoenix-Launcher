// Автообновление по релизам GitHub (AshcookieKing/Phoenix-Launcher).
// С 1.4.0 лаунчер ставится установщиком NSIS (PhoenixLauncherSetup.exe) в %LOCALAPPDATA%\Programs\PhoenixLauncher
// (или Program Files, если при установке выбрать «для всех пользователей»). В %TEMP% ничего не распаковывается:
// обновление скачивается в папку данных лаунчера (%APPDATA%\PhoenixLauncher\updates) и ставится тихо (/S) -
// по кнопке «Перезапустить» или само при закрытии лаунчера. Старая portable-сборка (PhoenixLauncher.exe) этим же
// путём переходит на установленную версию. Без PowerShell/cmd (их антивирусы считают признаком вредоноса).
const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawnDetached } = require('./safe-spawn.cjs');

const REPO = 'AshcookieKing/Phoenix-Launcher';
const ASSET = 'PhoenixLauncherSetup.exe';
const UA = 'PhoenixLauncher-updater';

function parseVersion(v) {
  return String(v || '')
    .replace(/^v/i, '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
}

function isNewer(remote, local) {
  const a = parseVersion(remote);
  const b = parseVersion(local);
  for (let i = 0; i < 3; i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) > (b[i] || 0);
  }
  return false;
}

// Последний релиз без REST API GitHub (там лимит 60 запросов/час на IP — у игроков за общим NAT/VPN он кончается):
// github.com/<repo>/releases/latest отвечает 302 на /releases/tag/vX.Y.Z, файл — /releases/latest/download/<ASSET>.
function latestTag() {
  return new Promise((resolve, reject) => {
    const req = https.get(`https://github.com/${REPO}/releases/latest`, { headers: { 'User-Agent': UA }, timeout: 15000 }, (res) => {
      res.resume();
      const m = /\/releases\/tag\/([^/?#]+)/.exec(res.headers.location || '');
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && m) resolve(decodeURIComponent(m[1]));
      else reject(new Error(`HTTP ${res.statusCode}`));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

async function latestRelease() {
  try {
    const tag = await latestTag();
    return {
      tag_name: tag,
      html_url: `https://github.com/${REPO}/releases/tag/${tag}`,
      body: '',
      asset: { name: ASSET, size: 0, browser_download_url: `https://github.com/${REPO}/releases/download/${tag}/${ASSET}` },
    };
  } catch {
    // запасной путь — REST API (даёт и описание релиза, но с лимитом)
    const rel = await get(`https://api.github.com/repos/${REPO}/releases/latest`, { json: true });
    return { ...rel, asset: (rel.assets || []).find((a) => a.name === ASSET) };
  }
}

// GET с переходом по редиректам (ассеты GitHub отдаются через objects.githubusercontent.com)
function get(url, { json = false, onData = null, file = null, hops = 0 } = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { 'User-Agent': UA, Accept: json ? 'application/vnd.github+json' : 'application/octet-stream' }, timeout: 20000 },
      (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && hops < 5) {
          res.resume();
          resolve(get(res.headers.location, { json, onData, file, hops: hops + 1 }));
          return;
        }
        if (res.statusCode !== 200) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        const total = Number(res.headers['content-length']) || 0;
        let got = 0;
        if (file) {
          const out = fs.createWriteStream(file);
          res.on('data', (c) => {
            got += c.length;
            onData?.(got, total);
          });
          res.pipe(out);
          out.on('finish', () => out.close(() => resolve({ size: got })));
          out.on('error', reject);
          res.on('error', reject);
          return;
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (body += c));
        res.on('end', () => {
          try {
            resolve(json ? JSON.parse(body) : body);
          } catch (e) {
            reject(e);
          }
        });
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

function createUpdater({ appVersion, onStatus, isAutoEnabled, updatesDir, packaged }) {
  // старая portable-сборка: PORTABLE_EXECUTABLE_FILE - путь к самому PhoenixLauncher.exe
  const portableExe = process.env.PORTABLE_EXECUTABLE_FILE || '';
  const portable = Boolean(portableExe) && fs.existsSync(portableExe);
  const setupFile = path.join(updatesDir, ASSET);
  // хвосты прежней схемы обновления portable (рядом с exe)
  if (portable) {
    for (const name of ['PhoenixLauncher.old.exe', 'PhoenixLauncher.update.exe', 'PhoenixLauncher.update.exe.part']) {
      try {
        fs.rmSync(path.join(path.dirname(portableExe), name), { force: true });
      } catch {}
    }
  }
  // установщик прошлого обновления уже отработал - убрать
  try {
    fs.rmSync(setupFile, { force: true });
    fs.rmSync(`${setupFile}.part`, { force: true });
  } catch {}

  let status = { state: packaged ? 'idle' : 'dev', current: appVersion, portable };
  let busy = false;
  let installing = false;

  const set = (patch) => {
    status = { ...status, ...patch, current: appVersion, portable };
    onStatus?.(status);
  };

  async function check({ manual = false } = {}) {
    if (!packaged || busy || status.state === 'ready') return status;
    busy = true;
    try {
      set({ state: 'checking', error: null });
      const rel = await latestRelease();
      const asset = rel.asset;
      const info = { latest: rel.tag_name, notes: rel.body || '', url: rel.html_url, checkedAt: Date.now() };
      // portable переходит на установленную версию даже без новой версии
      const migrate = portable && Boolean(asset);
      if (!asset || (!migrate && !isNewer(rel.tag_name, appVersion))) {
        set({ state: 'none', latest: rel.tag_name, checkedAt: Date.now() });
        return status;
      }
      if (!manual && !isAutoEnabled()) {
        set({ state: 'available', migrate, ...info });
        return status;
      }
      await download(asset, { migrate, ...info });
      return status;
    } catch (e) {
      set({ state: 'error', error: e.message || String(e) });
      return status;
    } finally {
      busy = false;
    }
  }

  async function download(asset, info) {
    fs.mkdirSync(updatesDir, { recursive: true });
    const tmp = `${setupFile}.part`;
    set({ state: 'downloading', percent: 0, ...info });
    let last = 0;
    const res = await get(asset.browser_download_url, {
      file: tmp,
      onData: (got, total) => {
        if (total) asset.size = asset.size || total;
        const pct = Math.floor(((total || asset.size) ? got / (total || asset.size) : 0) * 100);
        if (pct !== last) {
          last = pct;
          set({ state: 'downloading', percent: pct });
        }
      },
    });
    if ((asset.size && res.size !== asset.size) || res.size < 10 * 1024 * 1024) {
      fs.rmSync(tmp, { force: true });
      throw new Error('файл обновления скачался не полностью');
    }
    fs.renameSync(tmp, setupFile);
    set({ state: 'ready', percent: 100, ...info });
  }

  // Тихая установка поверх прежней (NSIS сам находит папку прошлой установки; для Program Files спросит UAC).
  // run=true - запустить лаунчер после установки (--force-run).
  async function runSetup(run) {
    if (installing) return { ok: true };
    if (!fs.existsSync(setupFile)) return { ok: false, error: 'Обновление ещё не скачано' };
    installing = true;
    const args = ['/S', '--updated'];
    if (run) args.push('--force-run');
    const res = await spawnDetached(setupFile, args, { cwd: updatesDir, windowsHide: false });
    if (!res.ok) {
      installing = false;
      // установщик заблокирован (антивирус/SmartScreen) - страница релиза, поставить вручную
      try {
        require('electron').shell.openExternal(status.url || `https://github.com/${REPO}/releases/latest`);
      } catch {}
      return { ok: false, error: res.message };
    }
    return { ok: true };
  }

  async function install(app) {
    if (status.state !== 'ready') return { ok: false, error: 'Обновление ещё не скачано' };
    const res = await runSetup(true);
    if (res.ok) setTimeout(() => app.exit(0), 300);
    return res;
  }

  // Закрытие лаунчера со скачанным обновлением - поставить его (без запуска)
  function installOnQuit() {
    if (status.state === 'ready' && !installing && isAutoEnabled()) runSetup(false).catch(() => {});
  }

  return { check, install, installOnQuit, getStatus: () => status, portable };
}

module.exports = { createUpdater, isNewer, ASSET };
