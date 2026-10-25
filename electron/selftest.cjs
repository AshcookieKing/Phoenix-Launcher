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
      for (const tab of ['Моды', 'Галактика', 'Системы', 'Настройки']) {
        await js(`[...document.querySelectorAll('.tab')].find(b => b.textContent.includes('${tab}')).click()`);
        await new Promise((r) => setTimeout(r, tab === 'Моды' || tab === 'Галактика' ? 3500 : 800));
        await shot({ Моды: 'mods', Галактика: 'galaxy', Системы: 'systems', Настройки: 'settings' }[tab]);
        if (tab === 'Галактика') {
          report.galaxy = await js(`({ side: document.querySelector('.galaxy-side')?.innerText.replace(/\s+/g,' ').slice(0, 400), error: document.querySelector('.galaxy-error')?.innerText })`);
        }
        if (tab === 'Моды') {
          report.mods = await js(`[...document.querySelectorAll('.mod-row')].map(r => r.innerText.replace(/\\s+/g,' '))`);
        }
      }
    } catch (e) {
      report.error = String(e?.stack || e);
    }
    fs.writeFileSync(path.join(outDir, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
    app.exit(0);
  });
}

module.exports = { runSelfTest };
