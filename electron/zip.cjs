// Чтение zip в памяти (пакет плагина TeamSpeak .ts3_plugin): без PowerShell и без распаковки во временную папку.
// Поддерживается обычный zip (без zip64): методы «без сжатия» и deflate. readZip(файл) -> [{ name, data }]
const fs = require('fs');
const zlib = require('zlib');

function readZip(file) {
  const buf = fs.readFileSync(file);
  // конец центрального каталога: сигнатура 0x06054b50 в последних 64 КБ + 22 байта
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('zip: no central directory');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('zip: bad entry');
    const method = buf.readUInt16LE(p + 10);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen).replace(/\\/g, '/');
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    if (buf.readUInt32LE(local) !== 0x04034b50) throw new Error('zip: bad local header');
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + csize);
    let data;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = zlib.inflateRawSync(raw);
    else throw new Error(`zip: method ${method}`);
    if (data.length !== usize) throw new Error('zip: size mismatch');
    out.push({ name, data });
  }
  return out;
}

module.exports = { readZip };
