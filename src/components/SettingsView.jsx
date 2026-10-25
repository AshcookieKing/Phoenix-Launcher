import { useEffect, useState } from 'react';
import { IconFolder, IconRefresh } from './Icons';

const SCREEN_MODES = [
  { id: 'borderless', label: 'Без рамки' },
  { id: 'fullscreen', label: 'Полный экран' },
  { id: 'windowed', label: 'В окне' },
];

const PERF = [
  { id: 'low', label: 'Слабый ПК' },
  { id: 'medium', label: 'Средний' },
  { id: 'high', label: 'Мощный' },
  { id: 'ultra', label: 'Топовый' },
];

function Toggle({ checked, onChange, label, hint }) {
  return (
    <label className="toggle">
      <span className="toggle-text">
        <b>{label}</b>
        {hint && <small>{hint}</small>}
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden>
        <span />
      </span>
    </label>
  );
}

function Segmented({ value, options, onChange }) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={o.id} type="button" className={value === o.id ? 'is-active' : ''} onClick={() => onChange(o.id)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export default function SettingsView({ api, settings, onSave, onApplySettings }) {
  const [extraArgs, setExtraArgs] = useState(settings.extraLaunchArgs || '');
  const [pathMsg, setPathMsg] = useState('');

  useEffect(() => setExtraArgs(settings.extraLaunchArgs || ''), [settings.extraLaunchArgs]);

  const set = (patch) => onSave(patch);

  const detect = async () => {
    setPathMsg('Поиск…');
    const res = await api.autoDetectPaths();
    if (res.success) {
      onApplySettings(res.settings);
      setPathMsg('Найдено');
    } else setPathMsg(res.errors?.[0] || 'Не найдено');
  };
  const pickExe = async () => {
    const res = await api.pickArmaExe();
    if (res.success) {
      onApplySettings(res.settings);
      setPathMsg('Сохранено');
    } else if (!res.canceled) setPathMsg(res.errors?.[0] || 'Неверный файл');
  };
  const pickWorkshop = async () => {
    const res = await api.pickWorkshopFolder();
    if (res.success) onApplySettings(res.settings);
  };

  const p = settings.paths || {};

  return (
    <div className="page settings">
      <div className="page-head">
        <div>
          <h1>Настройки</h1>
          <p>Пути к игре, параметры запуска и поведение лаунчера.</p>
        </div>
        <span className="version">Phoenix Launcher {settings.appVersion}</span>
      </div>

      <div className="settings-grid">
        <section className="panel settings-block">
          <h3>Arma 3</h3>
          <div className="path-row">
            <span>Игра</span>
            <code title={p.armaExe}>{p.armaExe || 'не указано'}</code>
            <button type="button" className="icon-btn" onClick={pickExe} title="Выбрать arma3_x64.exe">
              <IconFolder size={15} />
            </button>
          </div>
          <div className="path-row">
            <span>Workshop</span>
            <code title={p.workshopDir}>{p.workshopDir || 'не указано'}</code>
            <button type="button" className="icon-btn" onClick={pickWorkshop} title="Выбрать папку Workshop">
              <IconFolder size={15} />
            </button>
          </div>
          <div className="path-actions">
            <button type="button" className="btn btn-ghost" onClick={detect}>
              <IconRefresh size={15} /> Найти автоматически
            </button>
            <span className={settings.pathsValid ? 'txt-ok' : 'txt-bad'}>
              {pathMsg || (settings.pathsValid ? 'Пути в порядке' : settings.pathErrors?.[0])}
            </span>
          </div>

          <div className="field">
            <span>Профиль Arma</span>
            <select value={settings.activeProfileId || ''} onChange={(e) => set({ activeProfileId: e.target.value })}>
              <option value="">Профиль по умолчанию</option>
              {settings.profiles.map((pr) => (
                <option key={pr.id} value={pr.id}>
                  {pr.displayName}
                </option>
              ))}
            </select>
          </div>
        </section>

        <section className="panel settings-block">
          <h3>Запуск</h3>
          <div className="field">
            <span>Режим экрана</span>
            <Segmented value={settings.screenMode} options={SCREEN_MODES} onChange={(v) => set({ screenMode: v })} />
          </div>
          <Toggle
            checked={settings.optimizedLaunch === true}
            onChange={(v) => set({ optimizedLaunch: v })}
            label="Оптимизированный запуск"
            hint="Потоки, память и видеопамять под ваш ПК"
          />
          {settings.optimizedLaunch && (
            <div className="field">
              <span>Профиль производительности</span>
              <Segmented value={settings.performancePreset} options={PERF} onChange={(v) => set({ performancePreset: v })} />
            </div>
          )}
          <Toggle
            checked={settings.tsAutoConnect === true}
            onChange={(v) => set({ tsAutoConnect: v })}
            label="Подключаться к TeamSpeak при запуске игры"
            hint="phoenixrparma3.ts3.so — нужен установленный TeamSpeak 3"
          />
          <Toggle
            checked={settings.keepLogs === true}
            onChange={(v) => set({ keepLogs: v })}
            label="Писать лог игры (RPT)"
            hint="Нужен только для разбора вылетов; без лога чуть быстрее"
          />
          <Toggle
            checked={settings.skipLogos === true}
            onChange={(v) => set({ skipLogos: v })}
            label="Пропускать заставки BI"
            hint="Быстрее до меню Phoenix"
          />
          <div className="field">
            <span>Доп. параметры</span>
            <input
              value={extraArgs}
              onChange={(e) => setExtraArgs(e.target.value)}
              onBlur={() => extraArgs !== (settings.extraLaunchArgs || '') && set({ extraLaunchArgs: extraArgs })}
              placeholder="-noPause -noLogs"
            />
          </div>
        </section>

        <section className="panel settings-block">
          <h3>Лаунчер</h3>
          <Toggle
            checked={settings.minimizeOnLaunch !== false}
            onChange={(v) => set({ minimizeOnLaunch: v })}
            label="Сворачивать при запуске игры"
          />
          <Toggle
            checked={settings.soundsEnabled !== false}
            onChange={(v) => set({ soundsEnabled: v })}
            label="Звуки интерфейса"
          />
          <Toggle
            checked={settings.animationsEnabled !== false}
            onChange={(v) => set({ animationsEnabled: v })}
            label="Анимация пламени"
            hint="Искры на фоне и подсветка кнопки"
          />
        </section>
      </div>
    </div>
  );
}
