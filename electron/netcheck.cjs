// Проверка сети Phoenix внутри лаунчера. ТОЛЬКО ЧТЕНИЕ: ничего на ПК не меняет, прав администратора не просит,
// сторонних программ не запускает (кроме tasklist для поиска zapret). Для исправлений есть отдельная программа
// Phoenix NetCheck (Desktop\PhoenixNetCheck), её игрок скачивает сам со страницы релиза.
const fs = require('fs');
const os = require('os');
const net = require('net');
const path = require('path');
const dgram = require('dgram');
const https = require('https');
const dns = require('dns').promises;
const { trySpawn } = require('./safe-spawn.cjs');
const { queryServer } = require('./a2s.cjs');
const { PHX_HOST } = require('./phx-config.cjs');

const SERVERS = [['farabad', 'Фарабад', 2303], ['kamino', 'Камино', 2403], ['venator', 'Венатор', 2503]];
const ROLE_API_PORT = 8792;
const TS = [['основной', '185.104.249.127', 10026], ['прокси', '45.95.203.70', 41909]];
const VPN_RE = /tap|wireguard|vpn|wintun|\btun\b|openvpn|amnezia|radmin|hamachi|zerotier|outline|v2ray|sing-box|happ|hiddify/i;
const NETCHECK_URL = 'https://github.com/AshcookieKing/Phoenix-Launcher/releases/latest/download/PhoenixNetCheck.exe';

function tcpTime(host, port, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const s = net.connect({ host, port });
    const done = (ok) => { s.destroy(); resolve(ok ? Date.now() - t0 : null); };
    s.setTimeout(timeoutMs, () => done(false));
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
  });
}

// любой HTTP-ответ (даже 4xx) = TLS прошёл
function httpsCode(url, timeoutMs = 7000) {
  return new Promise((resolve) => {
    const rq = https.request(url, { method: 'HEAD', timeout: timeoutMs }, (res) => { res.resume(); resolve(String(res.statusCode)); });
    rq.on('timeout', () => rq.destroy(new Error('Timeout')));
    rq.on('error', (e) => resolve(e.message === 'Timeout' ? 'Timeout' : e.code || e.message));
    rq.end();
  });
}

// TS3INIT1: тот же пакет, с которого начинает клиент TeamSpeak; ответ = сервер жив и UDP проходит
function ts3Alive(ip, port, timeoutMs = 2500) {
  return new Promise((resolve) => {
    const sock = dgram.createSocket('udp4');
    const ts = Buffer.alloc(4); ts.writeUInt32BE(Math.floor(Date.now() / 1000));
    const pkt = Buffer.concat([Buffer.from('TS3INIT1'), Buffer.from([0x00, 0x65, 0x88, 0x06, 0x3b, 0xec, 0xe9, 0x00]), ts,
      Buffer.from([1, 2, 3, 4]), Buffer.alloc(8)]);
    const t0 = Date.now();
    const finish = (v) => { clearTimeout(timer); try { sock.close(); } catch {} resolve(v); };
    const timer = setTimeout(() => finish(null), timeoutMs);
    sock.on('message', (m) => finish(m.slice(0, 8).toString() === 'TS3INIT1' ? Date.now() - t0 : null));
    sock.on('error', () => finish(null));
    sock.send(pkt, port, ip);
  });
}

function isPrivate(ip) {
  return /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
}

function readHosts() {
  return null;
}

function winwsRunning() {
  return Promise.resolve(false);
}

function zapretFolders() {
  return [];
}

