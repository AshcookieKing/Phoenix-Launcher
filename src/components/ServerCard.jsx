import { IconMap, IconPlay, IconSignal, IconUsers } from './Icons';

function pingClass(ping) {
  if (ping == null) return '';
  if (ping < 80) return 'ping-good';
  if (ping < 150) return 'ping-mid';
  return 'ping-bad';
}

export default function ServerCard({ server, state, disabled, onConnect }) {
  const loading = !state;
  const online = state?.status === 'online';
  const players = state?.players ?? 0;
  const max = state?.maxPlayers || 0;
  const fill = max ? Math.min(100, Math.round((players / max) * 100)) : 0;

  return (
    <article className={`server-card server-${server.id} ${online ? 'is-online' : ''}`}>
      <div className="server-top">
        <span className="server-tag">{server.tag}</span>
        <span className={`server-status ${loading ? 'is-loading' : online ? 'is-online' : 'is-offline'}`}>
          <i className="dot" />
          {loading ? 'Опрос…' : online ? 'Онлайн' : 'Недоступен'}
        </span>
      </div>

      <h3 className="server-name">{server.name}</h3>
      <p className="server-sub">{server.subtitle}</p>

      <div className="server-load">
        <div className="server-load-row">
          <span className="server-players">
            <IconUsers size={16} />
            <b>{online ? players : '—'}</b>
            <em>/ {online ? max : '—'}</em>
          </span>
          <span className={`server-ping ${pingClass(state?.ping)}`}>
            <IconSignal size={15} />
            {online && state.ping != null ? `${state.ping} мс` : '—'}
          </span>
        </div>
        <div className="meter">
          <span style={{ width: `${online ? Math.max(fill, players ? 3 : 0) : 0}%` }} />
        </div>
      </div>

      <div className="server-bottom">
        <span className="server-map">
          <IconMap size={15} />
          {online ? state.map || server.name : `${server.host}:${server.port}`}
        </span>
        <button type="button" className="btn btn-connect" disabled={disabled || !online} onClick={onConnect}>
          <IconPlay size={14} />
          Быстрый вход
        </button>
      </div>
    </article>
  );
}
