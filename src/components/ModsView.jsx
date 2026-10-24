import { useMemo, useState } from 'react';
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

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (mods || [])
      .filter((m) => !q || m.name.toLowerCase().includes(q) || m.workshopId.includes(q))
      .sort((a, b) => ORDER[a.status] - ORDER[b.status] || a.name.localeCompare(b.name));
  }, [mods, query]);

  const need = (mods || []).filter((m) => m.status !== 'ok');

  const syncAll = async () => {
    setSyncing(true);
    await api.syncMods(need.map((m) => m.workshopId));
    setSyncing(false);
    setTimeout(onRefresh, 8000);
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
            Пресет сборки: {settings.modCount} модов · Phoenix Technical Mod 2.0, Legion Studios, 3AS, ACE, ALiVE и
            Global Ops Terrains. Лаунчер подписывает недостающие через Steam сам.
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-ghost" onClick={onRefresh} disabled={checking}>
            <IconRefresh size={16} /> {checking ? 'Проверка…' : 'Проверить'}
          </button>
          <button type="button" className="btn btn-fire" onClick={syncAll} disabled={!need.length || syncing}>
            <IconDownload size={16} /> {syncing ? 'Отправка в Steam…' : need.length ? `Скачать (${need.length})` : 'Всё установлено'}
          </button>
        </div>
      </div>

      <div className="mods-toolbar">
        <label className="search">
          <IconSearch size={16} />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск мода" />
        </label>
        <span className="preset-info" title={settings.presetPath}>
          {settings.customPreset ? 'Свой пресет' : 'Встроенный пресет Phoenix'}
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
