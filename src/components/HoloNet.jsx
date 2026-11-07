// HoloNet: новости из Discord-канала Phoenix «holonet» (лента от бота на хосте) - вкладка, окно чтения и блок главной
import { useEffect, useState } from 'react';
import { DiscordText, excerpt } from '../utils/discordMarkdown';
import { fullDate, relDate } from '../utils/format';
import { useEscapeClose } from '../hooks/useEscapeClose';
import { IconClose, IconDiscord, IconHolo, IconPlay, IconRefresh } from './Icons';

export function coverOf(post) {
  if (!post) return '';
  return post.images?.[0]?.url || post.videos?.find((v) => v.thumb)?.thumb || '';
}

function Cover({ post, className = '' }) {
  const src = coverOf(post);
  const [broken, setBroken] = useState(false);
  return (
    <div className={`hn-cover ${className} ${!src || broken ? 'is-empty' : ''}`}>
      {src && !broken ? (
        <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <img src="./assets/phoenix_emblem.png" alt="" className="hn-cover-emblem" />
      )}
      {post?.videos?.some((v) => v.kind === 'youtube') && (
        <span className="hn-play">
          <IconPlay size={18} />
        </span>
      )}
    </div>
  );
}

function Meta({ post }) {
  return (
    <span className="hn-meta">
      {post.avatar ? <img src={post.avatar} alt="" /> : <i className="hn-meta-dot" />}
      <b>{post.author}</b>
      <span>· {relDate(post.ts)}</span>
    </span>
  );
}

export function HoloNetBadge({ live = true }) {
  return (
    <span className={`hn-badge ${live ? 'is-live' : ''}`}>
      <i />
      HOLONET
    </span>
  );
}

