import { netSummary } from './NetCheckPanel';
import { IconAlert, IconSignal, IconClose, IconDiscord, IconDownload, IconHeadset, IconHolo, IconHome, IconMinimize, IconMods, IconSettings, IconSystems, IconUser } from './Icons';

const TABS = [
  { id: 'home', label: 'Главная', Icon: IconHome },
  { id: 'characters', label: 'Персонажи', Icon: IconUser },
  { id: 'holonet', label: 'HoloNet', Icon: IconHolo },
  { id: 'mods', label: 'Моды', Icon: IconMods },
  { id: 'systems', label: 'Системы', Icon: IconSystems },
  { id: 'settings', label: 'Настройки', Icon: IconSettings },
];

export default function TitleBar({ view, onView, links, api, update, net }) {
  const netBusy = net?.state === 'checking' || net?.state === 'fixing';
  const netBad = net?.state === 'done' && net.results?.some((r) => r.status === 'fail');
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
        {(netBusy || netBad) && (
          <button type="button" className={`chip-btn update-chip ${netBad ? 'is-bad' : ''}`} onClick={() => onView('settings')} title={netSummary(net)}>
            {netBad ? <IconAlert size={16} /> : <IconSignal size={16} />}
            <span>{netBusy ? (net.state === 'fixing' ? 'Сеть: исправление…' : 'Сеть: проверка…') : 'Сеть: есть проблемы'}</span>
          </button>
        )}
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
            title={`Установить версию ${update.latest} и перезапустить лаунчер (иначе установится при закрытии)`}
          >
            <IconDownload size={16} />
            <span>{`Обновить до ${update.latest}`}</span>
          </button>
        )}
        <button type="button" className="chip-btn chip-icon" onClick={() => api.openUrl(links.discord)} title="Discord Phoenix" aria-label="Discord Phoenix">
          <IconDiscord size={17} />
        </button>
        <button type="button" className="chip-btn chip-icon" onClick={() => api.tsConnect()} title={`TeamSpeak Phoenix: ${links.teamspeakHost}`} aria-label="TeamSpeak Phoenix">
          <IconHeadset size={17} />
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
