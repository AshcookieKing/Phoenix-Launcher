import { useEffect, useState } from 'react';
import { IconDiscord, IconExternal } from './Icons';

// Перед запуском игры без привязки Discord: вход здесь - и меню Phoenix в игре войдёт само (тот же SteamID в phx_roleapi)
export default function AuthGate({ api, onLinked, onSkip, onCancel }) {
  const [pair, setPair] = useState(null); // { busy } | { code, url } | { error }

  useEffect(
    () =>
      api.onPairStatus((p) => {
        if (p?.status === 'linked') onLinked();
        if (p?.status === 'expired') setPair({ error: 'Код истёк — начните вход заново.' });
      }),
    [api, onLinked]
  );

  const start = async () => {
    setPair({ busy: true });
    const res = await api.menuPairStart();
    setPair(res.ok ? { code: res.code, url: res.url } : { error: res.error });
  };
  const cancel = async () => {
    if (pair?.code) await api.menuPairCancel();
    onCancel();
  };

  return (
    <div className="gate-backdrop" role="dialog" aria-modal="true">
      <div className="panel gate">
        <h3>Вход через Discord</h3>
        {!pair?.code ? (
          <>
            <p>
              Discord не привязан. Войдите сейчас — меню персонажа в игре откроется уже с вашим аккаунтом, без входа в
              игре. Без входа стороны БСО, джедаи и наёмники закрыты.
            </p>
            <button type="button" className="btn btn-discord" onClick={start} disabled={pair?.busy}>
              <IconDiscord size={17} /> {pair?.busy ? 'Подготовка…' : 'Войти через Discord'}
            </button>
            {pair?.error && <p className="account-note txt-bad">{pair.error}</p>}
            <div className="gate-actions">
              <button type="button" className="btn btn-ghost" onClick={onSkip}>
                Играть без входа
              </button>
              <button type="button" className="btn btn-link" onClick={cancel}>
                Отмена
              </button>
            </div>
          </>
        ) : (
          <div className="account-pair">
            <span className="pair-label">Код входа</span>
            <span className="pair-code">{pair.code}</span>
            <p>Подтвердите вход в открывшемся браузере — игра запустится сама.</p>
            <div className="pair-actions">
              <button type="button" className="btn btn-ghost" onClick={() => api.openUrl(pair.url)}>
                <IconExternal size={15} /> Открыть снова
              </button>
              <button type="button" className="btn btn-link" onClick={cancel}>
                Отмена
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
