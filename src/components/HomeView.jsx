import AccountCard from './AccountCard';
import ServerCard from './ServerCard';
import { IconAlert, IconFolder, IconRefresh } from './Icons';

export default function HomeView({
  api,
  settings,
  servers,
  account,
  launching,
  onConnect,
  onRefreshAccount,
  onApplySettings,
  onOpenSettings,
}) {
  const detect = async () => {
    const res = await api.autoDetectPaths();
    if (res.success) onApplySettings(res.settings);
  };
  const pickExe = async () => {
    const res = await api.pickArmaExe();
    if (res.success) onApplySettings(res.settings);
  };

  const totalOnline = settings.servers.reduce((sum, s) => sum + (servers[s.id]?.players || 0), 0);

  return (
    <div className="home">
      <section className="home-left">
        <div className="hero-logo">
          <img src="./assets/phoenix_logo.png" alt="Arma Phoenix — Star Wars RP" />
        </div>
        <AccountCard api={api} account={account} onRefresh={onRefreshAccount} />
      </section>

      <section className="home-right">
        {!settings.pathsValid && (
          <div className="setup-banner">
            <IconAlert size={22} />
            <div className="setup-text">
              <strong>Arma 3 не найдена</strong>
              <span>Укажите игру, чтобы лаунчер проверил моды и запускал Phoenix.</span>
            </div>
            <button type="button" className="btn btn-ghost" onClick={detect}>
              <IconRefresh size={16} /> Найти
            </button>
            <button type="button" className="btn btn-ghost" onClick={pickExe}>
              <IconFolder size={16} /> arma3_x64.exe
            </button>
            <button type="button" className="btn btn-link" onClick={onOpenSettings}>
              Настройки
            </button>
          </div>
        )}

        <div className="servers-head">
          <h2>Серверы Phoenix</h2>
          <span className="servers-total">
            <i className={totalOnline > 0 ? 'dot dot-live' : 'dot'} />
            {totalOnline} в игре
          </span>
        </div>
        <div className="servers">
          {settings.servers.map((s) => (
            <ServerCard
              key={s.id}
              server={s}
              state={servers[s.id]}
              disabled={launching || !settings.pathsValid}
              onConnect={() => onConnect(s.id)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
