// Персонажи меню Phoenix (из профиля Arma): карточки слотов на вкладке «Персонажи» и короткий список на главной
import { relDate } from '../utils/format';
import { IconPlay, IconRefresh, IconUser } from './Icons';

const SIDE = {
  cadet: { label: 'Клон ВАР', img: './assets/sides/cadet.png' },
  mercenary: { label: 'Наёмник', img: './assets/sides/mercenary.png' },
  jedi: { label: 'Джедай', img: './assets/sides/jedi.png' },
  bso: { label: 'БСО', img: './assets/sides/bso.png' },
};

// Стороны меню и роли Discord, которые их открывают (как в игре)
const ACCESS = [
  { key: null, kind: 'cadet', label: 'Клоны' },
  { key: 'mercenary', kind: 'mercenary', label: 'Наёмники' },
  { key: 'jedi', kind: 'jedi', label: 'Джедаи' },
  { key: 'bso', kind: 'bso', label: 'БСО' },
];

// Слоты как в меню: 1-й - клон, 2-й - открыт всем, 3-й - роль «третий слот»; без входа через Discord закрыты
function slotInfo(n, roles) {
  const linked = Boolean(roles?.ok && roles.linked);
  if (!linked) return { locked: true, why: 'Войдите через Discord' };
  if (n === 3 && !roles.roles?.slot3) return { locked: true, why: 'Нужна роль «3-й слот» в Discord' };
  return { locked: false, hint: n === 1 ? 'Только клон регулярной армии' : 'Клон или открытая вам сторона' };
}

function Stat({ label, value }) {
  return (
    <div className="char-stat">
      <span>{label}</span>
      <b>{value || '—'}</b>
    </div>
  );
}

function CharacterCard({ char, onPlay, busy }) {
  const side = SIDE[char.kind] || SIDE.cadet;
  return (
    <article className={`char-card side-${char.kind} ${char.active ? 'is-active' : ''}`}>
      <div className="char-glow" />
      <div className="char-corners" />
      <img className="char-emblem" src={side.img} alt="" />
      <div className="char-top">
        <span className="char-slot">Слот {char.slot}</span>
        {char.claimPending ? (
          <span className="char-pill is-wait">Звание на проверке</span>
        ) : char.rank === 'CR' ? (
          <span className="char-pill is-recruit">Рекрут</span>
        ) : (
          <span className="char-pill">{char.status === 'active' ? 'Активен' : char.status}</span>
        )}
      </div>
      <div className="char-body">
        <span className="char-side">{char.kindLabel || side.label}</span>
        <h3 className="char-name">{char.name || 'Без имени'}</h3>
        <div className="char-stats">
          <Stat label="Звание" value={char.rank} />
          <Stat label="Номер" value={char.cloneNumber} />
          <Stat label="Батальон" value={char.battalion ? `${char.battalion}` : ''} />
        </div>
        <div className="char-profile" title="Профиль Arma, под которым играет персонаж">
          <IconUser size={14} />
          <span>{char.profile ? `Профиль Arma: ${char.profile}` : 'Свой профиль Arma не создан'}</span>
        </div>
        <button type="button" className="btn btn-fire char-play" onClick={() => onPlay(char)} disabled={busy}>
          <IconPlay size={14} /> Играть {char.profileId ? 'за персонажа' : ''}
        </button>
      </div>
    </article>
  );
}

function EmptySlot({ n, roles }) {
  const s = slotInfo(n, roles);
  return (
    <article className={`char-card char-empty ${s.locked ? 'is-locked' : ''}`}>
      <div className="char-corners" />
      <div className="char-top">
        <span className="char-slot">Слот {n}</span>
      </div>
      <div className="char-empty-body">
        <span className="char-plus">{s.locked ? '🔒' : '+'}</span>
        <b>{s.locked ? 'Слот закрыт' : 'Свободный слот'}</b>
        <span>{s.locked ? s.why : `${s.hint}. Создаётся в меню Phoenix в игре.`}</span>
      </div>
    </article>
  );
}

export default function CharactersView({ data, roles, busy, onRefresh, onPlay }) {
  const chars = data?.chars || [];
  const bySlot = new Map(chars.map((c) => [c.slot, c]));
  return (
    <div className="page chars-page">
      <div className="page-head">
        <div>
          <h1>Персонажи</h1>
          <p>
            Персонажи из меню Phoenix в игре.
            {data?.profile ? ` Данные из профиля Arma «${data.profile}», сохранено ${relDate(data.updatedAt)}.` : ''}
            {' '}«Играть» запускает Arma под профилем персонажа — в игре вас увидят под его именем.
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-ghost" onClick={onRefresh}>
            <IconRefresh size={16} /> Обновить
          </button>
        </div>
      </div>

      <div className="chars-grid">
        {[1, 2, 3].map((n) =>
          bySlot.has(n) ? (
            <CharacterCard key={n} char={bySlot.get(n)} onPlay={onPlay} busy={busy} />
          ) : (
            <EmptySlot key={n} n={n} roles={roles} />
          )
        )}
      </div>

      <div className="panel chars-access">
        <span className="access-label">Стороны, открытые вам в меню</span>
        <div className="chars-access-list">
          {ACCESS.map((a) => {
            const on = a.key === null ? Boolean(roles?.ok) : Boolean(roles?.ok && roles.linked && roles.roles?.[a.key]);
            return (
              <span key={a.label} className={`chars-access-item side-${a.kind} ${on ? 'is-on' : ''}`}>
                <img src={SIDE[a.kind].img} alt="" />
                {a.label}
              </span>
            );
          })}
          {roles?.ok && roles.linked && (roles.roles?.arc || roles.roles?.rc) ? (
            <span className="chars-access-note">БСО: {[roles.roles.arc && 'ARC', roles.roles.rc && 'RC'].filter(Boolean).join(' / ')}</span>
          ) : null}
        </div>
        {!(roles?.ok && roles.linked) && <p className="account-note">Без входа через Discord открыт только клон в 1-м слоте.</p>}
      </div>
    </div>
  );
}

// Короткий список на главной
export function CharactersMini({ data, onOpen }) {
  const chars = data?.chars || [];
  return (
    <div className="panel chars-mini">
      <div className="chars-mini-head">
        <span>Мои персонажи</span>
        <button type="button" className="btn btn-link" onClick={onOpen}>
          Все →
        </button>
      </div>
      {!chars.length && (
        <button type="button" className="chars-mini-empty" onClick={onOpen}>
          {data ? 'Персонажей пока нет — создайте их в меню Phoenix в игре' : 'Загрузка…'}
        </button>
      )}
      {chars.slice(0, 3).map((c) => (
        <button key={c.slot} type="button" className={`chars-mini-row side-${c.kind}`} onClick={onOpen}>
          <img src={(SIDE[c.kind] || SIDE.cadet).img} alt="" />
          <span className="chars-mini-text">
            <b>{c.name || 'Без имени'}</b>
            <small>
              {c.kindLabel}
              {c.rank ? ` · ${c.rank}` : ''}
              {c.claimPending ? ' · на проверке' : ''}
            </small>
          </span>
          <span className="chars-mini-slot">{c.slot}</span>
        </button>
      ))}
    </div>
  );
}
