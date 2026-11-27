import { useEffect, useState } from 'react';
import { IconAlert, IconCheck, IconExternal, IconRefresh, IconSignal } from './Icons';

const STATUS_ICON = { ok: IconCheck, warn: IconAlert, fail: IconAlert, info: IconSignal };

export function netSummary(net) {
  if (!net) return '';
  if (net.state === 'checking') return 'Проверка сети…';
  if (net.state === 'error') return `Проверка сети: ${net.error}`;
  if (!net.results) return '';
  const fails = net.results.filter((r) => r.status === 'fail').length;
  const warns = net.results.filter((r) => r.status === 'warn').length;
  let text = fails || warns ? `Сеть: ошибок ${fails}, предупреждений ${warns}` : 'Сеть в порядке';
  return text;
}

// Проверка сети Phoenix (только чтение) и ссылка на отдельную программу Phoenix NetCheck
export default function NetCheckPanel({ api, settings, onSave }) {
  const [net, setNet] = useState(null);

  useEffect(() => {
    api.netCheckGet?.().then((s) => s && setNet(s)).catch(() => {});
    return api.onNetCheck?.(setNet);
  }, [api]);

  const busy = net?.state === 'checking';

  return (
    <section className="panel settings-block netcheck">
      <div className="netcheck-head">
        <h3>Сеть и доступ к серверам</h3>
        <span className={`netcheck-sum ${net?.state === 'error' ? 'txt-bad' : ''}`}>{netSummary(net) || 'Не проверялась'}</span>
        <div className="netcheck-actions">
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => api.netCheckRun({})}>
            <IconRefresh size={16} /> Проверить
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => api.netCheckOpen()} title="Отдельная программа Phoenix NetCheck с исправлениями (zapret, VPN, DNS). Откроется страница скачивания">
            <IconExternal size={16} /> Phoenix NetCheck
          </button>
        </div>
      </div>

      {net?.results?.length > 0 && (
        <ul className="netcheck-list">
          {net.results.map((r) => {
            const Icon = STATUS_ICON[r.status] || IconSignal;
            return (
              <li key={r.id} className={`is-${r.status}`}>
                <Icon size={15} />
                <b>{r.name}</b>
                <span>
                  {r.detail}
                  {r.hint && <em> → {r.hint}</em>}
                </span>
              </li>
            );
          })}
        </ul>
      )}

      <div className="netcheck-toggles">
        <label className="toggle">
          <span className="toggle-text">
            <b>Резервная связь через прокси Windows</b>
            <small>Если сервер ролей или бот Phoenix недоступен напрямую, лаунчер повторит запрос через настроенный прокси.</small>
          </span>
          <input type="checkbox" checked={settings.reserveProxy === true} onChange={(e) => onSave({ reserveProxy: e.target.checked })} />
          <span className="toggle-track" aria-hidden><span /></span>
        </label>
        <label className="toggle">
          <span className="toggle-text">
            <b>Проверять сеть при запуске</b>
            <small>Только чтение: серверы Phoenix, Steam, Discord, DNS, hosts, VPN и zapret. Лаунчер ничего на ПК не меняет</small>
          </span>
          <input type="checkbox" checked={settings.netCheckOnStart !== false} onChange={(e) => onSave({ netCheckOnStart: e.target.checked })} />
          <span className="toggle-track" aria-hidden><span /></span>
        </label>
      </div>
    </section>
  );
}
