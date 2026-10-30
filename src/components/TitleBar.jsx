import { IconClose, IconDiscord, IconDownload, IconHeadset, IconHome, IconMinimize, IconMods, IconSettings, IconSystems } from './Icons';

const TABS = [
  { id: 'home', label: 'Главная', Icon: IconHome },
  { id: 'mods', label: 'Моды', Icon: IconMods },
  { id: 'systems', label: 'Системы', Icon: IconSystems },
  { id: 'settings', label: 'Настройки', Icon: IconSettings },
];

export default function TitleBar({ view, onView, links, api, update }) {
  return (
    <header className="titlebar">
      <div className="brand">
        <img src="./assets/phoenix_emblem.png" alt="" />
        <span className="brand-name">
          PHOENIX <b>LAUNCHER</b>
        </span>
      </div>

      <nav className="tabs">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            className={`tab ${view === id ? 'is-active' : ''}`}
            onClick={() => onView(id)}
          >
            <Icon size={16} />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <div className="title-actions">
        {update?.state === 'downloading' && (
          <span className="chip-btn update-chip" title="Скачивается новая версия лаунчера">
            <IconDownload size={16} />
            <span>Обновление {update.percent || 0}%</span>
          </span>
        )}
        {(update?.state === 'ready' || update?.state === 'installed') && (
          <button
            type="button"
            className="chip-btn update-chip is-ready"
            onClick={() => api.installUpdate()}
            title={
              update.state === 'installed'
                ? `Версия ${update.latest} уже установлена и включится при следующем запуске. Нажмите, чтобы перезапустить сейчас`
                : `Перезапустить лаунчер на версии ${update.latest}`
            }
          >
            <IconDownload size={16} />
            <span>{update.state === 'installed' ? `Перезапустить: ${update.latest}` : `Обновить до ${update.latest}`}</span>
          </button>
        )}
        <button type="button" className="chip-btn" onClick={() => api.openUrl(links.discord)} title="Discord Phoenix">
          <IconDiscord size={16} />
          <span>Discord</span>
        </button>
        <button type="button" className="chip-btn" onClick={() => api.tsConnect()} title={`TeamSpeak Phoenix: ${links.teamspeakHost}`}>
          <IconHeadset size={16} />
          <span>TeamSpeak</span>
        </button>
        <button type="button" className="win-btn" onClick={() => api.minimize()} aria-label="Свернуть">
          <IconMinimize size={16} />
        </button>
        <button type="button" className="win-btn win-close" onClick={() => api.close()} aria-label="Закрыть">
          <IconClose size={16} />
        </button>
      </div>
    </header>
  );
}
