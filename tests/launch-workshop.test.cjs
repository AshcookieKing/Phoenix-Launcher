const test = require('node:test');
const assert = require('node:assert/strict');
const timers = require('node:timers/promises');
const arma = require('../electron/arma.cjs');
const workshop = require('../electron/workshop-ugc.cjs');

const mods = ['11', '22', '33'].map((id) => ({ workshopId: id, name: 'Mod ' + id }));
const config = { armaExe: 'C:/Arma/arma3_x64.exe', workshopDir: 'C:/Mods', profilingLaunch: false };

function diskState(mods, statuses = {}) {
  return mods.map((m) => ({
    ...m,
    status: statuses[m.workshopId] || 'ok',
    path: config.workshopDir + '/' + m.workshopId,
  }));
}

function completedRun(ids) {
  const items = new Map(ids.map((id) => [id, { ready: true }]));
  return { promise: Promise.resolve({ ok: true, items }), cancel() {} };
}

function fixture(t, { check = diskState, run = completedRun, available = true } = {}) {
  const runs = [];
  const launches = [];
  t.mock.method(timers, 'setTimeout', async () => {});
  t.mock.method(workshop, 'helperAvailable', () => available);
  t.mock.method(workshop, 'runWorkshop', (_dir, mode, ids, opts) => {
    runs.push({ mode, ids, repairIds: opts.repairIds });
    return run(ids, opts);
  });
  t.mock.method(arma, 'checkMods', (list, _cfg, opts) => check(list, opts));
  t.mock.method(arma, 'launchGame', async (_cfg, modParam) => {
    launches.push(modParam);
    return { pid: 9, exe: config.armaExe };
  });
  // launch.cjs captures the native runner when its CommonJS module is first loaded.
  const key = require.resolve('../electron/launch.cjs');
  delete require.cache[key];
  const { syncWorkshop, prepareAndLaunch } = require(key);
  t.after(() => { delete require.cache[key]; });
  const onProgress = () => {};
  return {
    runs, launches,
    sync: (signal) => syncWorkshop(mods, config, onProgress, signal),
    launch: (signal) => prepareAndLaunch({ mods, config, onProgress, signal }),
  };
}

test('submits the entire preset, flags disk repairs, and requeues only incomplete files after DONE', async (t) => {
  let passes = 0;
  const f = fixture(t, {
    check(list, opts) {
      assert.equal(opts.localOnly, true);
      assert.deepEqual(list.map((m) => m.workshopId), ['11', '22', '33']);
      if (!opts.items) return diskState(list, { 22: 'missing', 33: 'outdated' });
      assert.equal(opts.items.size, 3);
      return diskState(list, ++passes === 1 ? { 33: 'missing' } : {});
    },
  });
  const result = await f.sync();
  assert.equal(result.ok, true);
  assert.deepEqual(result.checked, diskState(mods));
  assert.deepEqual(f.runs, [
    { mode: 'sync', ids: ['11', '22', '33'], repairIds: ['22', '33'] },
    { mode: 'sync', ids: ['33'], repairIds: ['33'] },
  ]);
  assert.deepEqual(f.launches, []);
});

test('a second false DONE stops launch and names the incomplete mod', async (t) => {
  const f = fixture(t, { check: (list) => diskState(list, { 22: 'missing' }) });
  const result = await f.launch();
  assert.equal(result.ok, false);
  assert.match(result.error, /Mod 22/);
  assert.equal(f.runs.length, 2);
  assert.deepEqual(f.launches, []);
});

test('a Steam item error is preserved even if the local check passed', async (t) => {
  const failed = { ok: false, code: 'item_error', error: 'нет доступа к моду 22' };
  const f = fixture(t, { run: () => ({ promise: Promise.resolve(failed), cancel() {} }) });
  assert.deepEqual(await f.launch(), failed);
  assert.deepEqual(f.launches, []);
});

test('retries stalls once per mod and stops when the same mod stalls again', async (t) => {
  const stalled = (workshopId) => ({ ok: false, code: 'stalled', workshopId, error: 'Steam stalled' });
  let responses = [stalled('11'), stalled('22'), { ok: true }];
  const f = fixture(t, {
    run(ids) {
      const response = responses.shift();
      assert.ok(response, 'the helper must stop after the permitted retries');
      return response.ok ? completedRun(ids) : { promise: Promise.resolve(response), cancel() {} };
    },
  });
  assert.equal((await f.sync()).ok, true);
  assert.equal(f.runs.length, 3);
  assert.equal(responses.length, 0);

  const repeated = stalled('11');
  responses = [stalled('11'), stalled('22'), repeated, { ok: true }];
  assert.deepEqual(await f.launch(), repeated);
  assert.equal(f.runs.length, 6);
  assert.deepEqual(responses, [{ ok: true }]);
  assert.deepEqual(f.launches, []);
});

test('cancelling in the native runner stops the helper and prevents game launch', async (t) => {
  const controller = new AbortController();
  let resolveStarted;
  const started = new Promise((resolve) => { resolveStarted = resolve; });
  let cancelled = false;
  const f = fixture(t, {
    run() {
      let finish;
      const promise = new Promise((resolve) => { finish = resolve; });
      resolveStarted();
      return { promise, cancel() { cancelled = true; finish({ ok: false, cancelled: true }); } };
    },
  });
  const result = f.launch(controller.signal);
  await started;
  controller.abort();
  await assert.rejects(result, { name: 'AbortError' });
  assert.equal(cancelled, true);
  assert.deepEqual(f.launches, []);
});

test('offline fallback rejects an outdated mod and permits a verified complete preset', async (t) => {
  let outdated = true;
  const f = fixture(t, { available: false, check(list, opts) {
    assert.equal(opts.force, true);
    return diskState(list, outdated ? { 22: 'outdated' } : {});
  } });
  assert.equal((await f.launch()).ok, false);
  assert.deepEqual(f.launches, []);
  outdated = false;
  const result = await f.launch();
  assert.equal(result.ok, true);
  assert.equal(result.modCount, 3);
  assert.deepEqual(f.launches, [diskState(mods).map((m) => m.path).join(';')]);
  assert.deepEqual(f.runs, []);
});
