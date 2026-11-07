// Опрос Arma-сервера по Steam A2S (UDP): A2S_INFO + A2S_PLAYER, с поддержкой challenge
const dgram = require('dgram');

const HEADER = Buffer.from([0xff, 0xff, 0xff, 0xff]);
const A2S_INFO = Buffer.concat([HEADER, Buffer.from('TSource Engine Query\0', 'latin1')]);

function udpRequest(host, port, payload, timeoutMs) {
  return new Promise((resolve, reject) => {
    const sock = dgram.createSocket('udp4');
    const started = Date.now();
    const timer = setTimeout(() => {
      sock.close();
      reject(new Error('timeout'));
    }, timeoutMs);
    // длинный ответ (A2S_RULES с модами) приходит частями: заголовок -2, id, всего частей, номер, размер
    const parts = [];
    let total = 0;
    sock.on('message', (msg) => {
      if (msg.length >= 12 && msg.readInt32LE(0) === -2) {
        total = msg[8];
        parts[msg[9]] = msg.subarray(12);
        if (parts.filter(Boolean).length < total) return;
        msg = Buffer.concat(parts);
      }
      clearTimeout(timer);
      sock.close();
      resolve({ msg, ping: Date.now() - started });
    });
    sock.once('error', (err) => {
      clearTimeout(timer);
      try {
        sock.close();
      } catch {}
      reject(err);
    });
    sock.send(payload, port, host);
  });
}

// Запрос с повтором, если сервер ответил challenge (0x41)
async function query(host, port, payload, timeoutMs) {
  let res = await udpRequest(host, port, payload, timeoutMs);
  if (res.msg.length >= 9 && res.msg[4] === 0x41) {
    const challenge = res.msg.subarray(5, 9);
    const base = payload[4] === 0x55 || payload[4] === 0x56 ? payload.subarray(0, 5) : payload;
    res = await udpRequest(host, port, Buffer.concat([base, challenge]), timeoutMs);
  }
  return res;
}

function reader(buf, offset) {
  let o = offset;
  return {
    byte: () => buf[o++],
    short: () => {
      const v = buf.readInt16LE(o);
      o += 2;
      return v;
    },
    long: () => {
      const v = buf.readInt32LE(o);
      o += 4;
      return v;
    },
    float: () => {
      const v = buf.readFloatLE(o);
      o += 4;
      return v;
    },
    str: () => {
      const end = buf.indexOf(0, o);
      const s = buf.toString('utf8', o, end < 0 ? buf.length : end);
      o = end < 0 ? buf.length : end + 1;
      return s;
    },
    left: () => buf.length - o,
  };
}

function parseInfo(msg) {
  if (msg[4] !== 0x49) throw new Error('bad info');
  const r = reader(msg, 5);
  r.byte(); // protocol
  const name = r.str();
  const map = r.str();
  r.str(); // folder
  const game = r.str();
  r.short(); // app id
  const players = r.byte();
  const maxPlayers = r.byte();
  const bots = r.byte();
  return { name, map, game, players, maxPlayers, bots };
}

function parsePlayers(msg) {
  if (msg[4] !== 0x44) return [];
  const r = reader(msg, 5);
  const count = r.byte();
  const list = [];
  for (let i = 0; i < count && r.left() > 0; i++) {
    r.byte(); // index
    const name = r.str();
    const score = r.long();
    const duration = r.float();
    if (name) list.push({ name, score, duration: Math.round(duration) });
  }
  return list;
}

async function queryServer(host, queryPort, { timeoutMs = 2500, withPlayers = true } = {}) {
  try {
    const { msg, ping } = await query(host, queryPort, A2S_INFO, timeoutMs);
    const info = parseInfo(msg);
    let playerList = [];
    if (withPlayers && info.players > 0) {
      try {
        const req = Buffer.concat([HEADER, Buffer.from([0x55, 0xff, 0xff, 0xff, 0xff])]);
        const res = await query(host, queryPort, req, timeoutMs);
        playerList = parsePlayers(res.msg);
      } catch {}
    }
    // players — число игроков из A2S_INFO, playerList — имена из A2S_PLAYER
    return { status: 'online', ping, ...info, playerList, updatedAt: Date.now() };
  } catch (e) {
    return { status: 'offline', ping: null, players: 0, playerList: [], error: e.message, updatedAt: Date.now() };
  }
}

// Моды сервера Arma 3 из A2S_RULES (протокол BI «ServerBrowserProtocol3»): правила-куски с ключом [номер, всего]
// склеиваются в бинарный блок; в нём DLC и список модов [хэш, id Workshop, имя] - ровно то, что сервер требует
function parseArmaMods(msg) {
  if (msg[4] !== 0x45) throw new Error('bad rules');
  const n = msg.readUInt16LE(5);
  let o = 7;
  const chunks = [];
  for (let i = 0; i < n && o < msg.length; i++) {
    const kEnd = msg.indexOf(0, o);
    const key = msg.subarray(o, kEnd);
    o = kEnd + 1;
    const vEnd = msg.indexOf(0, o);
    const val = msg.subarray(o, vEnd < 0 ? msg.length : vEnd);
    o = vEnd < 0 ? msg.length : vEnd + 1;
    if (key.length === 2) chunks.push([key[0], val]);
  }
  chunks.sort((a, b) => a[0] - b[0]);
  const raw = Buffer.concat(chunks.map((c) => c[1]));
  // экранирование: 01 01 -> 01, 01 02 -> 00, 01 03 -> FF
  const bytes = [];
  for (let i = 0; i < raw.length; i++) {
    if (raw[i] === 1 && i + 1 < raw.length) {
      const e = raw[++i];
      bytes.push(e === 1 ? 1 : e === 2 ? 0 : e === 3 ? 0xff : e);
    } else bytes.push(raw[i]);
  }
  const b = Buffer.from(bytes);
  let p = 2; // версия, флаги переполнения
  const dlcFlags = b.readUInt16LE(p);
  p += 2;
  for (let f = dlcFlags; f; f >>= 1) if (f & 1) p += 4; // хэши DLC
  p += 2; // сложность, прицел
  const count = b[p++];
  const mods = [];
  for (let i = 0; i < count && p < b.length; i++) {
    p += 4; // хэш мода
    const info = b[p++];
    const idLen = info & 0x0f;
    let id = 0n;
    for (let j = 0; j < idLen; j++) id |= BigInt(b[p + j]) << (8n * BigInt(j));
    p += idLen;
    const nameLen = b[p++];
    const name = b.toString('utf8', p, p + nameLen);
    p += nameLen;
    if (!(info & 0x10) && id > 0n) mods.push({ workshopId: id.toString(), name });
  }
  return mods;
}

async function queryServerMods(host, queryPort, { timeoutMs = 4000 } = {}) {
  const req = Buffer.concat([HEADER, Buffer.from([0x56, 0xff, 0xff, 0xff, 0xff])]);
  const { msg } = await query(host, queryPort, req, timeoutMs);
  return parseArmaMods(msg);
}

module.exports = { queryServer, queryServerMods };
