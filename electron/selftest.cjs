// Самопроверка сборки: PHX_SELFTEST=<папка> — окно скрыто, через несколько секунд снимок страницы и отчёт, затем выход
const fs = require('fs');
const path = require('path');

function runSelfTest(app, win, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const report = {};
  const shot = async (name) => {
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(outDir, `${name}.png`), img.toPNG());
  };
  const js = (code) => win.webContents.executeJavaScript(code, true);

  win.webContents.once('did-finish-load', async () => {
    try {
      await new Promise((r) => setTimeout(r, 9000));
      report.home = await js(`({
        servers: [...document.querySelectorAll('.server-card')].map(c => c.innerText.replace(/\\s+/g,' ')),
        account: document.querySelector('.account')?.innerText.replace(/\\s+/g,' '),
        dock: document.querySelector('.dock')?.innerText.replace(/\\s+/g,' '),
      })`);
      await shot('home');
      for (const tab of ['Моды', 'Системы', 'Настройки']) {
        await js(`[...document.querySelectorAll('.tab')].find(b => b.textContent.includes('${tab}')).click()`);
        await new Promise((r) => setTimeout(r, tab === 'Моды' ? 3500 : 1500));
        await shot({ Моды: 'mods', Системы: 'systems', Настройки: 'settings' }[tab]);
        if (tab === 'Моды') {
          report.mods = await js(`[...document.querySelectorAll('.mod-row')].map(r => r.innerText.replace(/\\s+/g,' '))`);
        }
      }
      // чекер сети: дождаться итога проверки при запуске и снять панель в Настройках
      if (!(await js('window.phoenix.netCheckGet()'))) await js('window.phoenix.netCheckRun({})');
      for (let i = 0; i < 95; i++) {
        const st = await js(`window.phoenix.netCheckGet().then(s => s && s.state)`);
        if (st === 'done' || st === 'error') break;
        await new Promise((r) => setTimeout(r, 1000));
      }
      await js(`[...document.querySelectorAll('.tab')].find(b => b.textContent.includes('Настройки')).click()`);
      await new Promise((r) => setTimeout(r, 1500));
      await js(`document.querySelector('.netcheck')?.scrollIntoView()`);
      await new Promise((r) => setTimeout(r, 500));
      report.netcheck = await js(`document.querySelector('.netcheck')?.innerText.replace(/\\s+/g,' ')`);
      await shot('network');
      report.checkerState = await js('window.phoenix.netCheckGet().then(s => s?.state)');
      if (report.checkerState !== 'done') throw new Error('Чекер не вернул отчёт');
    } catch (e) {
      report.error = String(e?.stack || e);
    }
    fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
    app.exit(report.error ? 1 : 0);
  });
}

module.exports = { runSelfTest };