async function runChecks({ resolveProxy } = {}) {
  const R = [];
  const add = (r) => R.push({ hint: null, ...r });

  const [inet1, inet2, dnsRes, pings, roleMs, tsRes, a2s, steamApi, steamCom, dc1, dc2, lan, winws] = await Promise.all([
    tcpTime('1.1.1.1', 443), tcpTime('8.8.8.8', 443),
    dns.lookup('discord.com').then((r) => r.address).catch((e) => ({ err: e.code || e.message })),
    (async () => { const a = []; for (let i = 0; i < 4; i++) a.push(await tcpTime(PHX_HOST, ROLE_API_PORT, 3000)); return a; })(),
    tcpTime(PHX_HOST, ROLE_API_PORT),
    Promise.all(TS.map(([, ip, port]) => ts3Alive(ip, port))),
    Promise.all(SERVERS.map(([, , qp]) => queryServer(PHX_HOST, qp, { withPlayers: false, timeoutMs: 3000 }))),
    httpsCode('https://api.steampowered.com/'), httpsCode('https://steamcommunity.com/'),
    httpsCode('https://discord.com/api/v9/gateway'), httpsCode('https://cdn.discordapp.com/'),
    dns.lookup('lancache.steamcontent.com', { all: true }).catch(() => []),
    winwsRunning(),
  ]);

  const inet = inet1 ?? inet2;
  add({ id: 'inet', name: 'Интернет', status: inet != null ? 'ok' : 'fail', detail: inet != null ? `есть, ${inet} мс` : 'нет связи с 1.1.1.1 и 8.8.8.8' });
  const dnsOk = typeof dnsRes === 'string';
  add({ id: 'dns', name: 'DNS', status: dnsOk ? 'ok' : 'fail', detail: dnsOk ? `discord.com → ${dnsRes}` : `не работает (${dnsRes.err})`,
    hint: dnsOk ? null : 'смените DNS на 1.1.1.1 или 8.8.8.8 в настройках сети' });

  const okP = pings.filter((p) => p != null);
  add({ id: 'ping', name: 'Задержка до сервера', status: okP.length ? (okP.length < pings.length ? 'warn' : 'ok') : 'fail',
    detail: okP.length
      ? `ср. ${Math.round(okP.reduce((a, b) => a + b, 0) / okP.length)} мс, макс ${Math.max(...okP)} мс, потери ${Math.round(100 * (pings.length - okP.length) / pings.length)}%`
      : 'сервер не отвечает' });

  SERVERS.forEach(([id, name, qp], i) => {
    const q = a2s[i];
    const on = q.status === 'online';
    add({ id: `a2s_${id}`, name: `${name} (UDP ${qp})`, status: on ? 'ok' : 'warn',
      detail: on ? `онлайн, игроков ${q.players}/${q.maxPlayers ?? '?'}, ответ ${q.ping} мс` : 'не отвечает (сервер выключен, или UDP режет VPN/zapret/брандмауэр)' });
  });

  add({ id: 'ts', name: 'TeamSpeak 3', status: tsRes.some((t) => t != null) ? 'ok' : 'warn',
    detail: TS.map(([n, ip, port], i) => `${n} ${ip}:${port} — ${tsRes[i] != null ? `OK ${tsRes[i]} мс` : 'нет ответа'}`).join('; ') });

  add({ id: 'roleapi', name: `Сервер входа Phoenix (TCP ${ROLE_API_PORT})`, status: roleMs != null ? 'ok' : 'warn',
    detail: roleMs != null ? `доступен, ${roleMs} мс` : 'недоступен — вход через Discord в лаунчере не сработает; вход в игре по SteamID работает' });

  const steamOk = /^\d/.test(steamApi) && /^\d/.test(steamCom);
  add({ id: 'steam_web', name: 'Steam (API и Workshop)', status: steamOk ? 'ok' : 'warn',
    detail: `api.steampowered.com: ${steamApi}, steamcommunity.com: ${steamCom}`, hint: steamOk ? null : 'Workshop может не обновлять моды' });

  const dcOk = /^\d/.test(dc1) && /^\d/.test(dc2);
  add({ id: 'discord', name: 'Discord', status: dcOk ? 'ok' : 'warn', detail: `discord.com: ${dc1}, cdn: ${dc2}` });

  const hosts = readHosts();
  if (hosts) {
    const bad = hosts.filter((l) => l.includes(PHX_HOST) || /steampowered|steamcontent|steamcommunity/i.test(l));
    add({ id: 'hosts', name: 'Файл hosts', status: bad.length ? 'warn' : 'ok',
      detail: bad.length ? `строки про Steam/сервер: ${bad.join(' | ')}` : 'Steam и сервер не переопределены',
      hint: bad.length ? 'если моды не качаются, проверьте эти строки вручную' : null });
  }

  const privLan = lan.find((a) => isPrivate(a.address));
  add({ id: 'lancache', name: 'Кэш загрузок Steam', status: privLan ? 'warn' : 'ok',
    detail: privLan ? `DNS провайдера отправляет загрузки Steam в свой кэш ${privLan.address} — моды могут качаться медленно или битыми` : 'обычные серверы Valve',
    hint: privLan ? 'помогает смена DNS на 1.1.1.1' : null });

  const vpn = Object.keys(os.networkInterfaces()).filter((n) => VPN_RE.test(n));
  let proxy = null;
  try { const p = resolveProxy ? await resolveProxy('https://discord.com') : 'DIRECT'; if (p && p !== 'DIRECT') proxy = p; } catch {}
  add({ id: 'proxy', name: 'Прокси / VPN', status: vpn.length || proxy ? 'warn' : 'ok',
    detail: [vpn.length ? `VPN/виртуальные адаптеры: ${vpn.join(', ')}` : null, proxy ? `системный прокси: ${proxy}` : null].filter(Boolean).join('; ') || 'нет',
    hint: vpn.length || proxy ? 'если не заходит на сервер, выключите VPN/прокси' : null });

  if (winws) {
    const folders = zapretFolders();
    const excluded = folders.filter((f) => {
      try { return fs.readFileSync(path.join(f, 'lists', 'ipset-exclude-user.txt'), 'utf8').includes(PHX_HOST); } catch { return false; }
    });
    const miss = folders.length > 0 && excluded.length === 0;
    add({ id: 'zapret', name: 'Zapret', status: miss ? 'warn' : 'ok',
      detail: excluded.length ? 'работает, сервер Phoenix в исключениях' : miss ? 'работает, сервер Phoenix НЕ в исключениях' : 'работает',
      hint: miss ? `добавьте строку ${PHX_HOST}/32 в lists\\ipset-exclude-user.txt папки zapret и перезапустите zapret` : null });
  } else {
    add({ id: 'zapret', name: 'Zapret', status: 'info', detail: 'не запущен' });
  }
  return R;
}

function createNetCheck({ onUpdate, resolveProxy }) {
  let last = null;
  let running = null;
  const publish = (s) => { last = s; onUpdate?.(s); return s; };

  function run() {
    if (running) return running;
    publish({ state: 'checking', error: null });
    running = runChecks({ resolveProxy })
      .then((results) => publish({ state: 'done', at: Date.now(), results,
        problems: results.filter((r) => r.status === 'fail' || r.status === 'warn').length }))
      .catch((e) => publish({ state: 'error', error: e.message, at: Date.now() }))
      .finally(() => { running = null; });
    return running;
  }

  return { run, get: () => last };
}

module.exports = { createNetCheck, runChecks, NETCHECK_URL };
