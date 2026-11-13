const test = require('node:test');
const assert = require('node:assert/strict');
const { parseArmaMods } = require('../electron/a2s.cjs');

function encode(bytes) {
  const escape = { 0: [1, 2], 1: [1, 1], 255: [1, 3] };
  return Buffer.from(bytes.flatMap((v) => escape[v] || [v]));
}

function rules(pages) {
  const fields = [Buffer.from([255, 255, 255, 255, 0x45, pages.length, 0])];
  for (const [index, total, bytes] of pages) {
    fields.push(Buffer.from([index, total, 0]), bytes, Buffer.from([0]));
  }
  return Buffer.concat(fields);
}

// Header without DLC, followed by the mod records [hash, ID length, ID bytes, name length, name].
const header = [3, 0, 0, 0, 0, 0, 2];
const first = [0, 0, 0, 0, 1, 255, 1, 65];
const second = [0, 0, 0, 0, 1, 77, 1, 66];

test('parses an entire server list from out-of-order pages', () => {
  const msg = rules([[2, 2, encode([...second, 0])], [1, 2, encode([...header, ...first])]]);
  assert.deepEqual(parseArmaMods(msg), [{ workshopId: '255', name: 'A' }, { workshopId: '77', name: 'B' }]);
});

test('rejects a partial list when a whole mod, part of its name, or a page is missing', () => {
  assert.throws(() => parseArmaMods(rules([[1, 1, encode([...header, ...first])]])));
  assert.throws(() => parseArmaMods(rules([[1, 1, encode([...header, ...first, ...second.slice(0, -1)])]])));
  assert.throws(() => parseArmaMods(rules([[1, 2, encode([...header, ...first])]])));
});

test('rejects an overflow response even when its advertised records fit', () => {
  const overflow = [3, 1, ...header.slice(2), ...first, ...second, 0];
  assert.throws(() => parseArmaMods(rules([[1, 1, encode(overflow)]])));
});
