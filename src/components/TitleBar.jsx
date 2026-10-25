import { IconClose, IconDiscord, IconHeadset, IconHolo, IconHome, IconMinimize, IconMods, IconSettings, IconSystems } from './Icons';

const TABS = [
  { id: 'home', label: 'Главная', Icon: IconHome },
  { id: 'mods', label: 'Моды', Icon: IconMods },
  { id: 'galaxy', label: 'Галактика', Icon: IconHolo },
  { id: 'systems', label: 'Системы', Icon: IconSystems },
  { id: 'settings', label: 'Настройки', Icon: IconSettings },
];

export default function TitleBar({ view, onView, links, api }) {
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
