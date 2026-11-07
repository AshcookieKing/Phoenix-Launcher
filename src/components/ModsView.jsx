import { useEffect, useMemo, useState } from 'react';
import { IconDownload, IconExternal, IconFolder, IconRefresh, IconSearch } from './Icons';

const STATUS = {
  ok: { label: 'Готов', cls: 'is-ok' },
  outdated: { label: 'Обновить', cls: 'is-warn' },
  missing: { label: 'Нет', cls: 'is-bad' },
};

const ORDER = { missing: 0, outdated: 1, ok: 2 };

export default function ModsView({ api, settings, mods, checking, onRefresh, onApplySettings }) {
  const [query, setQuery] = useState('');
  const [syncing, setSyncing] = useState(false);
  const [sync, setSync] = useState(null); // { percent, message } - Steam качает моды
  const [syncError, setSyncError] = useState('');

  useEffect(() => api.onModsSync((p) => p && setSync(p)), [api]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (mods || [])
      .filter((m) => !q || String(m.name || '').toLowerCase().includes(q) || m.workshopId.includes(q))
      .sort((a, b) => ORDER[a.status] - ORDER[b.status] || String(a.name || '').localeCompare(String(b.name || '')));
  }, [mods, query]);

  const need = (mods || []).filter((m) => m.status !== 'ok');

  // подписка и загрузка через Steam API: ждёт, пока Steam скачает всё, с прогрессом по байтам
  const syncAll = async () => {
    setSyncing(true);
    setSyncError('');
    setSync({ percent: 0, message: 'Steam: подписка на моды…' });
    const res = await api.syncMods(need.map((m) => m.workshopId));
    setSyncing(false);
    setSync(null);
    if (!res.ok && !res.cancelled) setSyncError(res.error || 'Steam не скачал моды');
    onRefresh();
  };

  const pickPreset = async () => {
    const res = await api.pickPresetFile();
    if (res.success) onApplySettings(res.settings);
  };
  const resetPreset = async () => {
    const res = await api.resetPreset();
    if (res.success) onApplySettings(res.settings);
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Моды Phoenix</h1>
          <p>
            {settings.modSource === 'server'
              ? `Сборка сервера Phoenix: ${settings.modCount} модов — список берётся прямо с сервера, поэтому всегда актуален.`
              : `Пресет сборки: ${settings.modCount} модов.`}{' '}
            Перед игрой лаунчер сам подписывается на недостающие моды в Steam и ждёт, пока они скачаются.
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-ghost" onClick={onRefresh} disabled={checking}>
            <IconRefresh size={16} /> {checking ? 'Проверка…' : 'Проверить'}
          </button>
          <button type="button" className="btn btn-fire" onClick={syncAll} disabled={!need.length || syncing}>
            <IconDownload size={16} /> {syncing ? 'Steam качает…' : need.length ? `Скачать (${need.length})` : 'Всё установлено'}
          </button>
        </div>
      </div>

      {(sync || syncError) && (
        <div className={`panel mods-sync ${syncError ? 'is-error' : ''}`}>
          <div className="mods-sync-row">
            <span>{syncError || sync.message}</span>
            {sync && (
              <>
                <em>{Math.round(sync.percent)}%</em>
                <button type="button" className="btn btn-link" onClick={() => api.syncModsCancel()}>
                  Отмена
                </button>
              </>
            )}
          </div>
          {sync && (
            <div className="progress">
              <span style={{ width: `${sync.percent}%` }} />
            </div>
          )}
        </div>
      )}

      <div className="mods-toolbar">
        <label className="search">
          <IconSearch size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск мода" />
        </label>
        <span className="preset-info" title={settings.presetPath}>
          {settings.customPreset ? 'Свой пресет' : settings.modSource === 'server' ? 'Список с сервера Phoenix' : 'Встроенный пресет Phoenix'}
        </span>
        <button type="button" className="btn btn-link" onClick={pickPreset}>
          <IconFolder size={15} /> Другой пресет
        </button>
        {settings.customPreset && (
          <button type="button" className="btn btn-link" onClick={resetPreset}>
            Вернуть встроенный
          </button>
        )}
      </div>

      <div className="panel mods-list">
        {!mods && <div className="empty">{settings.pathsValid ? 'Проверка модов…' : 'Сначала укажите путь к Arma 3 в настройках.'}</div>}
        {list.map((m) => {
          const st = STATUS[m.status] || STATUS.missing;
          return (
            <div key={m.workshopId} className="mod-row">
              <span className={`mod-dot ${st.cls}`} />
              <span className="mod-name">{m.name}</span>
              <span className="mod-id">{m.workshopId}</span>
              <span className={`pill ${st.cls}`}>{st.label}</span>
              <div className="mod-actions">
                {m.path && (
                  <button type="button" className="icon-btn" title="Открыть папку" onClick={() => api.openFolder(m.path)}>
                    <IconFolder size={15} />
                  </button>
                )}
                <button type="button" className="icon-btn" title="Страница в Workshop" onClick={() => api.openUrl(m.steamUrl)}>
                  <IconExternal size={15} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