// Окно чтения поста
export function HoloNetReader({ post, api, onClose }) {
  const [zoom, setZoom] = useState(null);
  useEscapeClose(Boolean(post), () => (zoom ? setZoom(null) : onClose()));
  useEffect(() => setZoom(null), [post?.id]);
  if (!post) return null;
  const [hero, ...gallery] = post.images || [];
  const open = (url) => api.openUrl(url);
  return (
    <div className="hn-reader-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <article className="hn-reader" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="hn-reader-close win-btn" onClick={onClose} aria-label="Закрыть">
          <IconClose size={18} />
        </button>
        <div className="hn-reader-scroll">
          {hero && (
            <button type="button" className="hn-reader-hero" onClick={() => setZoom(hero.url)}>
              <img src={hero.url} alt="" />
            </button>
          )}
          <header className="hn-reader-head">
            <HoloNetBadge live={false} />
            {post.kicker && <span className="hn-kicker">{post.kicker}</span>}
            <h2>{post.title}</h2>
            <div className="hn-reader-meta">
              <Meta post={post} />
              <span className="hn-date" title={fullDate(post.ts)}>
                {fullDate(post.ts)}
              </span>
              <button type="button" className="btn btn-ghost hn-discord" onClick={() => open(post.link)}>
                <IconDiscord size={15} /> В Discord
              </button>
            </div>
          </header>
          <DiscordText text={post.text} onLink={open} className="hn-body" />
          {post.videos?.length > 0 && (
            <div className="hn-videos">
              {post.videos.map((v, i) =>
                v.kind === 'youtube' ? (
                  <button key={i} type="button" className="hn-yt" onClick={() => open(v.url)}>
                    {v.thumb && <img src={v.thumb} alt="" />}
                    <span className="hn-play">
                      <IconPlay size={22} />
                    </span>
                    {v.title && <b>{v.title}</b>}
                  </button>
                ) : (
                  <video key={i} src={v.url} className="hn-video" controls={v.kind === 'file'} autoPlay={v.kind === 'gif'} loop={v.kind === 'gif'} muted={v.kind === 'gif'} playsInline />
                )
              )}
            </div>
          )}
          {gallery.length > 0 && (
            <div className="hn-gallery">
              {gallery.map((img, i) => (
                <button key={i} type="button" onClick={() => setZoom(img.url)}>
                  <img src={img.url} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>
      </article>
      {zoom && (
        <div className="hn-zoom" onClick={(e) => (e.stopPropagation(), setZoom(null))}>
          <img src={zoom} alt="" />
        </div>
      )}
    </div>
  );
}

// Главный выпуск на главной странице: последний пост + ещё три
export function HoloNetHero({ feed, onOpen, onAll }) {
  const posts = feed?.posts || [];
  const main = posts[0];
  if (!main) {
    return (
      <section className="hn-hero is-empty">
        <div className="hn-hero-body">
          <HoloNetBadge live={false} />
          <h2>{feed ? 'Лента HoloNet пуста' : 'Подключение к HoloNet…'}</h2>
          <p>Новости канала #holonet в Discord Phoenix появятся здесь.</p>
        </div>
      </section>
    );
  }
  const more = posts.slice(1, 4);
  return (
    <section className="hn-hero">
      <Cover post={main} className="hn-hero-cover" />
      <div className="hn-hero-shade" />
      <div className="hn-hero-body">
        <div className="hn-hero-top">
          <HoloNetBadge live={feed.online !== false} />
          <span className="hn-hero-when">{relDate(main.ts)}</span>
        </div>
        {main.kicker && <span className="hn-kicker">{main.kicker}</span>}
        <h2 className="hn-hero-title">{main.title}</h2>
        <p className="hn-hero-excerpt">{excerpt(main, 210)}</p>
        <div className="hn-hero-actions">
          <button type="button" className="btn btn-fire" onClick={() => onOpen(main)}>
            Читать выпуск
          </button>
          <button type="button" className="btn btn-ghost" onClick={onAll}>
            <IconHolo size={16} /> Весь HoloNet
          </button>
          <Meta post={main} />
        </div>
      </div>
      {more.length > 0 && (
        <div className="hn-hero-rail">
          <span className="hn-rail-label">Ещё выпуски</span>
          {more.map((p) => (
            <button key={p.id} type="button" className="hn-rail-item" onClick={() => onOpen(p)}>
              <Cover post={p} className="hn-rail-cover" />
              <span className="hn-rail-text">
                <b>{p.title}</b>
                <small>{relDate(p.ts)}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

// Вкладка HoloNet
export default function HoloNetView({ api, feed, onRefresh, links }) {
  const [reading, setReading] = useState(null);
  const [busy, setBusy] = useState(false);
  const posts = feed?.posts || [];
  const [main, ...rest] = posts;

  const refresh = async () => {
    setBusy(true);
    try {
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page hn-page">
      <div className="page-head">
        <div>
          <h1>HoloNet</h1>
          <p>
            Выпуски новостей галактики из канала #holonet в Discord Phoenix.
            {feed?.updatedAt ? ` Обновлено ${relDate(feed.updatedAt * 1000)}.` : ''}
            {feed && feed.online === false ? ' Сейчас без связи — показана сохранённая лента.' : ''}
          </p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn btn-ghost" onClick={refresh} disabled={busy}>
            <IconRefresh size={16} /> {busy ? 'Обновление…' : 'Обновить'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => api.openUrl(links.discord)}>
            <IconDiscord size={16} /> Discord
          </button>
        </div>
      </div>

      {!main && <div className="panel empty">{feed ? 'Выпусков пока нет.' : 'Загрузка HoloNet…'}</div>}

      {main && (
        <button type="button" className="hn-feature" onClick={() => setReading(main)}>
          <Cover post={main} className="hn-feature-cover" />
          <span className="hn-feature-body">
            <span className="hn-feature-top">
              <HoloNetBadge live={feed.online !== false} />
              <span>{relDate(main.ts)}</span>
            </span>
            {main.kicker && <span className="hn-kicker">{main.kicker}</span>}
            <b className="hn-feature-title">{main.title}</b>
            <span className="hn-feature-excerpt">{excerpt(main, 320)}</span>
            <Meta post={main} />
          </span>
        </button>
      )}

      {rest.length > 0 && (
        <div className="hn-grid">
          {rest.map((p) => (
            <button key={p.id} type="button" className="hn-card" onClick={() => setReading(p)}>
              <Cover post={p} className="hn-card-cover" />
              <span className="hn-card-body">
                {p.kicker && <span className="hn-kicker">{p.kicker}</span>}
                <b className="hn-card-title">{p.title}</b>
                <span className="hn-card-excerpt">{excerpt(p, 140)}</span>
                <Meta post={p} />
              </span>
            </button>
          ))}
        </div>
      )}

      <HoloNetReader post={reading} api={api} onClose={() => setReading(null)} />
    </div>
  );
}
