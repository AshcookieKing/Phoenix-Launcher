import { useCallback, useEffect, useMemo, useState } from 'react';
import Background from './components/Background';
import TitleBar from './components/TitleBar';
import HomeView from './components/HomeView';
import ModsView from './components/ModsView';
import SystemsView from './components/SystemsView';
import SettingsView from './components/SettingsView';
import LaunchDock from './components/LaunchDock';
import AuthGate from './components/AuthGate';
import { bindUiSounds } from './utils/uiSounds';

// Мост preload (window.phoenix); читается лениво — в браузерном превью заглушка подключается после импорта модуля
const api = new Proxy({}, { get: (_, key) => window.phoenix[key] });
const IDLE = { percent: 0, message: 'Готов к запуску', phase: 'idle' };

export default function App() {
  const [settings, setSettings] = useState(null);
  const [view, setView] = useState('home');
  const [servers, setServers] = useState({});
  const [account, setAccount] = useState(null);
  const [mods, setMods] = useState(null);
  const [modsChecking, setModsChecking] = useState(false);
  const [launch, setLaunch] = useState(IDLE);
  const [authAsk, setAuthAsk] = useState(null); // { serverId } - запуск ждёт входа через Discord

  const refreshMods = useCallback(async (force = false) => {
    setModsChecking(true);
    try {
      setMods(await api.checkMods({ force }));
    } finally {
      setModsChecking(false);
    }
  }, []);

  const refreshAccount = useCallback(async (force = false) => {
    setAccount(await api.getAccount({ force }));
  }, []);

  useEffect(() => {
    (async () => {
      const s = await api.getSettings();
      setSettings(s);
      api.getServers().then(setServers).catch(() => {});
      refreshAccount();
      if (s.pathsValid) refreshMods();
    })();
    const offs = [
      api.onServers(setServers),
      api.onAccount(setAccount),
      api.onLaunchProgress((p) => setLaunch((prev) => ({ ...prev, ...p, phase: 'preparing' }))),
      api.onLaunchRunning(() => setLaunch({ percent: 100, message: 'Игра запущена · удачной службы', phase: 'running' })),
      api.onLaunchReset(() => setLaunch(IDLE)),
    ];
    const accountTimer = setInterval(() => refreshAccount(), 90000);
    return () => {
      offs.forEach((off) => off?.());
      clearInterval(accountTimer);
    };
  }, [refreshAccount, refreshMods]);

  useEffect(() => {
    if (settings?.soundsEnabled === false) return undefined;
    return bindUiSounds(document);
  }, [settings?.soundsEnabled]);

  const startGame = useCallback(
    async (serverId = null, { skipAuth = false } = {}) => {
      if (launch.phase === 'preparing') return;
      // Discord не привязан - сначала предложить вход (тогда меню в игре войдёт само)
      if (!skipAuth && account?.steam && account.roles?.ok && !account.roles.linked) {
        setAuthAsk({ serverId });
        return;
      }
      setAuthAsk(null);
      setLaunch({ percent: 1, message: 'Подготовка…', phase: 'preparing' });
      const res = await api.launch({ serverId });
      if (!res.ok) {
        setLaunch({ percent: 0, message: res.error || 'Ошибка запуска', phase: 'error' });
        refreshMods(true);
      }
    },
    [launch.phase, refreshMods, account]
  );

  const saveSettings = useCallback(async (patch) => {
    const next = await api.saveSettings(patch);
    setSettings(next);
    return next;
  }, []);

  const applySettings = useCallback(
    (next) => {
      if (!next) return;
      setSettings(next);
      if (next.pathsValid) refreshMods(true);
    },
    [refreshMods]
  );

  const modSummary = useMemo(() => {
    if (!mods) return null;
    const missing = mods.filter((m) => m.status === 'missing').length;
    const outdated = mods.filter((m) => m.status === 'outdated').length;
    return { total: mods.length, ok: mods.length - missing - outdated, missing, outdated };
  }, [mods]);

  if (!settings) {
    return (
      <div className="boot">
        <img src="./assets/phoenix_emblem.png" alt="" className="boot-emblem" />
        <div className="boot-bar">
          <span />
        </div>
        <span className="boot-text">PHOENIX LAUNCHER</span>
      </div>
    );
  }

  return (
    <div className="app" data-anim={settings.animationsEnabled !== false ? 'on' : 'off'}>
      <Background animated={settings.animationsEnabled !== false} />
      <TitleBar view={view} onView={setView} links={settings.links} api={api} />

      <main className="stage">
        {view === 'home' && (
          <HomeView
            api={api}
            settings={settings}
            servers={servers}
            account={account}
            launching={launch.phase === 'preparing'}
            onConnect={(id) => startGame(id)}
            onRefreshAccount={() => refreshAccount(true)}
            onApplySettings={applySettings}
            onOpenSettings={() => setView('settings')}
          />
        )}
        {view === 'mods' && (
          <ModsView
            api={api}
            settings={settings}
            mods={mods}
            checking={modsChecking}
            onRefresh={() => refreshMods(true)}
            onApplySettings={applySettings}
          />
        )}
        {view === 'systems' && <SystemsView api={api} links={settings.links} />}
        {view === 'settings' && (
          <SettingsView api={api} settings={settings} onSave={saveSettings} onApplySettings={applySettings} />
        )}
      </main>

      <LaunchDock
        launch={launch}
        modSummary={modSummary}
        modsChecking={modsChecking}
        pathsValid={settings.pathsValid}
        onPlay={() => startGame(null)}
        onOpenMods={() => setView('mods')}
        onOpenSettings={() => setView('settings')}
      />
      {authAsk && (
        <AuthGate
          api={api}
          onLinked={() => {
            refreshAccount(true);
            startGame(authAsk.serverId, { skipAuth: true });
          }}
          onSkip={() => startGame(authAsk.serverId, { skipAuth: true })}
          onCancel={() => setAuthAsk(null)}
        />
      )}
    </div>
  );
}
