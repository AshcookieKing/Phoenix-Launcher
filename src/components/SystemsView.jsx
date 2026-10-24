import {
  IconBackpack,
  IconExternal,
  IconHolo,
  IconMedic,
  IconPanel,
  IconShield,
  IconShuttle,
  IconTarget,
  IconUser,
  IconVisor,
} from './Icons';

// Системы, сделанные для Phoenix RP (меню, фронт, Камино, панель, комплекты, HUD…)
const SYSTEMS = [
  {
    Icon: IconUser,
    title: 'Меню персонажа',
    text: 'Вход через Discord, три слота персонажей, стороны Клоны · БСО · Джедаи · Наёмники, гардероб и комплекты. Звание и батальон приходят из Discord.',
    tags: ['Discord', '3 слота'],
  },
  {
    Icon: IconShield,
    title: 'Фронт Фарабада',
    text: 'Война Республики с КНС на ALiVE: сектора, опорники со щитами, ПВО и охраной. Щиты улучшаются, мир сохраняется, ИИ-генералы отдыхают ночью и без игроков.',
    tags: ['ALiVE', 'Опорники'],
  },
  {
    Icon: IconTarget,
    title: 'Камино — учебный хаб',
    text: 'Строевая, стрельбище, гранаты по технике, стройка укрытия лопаткой, стенд вооружения. Симуляции с рекордами каждого бойца, выбор класса уходит в меню.',
    tags: ['Обучение', 'Рекорды'],
  },
  {
    Icon: IconShuttle,
    title: 'Перелёт Камино ↔ Фронт',
    text: 'Шаттл в ангаре Венатора переносит между серверами. После перелёта — сразу у шаттла, без выбора точки высадки.',
    tags: ['2 сервера'],
  },
  {
    Icon: IconPanel,
    title: 'Панель Phoenix',
    text: 'Все системы в одном окне: графика и дальность ИИ, диагностика FPS, медстатус, радио, приказы. Клавишу можно сменить в управлении.',
    keys: ['Shift', 'P'],
  },
  {
    Icon: IconBackpack,
    title: 'ShadowKit',
    text: 'Комплекты снаряжения своего класса со склада базы. Открываются клавишей или с ящиков в казармах.',
    keys: ['Shift', 'K'],
  },
  {
    Icon: IconVisor,
    title: 'HUD клона',
    text: 'Визор шлема: компас, броня, оружие и отряд. Цвет и ширина интерфейса настраиваются в панели.',
    tags: ['Интерфейс'],
  },
  {
    Icon: IconMedic,
    title: 'Медицина',
    text: '«Лучшее лечение» ACE одним действием и медицинский дроид в штабе и на каждом опорнике.',
    tags: ['ACE', 'Меддроид'],
  },
  {
    Icon: IconHolo,
    title: 'Штаб HQ',
    text: 'Палатка штаба с голостолом: главнокомандующий Коди и офицер штаба встречают у карты фронта.',
    tags: ['Фарабад'],
  },
];

export default function SystemsView({ api, links }) {
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Системы Phoenix</h1>
          <p>Что ждёт на серверах: всё это работает прямо в игре, отдельно ставить ничего не нужно.</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-fire" onClick={() => api.openUrl(links.progression)}>
            <IconExternal size={16} /> Подготовка клона
          </button>
        </div>
      </div>

      <div className="systems-grid">
        {SYSTEMS.map(({ Icon, title, text, tags, keys }) => (
          <article key={title} className="panel system-card">
            <div className="system-icon">
              <Icon size={22} />
            </div>
            <h3>{title}</h3>
            <p>{text}</p>
            <div className="system-foot">
              {keys && (
                <span className="keys">
                  {keys.map((k, i) => (
                    <span key={k}>
                      {i > 0 && <i>+</i>}
                      <kbd>{k}</kbd>
                    </span>
                  ))}
                </span>
              )}
              {tags?.map((t) => (
                <span key={t} className="tag">
                  {t}
                </span>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
