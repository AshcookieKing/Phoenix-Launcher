import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Background from './components/Background';
import TitleBar from './components/TitleBar';
import HomeView from './components/HomeView';
import ModsView from './components/ModsView';
import SystemsView from './components/SystemsView';
import SettingsView from './components/SettingsView';
import LaunchDock from './components/LaunchDock';
import AuthGate from './components/AuthGate';
import CharactersView from './components/Characters';
import HoloNetView, { HoloNetReader } from './components/HoloNet';
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
  const checkSequence = useRef(0);
  const [sync, setSync] = useState(null);
  const [syncError, setSyncError] = useState('');
  const [launch, setLaunch] = useState(IDLE);
  const [authAsk, setAuthAsk] = useState(null); // { serverId } - запуск ждёт входа через Discord
  const [update, setUpdate] = useState(null); // автообновление из релизов GitHub
  const [holonet, setHolonet] = useState(null); // лента HoloNet из Discord Phoenix
  const [reading, setReading] = useState(null); // пост HoloNet, открытый с главной
  const [characters, setCharacters] = useState(null); // персонажи меню Phoenix из профиля Arma

  const refreshMods = useCallback(async (force = false) => {
    const sequence = ++checkSequence.current;
    setModsChecking(true);
    try {
      const checked = await api.checkMods({ force });
      if (sequence === checkSequence.current) setMods(checked);
    } catch (e) {
      if (sequence === checkSequence.current) {
        setMods(null);
        setSyncError(e.message || 'Не удалось проверить файлы модов');
      }
    } finally {
      if (sequence === checkSequence.current) setModsChecking(false);
    }
  }, []);

  const downloadMods = async () => {
    if (sync) return;
    setSyncError('');
    setSync({ percent: 0, message: 'Подготовка загрузки…' });
    try {
      const result = await api.syncMods();
      if (!result.ok && !result.cancelled) setSyncError(result.error || 'Steam не скачал моды');
    } catch (e) {
      setSyncError(e.message || 'Ошибка загрузки модов');
    } finally {
      setSync(null);
      refreshMods(true);
    }
  };

  const refreshAccount = useCallback(async (force = false) => {
    setAccount(await api.getAccount({ force }));
  }, []);

  const refreshCharacters = useCallback(async () => {
    setCharacters(await api.getCharacters());
  }, []);

  const refreshHolonet = useCallback(async (force = false) => {
    const feed = await api.getHoloNet({ force });
    if (feed) setHolonet(feed);
  }, []);

  useEffect(() => {
    (async () => {
      const s = await api.getSettings();
      setSettings(s);
      api.getServers().then(setServers).catch(() => {});
      refreshAccount();
      refreshCharacters();
      refreshHolonet();
      if (s.pathsValid) refreshMods();
      api.getUpdateStatus().then(setUpdate).catch(() => {});
    })();
    const offs = [
      api.onServers(setServers),
      api.onAccount(setAccount),
      api.onHoloNet((feed) => feed && setHolonet((prev) => ({ ...prev, ...feed, online: true }))),
      api.onUpdateStatus(setUpdate),
      api.onModsSync((p) => { if (p) setSync(p); }),
      api.onLaunchProgress((p) => setLaunch((prev) => ({ ...prev, ...p, phase: 'preparing' }))),
      api.onLaunchRunning(() => setLaunch({ percent: 100, message: 'Игра запущена · удачной службы', phase: 'running' })),
      api.onLaunchReset(() => {
        setLaunch(IDLE);
        refreshCharacters();
      }),
    ];
    const accountTimer = setInterval(() => refreshAccount(), 90000);
    // персонажи меняются в игре (профиль Arma сохраняется при выходе) - перечитать, когда окно снова в фокусе
    const onFocus = () => refreshCharacters();
    window.addEventListener('focus', onFocus);
    return () => {
      offs.forEach((off) => off?.());
      clearInterval(accountTimer);
      window.removeEventListener('focus', onFocus);
    };
  }, [refreshAccount, refreshMods, refreshCharacters, refreshHolonet]);

  useEffect(() => {
    if (settings?.soundsEnabled === false) return undefined;
    return bindUiSounds(document);
  }, [settings?.soundsEnabled]);

  const startGame = useCallback(
    async (serverId = null, { skipAuth = false, profileName = '' } = {}) => {
      if (launch.phase === 'preparing') return;
      // Discord не привязан - сначала предложить вход (тогда меню в игре войдёт само)
      if (!skipAuth && account?.steam && account.roles?.ok && !account.roles.linked) {
        setAuthAsk({ serverId, profileName });
        return;
      }
      setAuthAsk(null);
      setLaunch({ percent: 1, message: 'Подготовка…', phase: 'preparing' });
      const res = await api.launch({ serverId, profileName });
      if (!res.ok) {
        setLaunch(res.cancelled ? IDLE : { percent: 0, message: res.error || 'Ошибка запуска', phase: 'error' });
      }
      refreshMods(true);
    },
    [launch.phase, refreshMods, account]
  );

  // «Играть» на карточке персонажа: игра под профилем Arma с его именем
  const playCharacter = useCallback(
    (char) => startGame(null, { profileName: char.profile || characters?.profile || '' }),
    [startGame, characters]
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
      <TitleBar view={view} onView={setView} links={settings.links} api={api} update={update} />

      <main className="stage">
        {view === 'home' && (
          <HomeView
            api={api}
            settings={settings}
            servers={servers}
            account={account}
            characters={characters}
            holonet={holonet}
            launching={Boolean(sync) || launch.phase === 'preparing'}
            onConnect={(id) => startGame(id)}
            onRefreshAccount={() => refreshAccount(true)}
            onApplySettings={applySettings}
            onOpenSettings={() => setView('settings')}
            onOpenCharacters={() => setView('characters')}
            onOpenHoloNet={() => setView('holonet')}
            onReadPost={setReading}
          />
        )}
        {view === 'characters' && (
          <CharactersView
            data={characters}
            roles={account?.roles}
            busy={Boolean(sync) || launch.phase === 'preparing' || launch.phase === 'running' || !settings.pathsValid}
            onRefresh={refreshCharacters}
            onPlay={playCharacter}
          />
        )}
        {view === 'holonet' && (
          <HoloNetView api={api} feed={holonet} links={settings.links} onRefresh={() => refreshHolonet(true)} />
        )}
        {view === 'mods' && (
          <ModsView
            api={api}
            settings={settings}
            mods={mods}
            checking={modsChecking}
            sync={sync}
            syncError={syncError}
            launching={launch.phase === 'preparing'}
            onDownload={downloadMods}
            onRefresh={() => refreshMods(true)}
            onApplySettings={applySettings}
          />
        )}
        {view === 'systems' && <SystemsView />}
        {view === 'settings' && (
          <SettingsView api={api} settings={settings} onSave={saveSettings} onApplySettings={applySettings} update={update} />
        )}
      </main>

      <LaunchDock
        launch={launch}
        modSummary={modSummary}
        modsChecking={modsChecking}
        syncing={Boolean(sync)}
        pathsValid={settings.pathsValid}
        onPlay={() => startGame(null)}
        onCancel={() => api.launchCancel()}
        onOpenMods={() => setView('mods')}
        onOpenSettings={() => setView('settings')}
      />
      {authAsk && (
        <AuthGate
          api={api}
          onLinked={() => {
            refreshAccount(true);
            startGame(authAsk.serverId, { skipAuth: true, profileName: authAsk.profileName });
          }}
          onSkip={() => startGame(authAsk.serverId, { skipAuth: true, profileName: authAsk.profileName })}
          onCancel={() => setAuthAsk(null)}
        />
      )}
      <HoloNetReader post={reading} api={api} onClose={() => setReading(null)} />
    </div>
  );
}
