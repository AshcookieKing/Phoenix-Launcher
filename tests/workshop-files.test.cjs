const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { checkMods } = require('../electron/arma.cjs');
const { derivePathsFromArmaExe, validateGamePaths } = require('../electron/paths.cjs');

function write(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
}

function library(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'phoenix-workshop-'));
  t.after(() => {
    assert.equal(path.dirname(root), os.tmpdir());
    fs.rmSync(root, { recursive: true, force: true });
  });
  const armaExe = path.join(root, 'steamapps', 'common', 'Arma 3', 'arma3_x64.exe');
  write(armaExe, '');
  return derivePathsFromArmaExe(armaExe);
}

function manifest(config, installed, details) {
  function section(name, items) {
    const rows = Object.entries(items).map(([id, fields]) => {
      const values = Object.entries(fields).map(([key, val]) => '"' + key + '" "' + val + '"').join('\n');
      return '"' + id + '" {\n' + values + '\n}';
    });
    return '"' + name + '" {\n' + rows.join('\n') + '\n}';
  }
  write(config.acfPath, '"AppWorkshop" {\n' + section('WorkshopItemsInstalled', installed) + '\n' +
    section('WorkshopItemDetails', details) + '\n}');
}

function check(config, ids, items) {
  return checkMods(ids.map((workshopId) => ({ workshopId })), config, { localOnly: true, items });
}

test('первая установка без Workshop: пути действительны, все моды требуют загрузки', async (t) => {
  const config = library(t);
  assert.equal(validateGamePaths(config).valid, true);
  assert.equal(validateGamePaths({ ...config, workshopDir: path.join(config.steamPath, 'wrong') }).valid, false);
  assert.equal((await check(config, ['10']))[0].status, 'missing');
  assert.equal(fs.existsSync(config.workshopDir), false);
});

test('целевая версия WorkshopItemDetails не заменяет установленную, файл проверяется и после DONE', async (t) => {
  const config = library(t);
  const folder = path.join(config.workshopDir, '10');
  const pack = path.join(folder, 'addons', 'first.pbo');
  const missing = path.join(folder, 'addons', '3d.pbo');
  write(pack, '1234');
  manifest(config, { 10: { manifest: '10', timeupdated: '1000', size: '10' } },
    { 10: { manifest: '20', latest_manifest: '20', timeupdated: '2000' } });

  assert.equal((await check(config, ['10']))[0].status, 'missing');
  const items = new Map([['10', { ready: true, folder, size: 10, stamp: 2000 }]]);
  assert.equal((await check(config, ['10'], items))[0].status, 'missing');
  write(missing, '123456');
  const [old] = await check(config, ['10']);
  assert.equal(old.status, 'outdated');
  assert.equal(old.localTime, 1000);
  const [ready] = await check(config, ['10'], items);
  assert.equal(ready.status, 'ok');
  assert.equal(ready.path, folder);
  assert.equal(ready.localTime, 2000);
  fs.unlinkSync(missing);
  assert.equal((await check(config, ['10'], items))[0].status, 'missing');
});

test('пустая папка и подписка без установленного манифеста остаются незагруженными', async (t) => {
  const config = library(t);
  fs.mkdirSync(path.join(config.workshopDir, '11', 'addons'), { recursive: true });
  write(path.join(config.workshopDir, '12', 'meta.cpp'), 'partial');
  manifest(config, { 11: { manifest: '11', size: '80' } },
    { 12: { manifest: '12', latest_manifest: '12', timeupdated: '2000' } });
  assert.deepEqual((await check(config, ['11', '12'])).map((m) => m.status), ['missing', 'missing']);
});

test('манифест и размер относятся к той же библиотеке, поддерживаются файлы без addons', async (t) => {
  const first = library(t);
  const second = library(t);
  manifest(first, { 13: { manifest: '1', timeupdated: '1000', size: '10' } }, { 13: { latest_manifest: '2' } });
  write(path.join(first.workshopDir, '13', 'mod.cpp'), '1');
  manifest(second, { 13: { manifest: '-1', timeupdated: '2000', size: '5' } }, {});
  const folder = path.join(second.workshopDir, '13');
  write(path.join(folder, 'extension_x64.dll'), '12345');
  const config = { ...first, libraries: [second.steamPath] };
  const [mod] = await check(config, ['13']);
  assert.equal(mod.status, 'ok');
  assert.equal(mod.path, folder);
  fs.unlinkSync(path.join(folder, 'extension_x64.dll'));
  assert.equal((await check(config, ['13']))[0].status, 'missing');
});

test('Steam ещё не записал ACF после установки, проверяется фактическая папка и размер из UGC', async (t) => {
  const config = library(t);
  const folder = path.join(config.workshopDir, '14');
  const sub = path.join(folder, '@nested');
  write(path.join(sub, 'addons', 'mod.pbo'), '12345');
  const items = new Map([['14', { ready: true, folder, stamp: 1000, size: 5 }]]);
  const [mod] = await check(config, ['14'], items);
  assert.equal(mod.status, 'ok');
  assert.equal(mod.path, sub);
});
