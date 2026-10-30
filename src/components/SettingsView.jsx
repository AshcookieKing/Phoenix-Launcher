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

// Текст статуса автообновления (электрон присылает update-status)
export function updateText(u) {
  if (!u) return '';
  switch (u.state) {
    case 'checking':
      return 'Проверка обновлений…';
    case 'none':
      return 'Установлена последняя версия';
    case 'available':
      return `Доступна версия ${u.latest}`;
    case 'downloading':
      return `Скачивание ${u.latest}: ${u.percent || 0}%`;
    case 'ready':
      return `Версия ${u.latest} скачана — перезапустите лаунчер`;
    case 'installed':
      return `Версия ${u.latest} установлена — включится при следующем запуске`;
    case 'error':
      return `Не удалось проверить обновления: ${u.error}`;
    case 'dev':
      return 'Автообновление работает только в собранном PhoenixLauncher.exe';
    default:
      return '';
  }
}

export default function SettingsView({ api, settings, onSave, onApplySettings, update }) {
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
            checked={settings.profilingLaunch !== false}
            onChange={(v) => set({ profilingLaunch: v })}
            label="Запускать profiling-версию Arma 3"
            hint={
              settings.profilingInstalled
                ? 'Profiling-exe найден — игра запускается им'
                : settings.armaBranch === 'profiling'
                  ? 'Ветка Steam «profiling» стоит, но отдельного profiling-exe нет — запускается её основная сборка «performance». Если нужен именно profiling-exe: Steam → Arma 3 → Свойства → Установленные файлы → «Проверить целостность»'
                  : 'Ветка «profiling» не выбрана: Steam → Библиотека → Arma 3 → Свойства → Бета-версии → «profiling - Performance Profiling Build». Пока её нет, запускается обычная версия'
            }
          />
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
            checked={settings.tsAutoConnect !== false}
            onChange={(v) => set({ tsAutoConnect: v })}
            label="Подключаться к TeamSpeak при запуске игры"
            hint="Перед игрой запустит TeamSpeak 3 и дождётся входа на 51.83.138.244:8465 (рация TFAR работает только с TeamSpeak 3)"
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
          <Toggle
            checked={settings.autoUpdate !== false}
            onChange={(v) => set({ autoUpdate: v })}
            label="Автообновление"
            hint="Новые версии из релизов GitHub скачиваются и ставятся сами — включаются при следующем запуске лаунчера"
          />
          <div className="update-row">
            <span>{updateText(update) || `Версия ${settings.appVersion}`}</span>
            {update?.state === 'ready' || update?.state === 'installed' ? (
              <button type="button" className="btn btn-fire" onClick={() => api.installUpdate()}>
                {update.state === 'installed' ? 'Перезапустить сейчас' : 'Обновить и перезапустить'}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => api.checkUpdate()}
                disabled={update?.state === 'checking' || update?.state === 'downloading'}
              >
                <IconRefresh size={16} /> Проверить
              </button>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
