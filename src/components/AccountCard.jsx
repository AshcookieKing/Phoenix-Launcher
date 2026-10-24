import { useEffect, useState } from 'react';
import { IconDiscord, IconExternal, IconRefresh, IconSteam } from './Icons';

// Стороны меню персонажа Phoenix и роли Discord, которые их открывают
const ACCESS = [
  { key: null, label: 'Клон' },
  { key: 'bso', label: 'БСО' },
  { key: 'jedi', label: 'Джедай' },
  { key: 'mercenary', label: 'Наёмник' },
  { key: 'arc', label: 'ARC' },
  { key: 'rc', label: 'RC' },
  { key: 'slot3', label: '3-й слот' },
];

function maskSteam(id) {
  return id ? `${id.slice(0, 6)}…${id.slice(-4)}` : '';
}

export default function AccountCard({ api, account, onRefresh }) {
  const [pair, setPair] = useState(null); // { code, url } | { error }

  useEffect(
    () =>
      api.onPairStatus((p) => {
        if (p?.status === 'linked') setPair(null);
        if (p?.status === 'expired') setPair({ error: 'Код истёк — начните вход заново.' });
      }),
    [api]
  );

  const startPair = async () => {
    setPair({ busy: true });
    const res = await api.menuPairStart();
    setPair(res.ok ? { code: res.code, url: res.url } : { error: res.error });
  };
  const cancelPair = async () => {
    await api.menuPairCancel();
    setPair(null);
  };
  const logout = async () => {
    setPair({ busy: true });
    const res = await api.menuLogout();
    if (res.ok) setPair(null);
    else if (res.noToken) setPair({ error: 'Вход был сделан в игре. Нажмите «Сменить аккаунт» и подтвердите вход — после этого выйти можно отсюда.' });
    else setPair({ error: res.error || 'Не удалось выйти' });
  };

  if (!account) {
    return (
      <div className="panel account">
        <div className="account-skeleton" />
      </div>
    );
  }

  const { steam, roles } = account;
  if (!steam) {
    return (
      <div className="panel account">
        <div className="account-empty">
          <IconSteam size={22} />
          <div>
            <strong>Steam не найден</strong>
            <span>Запустите Steam и войдите в аккаунт.</span>
          </div>
          <button type="button" className="icon-btn" onClick={onRefresh} aria-label="Обновить">
            <IconRefresh size={16} />
          </button>
        </div>
      </div>
    );
  }

  const linked = roles?.ok && roles.linked;
  const rank = roles?.rank || (roles?.recruit ? 'CR' : '');

  return (
    <div className="panel account">
      <div className="account-head">
        <div className="avatar">{(steam.personaName || '?').trim().charAt(0).toUpperCase()}</div>
        <div className="account-id">
          <strong>{steam.personaName || 'Игрок'}</strong>
          <span>
            <IconSteam size={13} /> {maskSteam(steam.steamId)}
          </span>
        </div>
        <button type="button" className="icon-btn" onClick={onRefresh} aria-label="Обновить" title="Обновить">
          <IconRefresh size={16} />
        </button>
      </div>

      {!roles?.ok && <p className="account-note">{roles?.error || 'Сервер ролей недоступен'}</p>}

      {roles?.ok && linked && (
        <>
          <div className="account-stats">
            <div>
              <span>Звание</span>
              <b>{rank || '—'}</b>
            </div>
            <div>
              <span>Батальон</span>
              <b>{roles.battalion ? `${roles.battalion}-й` : '—'}</b>
            </div>
            <div>
              <span>Статус</span>
              <b className={roles.recruit ? 'txt-gold' : 'txt-ok'}>{roles.recruit ? 'Рекрут' : 'Discord ✓'}</b>
            </div>
          </div>
          <div className="access">
            <span className="access-label">Доступ в меню персонажа</span>
            <div className="access-chips">
              {ACCESS.map((a) => {
                const on = a.key === null || Boolean(roles.roles?.[a.key]);
                return (
                  <span key={a.label} className={`access-chip ${on ? 'is-on' : ''}`}>
                    {a.label}
                  </span>
                );
              })}
            </div>
          </div>
          {roles.pending && !pair?.code && <p className="account-note">В игре начат вход — подтвердите его в браузере.</p>}
          {!pair?.code && (
            <div className="account-actions">
              <button type="button" className="btn btn-ghost" onClick={startPair} disabled={pair?.busy}>
                <IconDiscord size={15} /> Сменить аккаунт
              </button>
              <button type="button" className="btn btn-link" onClick={logout} disabled={pair?.busy}>
                Выйти
              </button>
            </div>
          )}
          {pair?.error && <p className="account-note txt-bad">{pair.error}</p>}
        </>
      )}

      {roles?.ok && !linked && !pair?.code && (
        <div className="account-link">
          <p>Discord не привязан к меню Phoenix — стороны БСО, джедаи и наёмники закрыты.</p>
          <button type="button" className="btn btn-discord" onClick={startPair} disabled={pair?.busy}>
            <IconDiscord size={17} /> {pair?.busy ? 'Подготовка…' : 'Войти через Discord'}
          </button>
          {pair?.error && <p className="account-note txt-bad">{pair.error}</p>}
        </div>
      )}

      {pair?.code && (
        <div className="account-pair">
          <span className="pair-label">Код входа</span>
          <span className="pair-code">{pair.code}</span>
          <p>Подтвердите вход в открывшемся браузере — лаунчер увидит привязку сам.</p>
          <div className="pair-actions">
            <button type="button" className="btn btn-ghost" onClick={() => api.openUrl(pair.url)}>
              <IconExternal size={15} /> Открыть снова
            </button>
            <button type="button" className="btn btn-link" onClick={cancelPair}>
              Отмена
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
