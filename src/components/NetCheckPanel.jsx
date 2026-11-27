import { useEffect, useState } from 'react';
import { IconAlert, IconCheck, IconExternal, IconRefresh, IconSignal } from './Icons';

const STATUS_ICON = { ok: IconCheck, warn: IconAlert, fail: IconAlert, info: IconSignal };

export function netSummary(net) {
  if (!net) return '';
  if (net.state === 'checking') return 'Проверка сети…';
  if (net.state === 'fixing') return 'Исправление сети… (Windows может спросить разрешение)';
  if (net.state === 'error') return `Чекер сети: ${net.error}`;
  if (!net.results) return '';
  const fails = net.results.filter((r) => r.status === 'fail').length;
  const warns = net.results.filter((r) => r.status === 'warn').length;
  let text = fails || warns ? `Сеть: ошибок ${fails}, предупреждений ${warns}` : 'Сеть в порядке';
  if (net.fixed?.length) text += ` · исправлено: ${net.fixed.length}`;
  if (net.uacDenied) text += ' · исправления без разрешения администратора не выполнены';
  return text;
}

// Чекер сети Phoenix: результаты, «Исправить», полное окно чекера (zapret, обход VPN, сброс Winsock)
export default function NetCheckPanel({ api, settings, onSave }) {
  const [net, setNet] = useState(null);

  useEffect(() => {
    api.netCheckGet?.().then((s) => s && setNet(s)).catch(() => {});
    return api.onNetCheck?.(setNet);
  }, [api]);

  const busy = net?.state === 'checking' || net?.state === 'fixing';
  const fixable = (net?.results || []).filter((r) => r.fix && r.status !== 'ok' && r.status !== 'info');

  return (
    <section className="panel settings-block netcheck">
      <div className="netcheck-head">
        <h3>Сеть и доступ к серверам</h3>
        <span className={`netcheck-sum ${net?.state === 'error' ? 'txt-bad' : ''}`}>{netSummary(net) || 'Не проверялась'}</span>
        <div className="netcheck-actions">
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => api.netCheckRun({})}>
            <IconRefresh size={16} /> Проверить
          </button>
          {fixable.length > 0 && (
            <button type="button" className="btn btn-fire" disabled={busy} onClick={() => api.netCheckRun({ fix: fixable.map((r) => r.id).join(',') })}>
              Исправить ({fixable.length})
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={() => api.netCheckOpen()} title="Полное окно чекера: zapret, серверы мимо VPN, сброс DNS и Winsock">
            <IconExternal size={16} /> Окно чекера
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
                  {r.fix && r.status !== 'ok' && <em> → {r.fix}{r.admin ? ' (права администратора)' : ''}</em>}
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
            <small>Серверы Phoenix, Steam, Discord, DNS, hosts, VPN и zapret</small>
          </span>
          <input type="checkbox" checked={settings.netCheckOnStart !== false} onChange={(e) => onSave({ netCheckOnStart: e.target.checked })} />
          <span className="toggle-track" aria-hidden><span /></span>
        </label>
        <label className="toggle">
          <span className="toggle-text">
            <b>Исправлять найденное само</b>
            <small>Сброс DNS, строки hosts, блокировка Arma в брандмауэре, исключение сервера в zapret, кэш Steam. Маршруты мимо VPN и прокси — только кнопкой</small>
          </span>
          <input type="checkbox" checked={settings.netAutoFix !== false} onChange={(e) => onSave({ netAutoFix: e.target.checked })} />
          <span className="toggle-track" aria-hidden><span /></span>
        </label>
      </div>
    </section>
  );
}
