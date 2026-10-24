import { IconAlert, IconCheck, IconDownload, IconMods, IconPlay } from './Icons';

export default function LaunchDock({ launch, modSummary, modsChecking, pathsValid, onPlay, onOpenMods, onOpenSettings }) {
  const busy = launch.phase === 'preparing';
  const running = launch.phase === 'running';

  let modsLine = 'Проверка модов…';
  let modsState = 'is-wait';
  if (!pathsValid) {
    modsLine = 'Укажите путь к Arma 3';
    modsState = 'is-bad';
  } else if (modSummary && !modsChecking) {
    if (modSummary.missing) {
      modsLine = `Не хватает ${modSummary.missing} из ${modSummary.total}`;
      modsState = 'is-bad';
    } else if (modSummary.outdated) {
      modsLine = `Обновить ${modSummary.outdated} · готово ${modSummary.ok}/${modSummary.total}`;
      modsState = 'is-warn';
    } else {
      modsLine = `Все ${modSummary.total} модов готовы`;
      modsState = 'is-ok';
    }
  }

  const ModsIcon = modsState === 'is-ok' ? IconCheck : modsState === 'is-bad' ? IconAlert : modsState === 'is-warn' ? IconDownload : IconMods;

  return (
    <footer className={`dock ${busy ? 'is-busy' : ''} ${running ? 'is-running' : ''}`}>
      <button type="button" className={`dock-mods ${modsState}`} onClick={pathsValid ? onOpenMods : onOpenSettings}>
        <span className="dock-mods-icon">
          <ModsIcon size={20} />
        </span>
        <span className="dock-mods-text">
          <small>Сборка Phoenix</small>
          <b>{modsLine}</b>
        </span>
      </button>

      <div className="dock-progress">
        <div className="dock-message">
          <span className={launch.phase === 'error' ? 'txt-bad' : ''}>{launch.message}</span>
          {busy && <em>{Math.round(launch.percent)}%</em>}
        </div>
        <div className="progress">
          <span style={{ width: `${busy || running ? launch.percent : 0}%` }} />
        </div>
      </div>

      <button type="button" className="btn-play" onClick={onPlay} disabled={busy || running || !pathsValid}>
        <span className="btn-play-fire" />
        <span className="btn-play-label">
          <IconPlay size={22} />
          {running ? 'В ИГРЕ' : busy ? 'ЗАПУСК…' : 'ИГРАТЬ'}
        </span>
      </button>
    </footer>
  );
}
