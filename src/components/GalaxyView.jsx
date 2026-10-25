import { useCallback, useEffect, useRef, useState } from 'react';
import { IconExternal, IconMap, IconRefresh } from './Icons';

// Общая галактика Phoenix (сайт :3005) и HoloNet. Данные приносит главный процесс (get-galaxy), обновление раз в 10 с.
const REFRESH_MS = 10000;
const COLORS = { Republic: '#4a90ff', CIS: '#ff4545', 'Hutt Cartel': '#ffd24a', Neutral: '#8a7d76' };
const NAMES = { Republic: 'Республика', CIS: 'КНС', 'Hutt Cartel': 'Картель хаттов', Neutral: 'Нейтралы' };
const KIND = { battle: 'Фронт', politics: 'Сенат', intrigue: 'Происшествие', finale: 'Финал войны', custom: 'Сводка' };
const BRANCH = { alt: 'альтернатива', contested: 'бои продолжаются' };

function GalaxyCanvas({ view, battlePlanets, onPickBattle }) {
  const ref = useRef(null);
  const cam = useRef({ x: 0.5, y: 0.5, z: 1 });
  const drag = useRef(null);
  const hover = useRef(-1);
  const [tip, setTip] = useState(null);

  const toScreen = (c, px, py) => {
    const s = Math.min(c.width, c.height) * 0.94 * cam.current.z;
    return [c.width / 2 + (px - cam.current.x) * s, c.height / 2 + (py - cam.current.y) * s];
  };

  const draw = useCallback(
    (pulse = 0) => {
      const c = ref.current;
      if (!c || !view) return;
      const g = c.getContext('2d');
      g.clearRect(0, 0, c.width, c.height);
      const s = Math.min(c.width, c.height) * 0.94 * cam.current.z;
      const c0 = toScreen(c, 0.5, 0.5);
      g.strokeStyle = 'rgba(255,122,64,.10)';
      g.lineWidth = 1;
      for (let r = 0.1; r <= 0.5; r += 0.1) {
        g.beginPath();
        g.arc(c0[0], c0[1], r * s, 0, Math.PI * 2);
        g.stroke();
      }
      const P = view.planets;
      for (const t of view.transits || []) {
        const a = P[t[0]];
        const b = P[t[1]];
        if (!a || !b) continue;
        const A = toScreen(c, a[1], a[2]);
        const B = toScreen(c, b[1], b[2]);
        g.strokeStyle = `${COLORS[t[2]] || '#fff'}88`;
        g.setLineDash([5, 5]);
        g.beginPath();
        g.moveTo(A[0], A[1]);
        g.lineTo(B[0], B[1]);
        g.stroke();
        g.setLineDash([]);
        const x = A[0] + (B[0] - A[0]) * t[3];
        const y = A[1] + (B[1] - A[1]) * t[3];
        g.fillStyle = COLORS[t[2]] || '#fff';
        g.beginPath();
        g.arc(x, y, 3.5, 0, Math.PI * 2);
        g.fill();
      }
      const battles = new Set((view.battles || []).map((b) => b[0]));
      const big = cam.current.z >= 1.6;
      P.forEach((p, i) => {
        const [x, y] = toScreen(c, p[1], p[2]);
        if (x < -20 || y < -20 || x > c.width + 20 || y > c.height + 20) return;
        const rad = (p[5] === 'Critical' ? 4.5 : p[5] === 'High' ? 3.5 : 2.6) * Math.min(2, Math.sqrt(cam.current.z));
        if (p[4] || battles.has(i)) {
          g.strokeStyle = battles.has(i) ? `rgba(255,154,31,${0.5 + 0.5 * Math.sin(pulse)})` : 'rgba(255,69,69,.75)';
          g.lineWidth = 2;
          g.beginPath();
          g.arc(x, y, rad + 4 + 1.5 * Math.sin(pulse), 0, Math.PI * 2);
          g.stroke();
        }
        g.fillStyle = COLORS[p[3]] || '#888';
        g.beginPath();
        g.arc(x, y, rad, 0, Math.PI * 2);
        g.fill();
        const isBattle = battlePlanets.includes(p[0]);
        if (isBattle) {
          g.strokeStyle = '#ffd23f';
          g.lineWidth = 2;
          g.strokeRect(x - rad - 4, y - rad - 4, (rad + 4) * 2, (rad + 4) * 2);
        }
        if (big || p[5] === 'Critical' || p[4] || isBattle || i === hover.current) {
          g.fillStyle = i === hover.current ? '#fff' : 'rgba(246,238,230,.75)';
          g.font = `${isBattle ? '600 ' : ''}11px "Exo 2", Segoe UI, sans-serif`;
          g.fillText(p[0], x + rad + 5, y + 4);
        }
      });
    },
    [view, battlePlanets]
  );

  useEffect(() => {
    const c = ref.current;
    const fit = () => {
      const r = c.getBoundingClientRect();
      c.width = r.width;
      c.height = r.height;
      draw();
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(c);
    let pulse = 0;
    const id = setInterval(() => draw((pulse += 0.25)), 120);
    return () => {
      ro.disconnect();
      clearInterval(id);
    };
  }, [draw]);

  const pick = (mx, my) => {
    const c = ref.current;
    if (!view) return -1;
    let best = -1;
    let bd = 14 * 14;
    view.planets.forEach((p, i) => {
      const [x, y] = toScreen(c, p[1], p[2]);
      const d = (x - mx) ** 2 + (y - my) ** 2;
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  };

  return (
    <div className="galaxy-canvas">
      <canvas
        ref={ref}
        onWheel={(e) => {
          const c = ref.current;
          const r = c.getBoundingClientRect();
          const mx = e.clientX - r.left;
          const my = e.clientY - r.top;
          const s0 = Math.min(c.width, c.height) * 0.94;
          const k = cam.current;
          const wx = k.x + (mx - c.width / 2) / (s0 * k.z);
          const wy = k.y + (my - c.height / 2) / (s0 * k.z);
          k.z = Math.max(0.8, Math.min(12, k.z * (e.deltaY < 0 ? 1.2 : 1 / 1.2)));
          k.x = wx - (mx - c.width / 2) / (s0 * k.z);
          k.y = wy - (my - c.height / 2) / (s0 * k.z);
          draw();
        }}
        onMouseDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, cx: cam.current.x, cy: cam.current.y, moved: false };
        }}
        onMouseUp={(e) => {
          const d = drag.current;
          drag.current = null;
          if (!d || d.moved || !view) return;
          const r = ref.current.getBoundingClientRect();
          const i = pick(e.clientX - r.left, e.clientY - r.top);
          if (i >= 0 && battlePlanets.includes(view.planets[i][0])) onPickBattle(view.planets[i][0]);
        }}
        onMouseLeave={() => {
          drag.current = null;
          setTip(null);
        }}
        onMouseMove={(e) => {
          const c = ref.current;
          const r = c.getBoundingClientRect();
          const mx = e.clientX - r.left;
          const my = e.clientY - r.top;
          const d = drag.current;
          if (d) {
            const s = Math.min(c.width, c.height) * 0.94 * cam.current.z;
            if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 3) d.moved = true;
            cam.current.x = d.cx - (e.clientX - d.x) / s;
            cam.current.y = d.cy - (e.clientY - d.y) / s;
            draw();
            return;
          }
          const i = pick(mx, my);
          if (i !== hover.current) {
            hover.current = i;
            draw();
          }
          setTip(i >= 0 ? { x: mx, y: my, p: view.planets[i] } : null);
        }}
      />
      {tip && (
        <div className="galaxy-tip" style={{ left: tip.x + 14, top: tip.y + 10 }}>
          <b>{tip.p[0]}</b> · <span style={{ color: COLORS[tip.p[3]] }}>{NAMES[tip.p[3]] || tip.p[3]}</span>
          {tip.p[4] ? <span className="galaxy-front"> · фронт</span> : null}
          {battlePlanets.includes(tip.p[0]) ? <span className="galaxy-front"> · бой в Arma — клик</span> : null}
        </div>
      )}
      <div className="galaxy-hint">Колесо — масштаб, перетаскивание — сдвиг. Клик по Рилоту или Камино — живая карта боя.</div>
    </div>
  );
}

