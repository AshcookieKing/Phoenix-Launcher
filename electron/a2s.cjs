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
    sock.once('message', (msg) => {
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
    const base = payload[4] === 0x55 ? payload.subarray(0, 5) : payload;
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

module.exports = { queryServer };
