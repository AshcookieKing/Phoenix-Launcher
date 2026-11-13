const test = require('node:test');
const assert = require('node:assert/strict');
const { launchProfileName } = require('../electron/arma-profiles.cjs');
const { buildLaunchArgs } = require('../electron/arma.cjs');

const profiles = [{ id: 'old', displayName: 'Old character' }];

test('older settings follow the current Arma profile without forcing a stale name', () => {
  const config = { activeProfileId: 'old', playerName: 'Old character' };
  const playerName = launchProfileName(config, profiles);
  assert.equal(playerName, '');
  assert.equal(buildLaunchArgs({ ...config, playerName }, '').some(arg => arg.startsWith('-name=')), false);
});

test('explicit profile selection and per-character launch preserve the requested name', () => {
  assert.equal(launchProfileName({ profileMode: 'selected', activeProfileId: 'old' }, profiles), 'Old character');
  assert.equal(launchProfileName({ profileMode: 'selected', activeProfileId: 'deleted' }, profiles), '');
  assert(buildLaunchArgs({ playerName: 'Character name' }, '').includes('-name=Character name'));
});
