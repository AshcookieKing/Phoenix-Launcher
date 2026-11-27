// Сборка установщика и portable без elevate.exe: electron-builder кладёт его принудительно при perMachine,
// а лаунчер его не использует (обновление открывает обычный установщик). Лишний помощник повышения прав
// антивирусы считают подозрительным. Вызов: node scripts/build-win.cjs [папка_вывода]
const nsisUtil = require('app-builder-lib/out/targets/nsis/nsisUtil');
nsisUtil.CopyElevateHelper.prototype.copy = () => Promise.resolve();
const { build, Platform } = require('electron-builder');
const out = process.argv[2];
build({
  targets: Platform.WINDOWS.createTarget(['nsis', 'portable']),
  config: out ? { directories: { output: out } } : undefined,
}).then(() => console.log('OK'), (e) => { console.error(e); process.exit(1); });
