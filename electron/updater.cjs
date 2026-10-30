// Автообновление по релизам GitHub (AshcookieKing/Phoenix-Launcher).
// Сборка portable: electron-updater её не обновляет, поэтому свой путь —
// latest release → скачать PhoenixLauncher.exe рядом с текущим → текущий переименовать в .old.exe, новый поставить на его
// место и запустить (без PowerShell).
const fs = require('fs');
const path = require('path');
const https = require('https');
const { spawn } = require('child_process');

const REPO = 'AshcookieKing/Phoenix-Launcher';
const ASSET = 'PhoenixLauncher.exe';
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

function createUpdater({ appVersion, onStatus, isAutoEnabled }) {
  // Путь к самому PhoenixLauncher.exe (portable распаковывается во временную папку, а это — исходный файл)
  const exePath = process.env.PORTABLE_EXECUTABLE_FILE || '';
  const portable = Boolean(exePath) && fs.existsSync(exePath);
  const pending = portable ? path.join(path.dirname(exePath), 'PhoenixLauncher.update.exe') : '';
  // прежняя версия после обновления (запущенный exe переименовывается - удалить его можно только после выхода)
  const old = portable ? path.join(path.dirname(exePath), 'PhoenixLauncher.old.exe') : '';
  if (old && fs.existsSync(old)) {
    try {
      fs.unlinkSync(old);
    } catch {
      /* ещё занят закрывающимся экземпляром - удалится при следующем запуске */
    }
  }
  let status = { state: portable ? 'idle' : 'dev', current: appVersion };
  let busy = false;

  const set = (patch) => {
    status = { ...status, ...patch, current: appVersion };
    onStatus?.(status);
  };

  // остаток прошлого обновления (скачан, но не установлен или уже установлен)
  if (pending && fs.existsSync(pending)) {
    try {
      fs.unlinkSync(pending);
    } catch {
      /* занят — удалится в следующий раз */
    }
  }

  async function check({ manual = false } = {}) {
    if (busy || status.state === 'ready') return status;
    busy = true;
    try {
      set({ state: 'checking', error: null });
      const rel = await latestRelease();
      const asset = rel.asset;
      if (!asset || !isNewer(rel.tag_name, appVersion)) {
        set({ state: 'none', latest: rel.tag_name, checkedAt: Date.now() });
        return status;
      }
      const info = { latest: rel.tag_name, notes: rel.body || '', url: rel.html_url, checkedAt: Date.now() };
      if (!portable) {
        set({ state: 'available', ...info });
        return status;
      }
      if (!manual && !isAutoEnabled()) {
        set({ state: 'available', ...info });
        return status;
      }
      await download(asset, info);
      return status;
    } catch (e) {
      set({ state: 'error', error: e.message || String(e) });
      return status;
    } finally {
      busy = false;
    }
  }

  async function download(asset, info) {
    const tmp = `${pending}.part`;
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
    fs.renameSync(tmp, pending);
    set({ state: 'ready', percent: 100, ...info });
  }

  // Установка без скрытого PowerShell (его антивирусы считают признаком вредоноса): запущенный PhoenixLauncher.exe
  // Windows разрешает переименовать - он становится PhoenixLauncher.old.exe (удаляется при следующем запуске),
  // новый ставится на его место и запускается напрямую с --after-update (ждёт, пока этот экземпляр закроется).
  function install(app) {
    if (status.state !== 'ready' || !fs.existsSync(pending)) return { ok: false, error: 'Обновление ещё не скачано' };
    try {
      fs.rmSync(old, { force: true });
    } catch {
      /* старый ещё занят - переименование ниже его заменит или сообщит об ошибке */
    }
    try {
      fs.renameSync(exePath, old);
    } catch (e) {
      return { ok: false, error: `Не удалось заменить файл лаунчера (${e.code || e.message}). Скачайте новую версию с GitHub.` };
    }
    try {
      fs.renameSync(pending, exePath);
    } catch (e) {
      try {
        fs.renameSync(old, exePath);
      } catch {}
      return { ok: false, error: `Не удалось установить обновление (${e.code || e.message}). Скачайте новую версию с GitHub.` };
    }
    spawn(exePath, ['--after-update'], { cwd: path.dirname(exePath), detached: true, stdio: 'ignore' }).unref();
    setTimeout(() => app.exit(0), 300);
    return { ok: true };
  }

  return { check, install, getStatus: () => status, portable };
}

module.exports = { createUpdater, isNewer };
