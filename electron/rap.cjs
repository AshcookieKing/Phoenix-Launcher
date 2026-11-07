// Чтение бинарного конфига Arma (raP): *.vars.Arma3Profile, config.bin
// Узел класса: { __class: true, name, entries: Map(имя в нижнем регистре -> значение | класс) }

function reader(buf) {
  let o = 0;
  const r = {
    get pos() {
      return o;
    },
    seek(p) {
      o = p;
    },
    u8: () => buf[o++],
    u32: () => {
      const v = buf.readUInt32LE(o);
      o += 4;
      return v;
    },
    i32: () => {
      const v = buf.readInt32LE(o);
      o += 4;
      return v;
    },
    f32: () => {
      const v = buf.readFloatLE(o);
      o += 4;
      return v;
    },
    i64: () => {
      const v = buf.readBigInt64LE(o);
      o += 8;
      return Number(v);
    },
    str: () => {
      const end = buf.indexOf(0, o);
      const s = buf.toString('utf8', o, end);
      o = end + 1;
      return s;
    },
    varint: () => {
      let v = 0;
      let shift = 0;
      for (;;) {
        const b = buf[o++];
        v += (b & 0x7f) * 2 ** shift;
        if (!(b & 0x80)) return v;
        shift += 7;
      }
    },
  };
  return r;
}

function readArray(r) {
  const n = r.varint();
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = r.u8();
    if (t === 0) out.push(r.str());
    else if (t === 1) out.push(r.f32());
    else if (t === 2) out.push(r.i32());
    else if (t === 3) out.push(readArray(r));
    else if (t === 4) out.push(r.str()); // переменная
    else if (t === 6) out.push(r.i64());
    else throw new Error(`raP: тип элемента массива ${t}`);
  }
  return out;
}

function readClass(r, name, depth) {
  if (depth > 64) throw new Error('raP: слишком глубоко');
  r.str(); // родительский класс
  const n = r.varint();
  const entries = new Map();
  const pending = [];
  for (let i = 0; i < n; i++) {
    const t = r.u8();
    if (t === 0) {
      const cname = r.str();
      const offset = r.u32();
      pending.push([cname, offset]);
    } else if (t === 1) {
      const sub = r.u8();
      const vname = r.str();
      let v;
      if (sub === 0 || sub === 4) v = r.str();
      else if (sub === 1) v = r.f32();
      else if (sub === 2) v = r.i32();
      else if (sub === 6) v = r.i64();
      else throw new Error(`raP: тип значения ${sub}`);
      entries.set(vname.toLowerCase(), v);
    } else if (t === 2) {
      const aname = r.str();
      entries.set(aname.toLowerCase(), readArray(r));
    } else if (t === 3 || t === 4) {
      r.str();
    } else if (t === 5) {
      r.u32();
      const aname = r.str();
      entries.set(aname.toLowerCase(), readArray(r));
    } else {
      throw new Error(`raP: тип записи ${t}`);
    }
  }
  const back = r.pos;
  for (const [cname, offset] of pending) {
    r.seek(offset);
    entries.set(cname.toLowerCase(), readClass(r, cname, depth + 1));
  }
  r.seek(back);
  return { __class: true, name, entries };
}

function parseRap(buf) {
  if (buf.length < 16 || buf.toString('latin1', 0, 4) !== '\0raP') throw new Error('не raP');
  const r = reader(buf);
  r.seek(16);
  return readClass(r, '', 0);
}

// --- Переменные профиля (profileNamespace) ---
// ProfileVariables { ItemN { name = "..."; data { singleType = "ARRAY"; value { items = N; ItemK { data {...} } } } } }
// HASHMAP: data { singleType = "HASHMAP"; v { "0" = ключ (data), "0v" = значение (data), ... } } -> объект

function decodeData(node) {
  if (!node?.__class) return null;
  const typ = node.entries.get('singletype') ?? node.entries.get('type');
  const t = String(Array.isArray(typ) ? typ[0] : typ || '').toUpperCase();
  const value = node.entries.get('value');
  if (t === 'ARRAY') {
    const out = [];
    if (!value?.__class) return out;
    const n = Number(value.entries.get('items')) || 0;
    for (let i = 0; i < n; i++) {
      const item = value.entries.get(`item${i}`);
      out.push(decodeData(item?.entries.get('data')));
    }
    return out;
  }
  if (t === 'BOOL') return Boolean(value);
  if (t === 'SCALAR') return Number(value);
  if (t === 'STRING' || t === 'TEXT') return value == null ? '' : String(value);
  if (t === 'HASHMAP') {
    const v = node.entries.get('v');
    const out = {};
    if (!v?.__class) return out;
    for (const [k, keyNode] of v.entries) {
      if (k.endsWith('v')) continue;
      const key = decodeData(keyNode);
      if (key == null) continue;
      out[String(key)] = decodeData(v.entries.get(`${k}v`));
    }
    return out;
  }
  return value ?? null;
}

// Возвращает Map(имя переменной в нижнем регистре -> значение); only - список нужных имён (остальные не декодируются)
function readProfileVars(buf, only = null) {
  const root = parseRap(buf);
  const pv = root.entries.get('profilevariables');
  const out = new Map();
  if (!pv?.__class) return out;
  const want = only ? new Set(only.map((s) => s.toLowerCase())) : null;
  for (const [key, item] of pv.entries) {
    if (!key.startsWith('item') || !item?.__class) continue;
    const name = String(item.entries.get('name') || '').toLowerCase();
    if (!name || (want && !want.has(name))) continue;
    out.set(name, decodeData(item.entries.get('data')));
  }
  return out;
}

module.exports = { parseRap, readProfileVars };