export default function GalaxyView({ api, links }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.getGalaxy();
      if (res.ok) {
        setData(res);
        setError('');
      } else setError(res.error || 'Сервер галактики недоступен');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => {
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => clearInterval(id);
  }, [load]);

  const view = data?.view;
  const battles = data?.battles || [];
  const fronts = view ? view.planets.filter((p) => p[4]).map((p) => p[0]) : [];
  const openBattle = (planet) => {
    const b = battles.find((x) => x.planet === planet);
    if (b) api.openUrl(b.url);
  };

  return (
    <div className="page galaxy-page">
      <div className="page-head">
        <div>
          <h1>Галактика</h1>
          <p>
            Общая война Республики и КНС: одна карта для всех, сводки HoloNet по канону 21–19 ДБЯ.
            {view ? ` Сейчас месяц войны ${(view.month || 0) + 1}.` : ''}
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-ghost" onClick={load} disabled={loading}>
            <IconRefresh size={16} /> Обновить
          </button>
          <button type="button" className="btn btn-fire" onClick={() => api.openUrl(links.galaxy)}>
            <IconExternal size={16} /> Полная карта
          </button>
        </div>
      </div>

      {error && !view && <div className="panel galaxy-error">{error}. Попробуйте позже.</div>}

      {view && (
        <div className="galaxy-layout">
          <section className="panel galaxy-map">
            <GalaxyCanvas view={view} battlePlanets={battles.map((b) => b.planet)} onPickBattle={openBattle} />
          </section>

          <aside className="galaxy-side">
            <div className="panel galaxy-block">
              <h3>Силы сторон</h3>
              {['Republic', 'CIS', 'Hutt Cartel', 'Neutral'].map((f) => (
                <div key={f} className="galaxy-row">
                  <span>
                    <span className="dot" style={{ background: COLORS[f] }} /> {NAMES[f]}
                  </span>
                  <b>{view.totals?.[f] || 0}</b>
                </div>
              ))}
              {fronts.length > 0 && <p className="galaxy-fronts">Фронты: {fronts.join(', ')}</p>}
            </div>

            <div className="panel galaxy-block">
              <h3>Сражения в Arma</h3>
              {battles.map((b) => {
                const s = b.summary;
                return (
                  <div key={b.serverId} className="galaxy-battle">
                    <div>
                      <b>{b.planet}</b> <span className="galaxy-muted">· сервер «{b.title}»</span>
                      <div className="galaxy-muted">
                        {s?.online ? (
                          <>
                            <span className="dot dot-live" /> LIVE · {s.counts.players} игр. · {s.counts.units_ai} ИИ · {s.counts.vehicles} техн.
                          </>
                        ) : (
                          'сервер не передаёт данные'
                        )}
                      </div>
                    </div>
                    <button type="button" className="btn btn-ghost" onClick={() => api.openUrl(b.url)} title="Живая карта боя">
                      <IconMap size={16} />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="panel galaxy-block galaxy-holonet">
              <h3>
                HoloNet <span className="galaxy-muted">· {data.holonet?.paused ? 'пауза' : 'в эфире'}</span>
              </h3>
              {(data.holonet?.items || []).length === 0 && (
                <p className="galaxy-muted">Первая сводка выйдет в середине первого месяца войны.</p>
              )}
              {(data.holonet?.items || []).slice(0, 30).map((n) => (
                <article key={n.id} className="galaxy-news">
                  <div className="galaxy-news-meta">
                    {n.date} · {KIND[n.kind] || n.kind}
                    {n.planet ? <b> · {n.planetRu || n.planet}</b> : null}
                    {BRANCH[n.branch] ? <i> · {BRANCH[n.branch]}</i> : null}
                  </div>
                  <h4>{n.title}</h4>
                  <p>{n.text}</p>
                </article>
              ))}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
