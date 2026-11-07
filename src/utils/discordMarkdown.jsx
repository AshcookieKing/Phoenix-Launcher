// Разметка Discord -> React (без innerHTML): заголовки, списки, цитаты, код-блоки (diff подсвечивается),
// **жирный**, *курсив*, __подчёркнутый__, ~~зачёркнутый~~, ||спойлер||, `код`, ссылки, эмодзи сервера
import { useState } from 'react';

const INLINE =
  /(\|\|[\s\S]+?\|\|)|(\*\*\*[\s\S]+?\*\*\*)|(\*\*[\s\S]+?\*\*)|(__[\s\S]+?__)|(\*(?=\S)[\s\S]*?\S\*)|(~~[\s\S]+?~~)|(`[^`\n]+`)|(<a?:\w+:\d+>)|(\[[^\]\n]+\]\(https?:\/\/[^)\s]+\))|(https?:\/\/[^\s<]+[^\s<.,:;"')\]])/;

function Spoiler({ children }) {
  const [open, setOpen] = useState(false);
  return (
    <span
      className={`md-spoiler ${open ? 'is-open' : ''}`}
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation();
        setOpen(true);
      }}
      onKeyDown={(e) => e.key === 'Enter' && setOpen(true)}
    >
      {children}
    </span>
  );
}

function inline(text, ctx, keyBase = 'i') {
  const out = [];
  let rest = text;
  let k = 0;
  while (rest) {
    const m = rest.match(INLINE);
    if (!m) {
      out.push(rest);
      break;
    }
    if (m.index > 0) out.push(rest.slice(0, m.index));
    const t = m[0];
    const key = `${keyBase}-${k++}`;
    if (m[1]) out.push(<Spoiler key={key}>{inline(t.slice(2, -2), ctx, key)}</Spoiler>);
    else if (m[2]) out.push(<strong key={key}><em>{inline(t.slice(3, -3), ctx, key)}</em></strong>);
    else if (m[3]) out.push(<strong key={key}>{inline(t.slice(2, -2), ctx, key)}</strong>);
    else if (m[4]) out.push(<u key={key}>{inline(t.slice(2, -2), ctx, key)}</u>);
    else if (m[5]) out.push(<em key={key}>{inline(t.slice(1, -1), ctx, key)}</em>);
    else if (m[6]) out.push(<s key={key}>{inline(t.slice(2, -2), ctx, key)}</s>);
    else if (m[7]) out.push(<code key={key} className="md-inline-code">{t.slice(1, -1)}</code>);
    else if (m[8]) {
      const [, anim, name, id] = t.match(/<(a?):(\w+):(\d+)>/);
      out.push(
        <img key={key} className="md-emoji" alt={`:${name}:`} title={`:${name}:`} src={`https://cdn.discordapp.com/emojis/${id}.${anim ? 'gif' : 'webp'}?size=48`} />
      );
    } else if (m[9]) {
      const [, label, url] = t.match(/\[([^\]]+)\]\((\S+)\)/);
      out.push(
        <a key={key} className="md-link" href={url} onClick={(e) => (e.preventDefault(), ctx.onLink?.(url))}>
          {inline(label, ctx, key)}
        </a>
      );
    } else {
      out.push(
        <a key={key} className="md-link" href={t} onClick={(e) => (e.preventDefault(), ctx.onLink?.(t))}>
          {t.length > 60 ? `${t.slice(0, 57)}…` : t}
        </a>
      );
    }
    rest = rest.slice(m.index + t.length);
  }
  return out;
}

function CodeBlock({ lang, lines }) {
  const diff = lang === 'diff';
  return (
    <pre className={`md-code ${lang ? `md-code-${lang}` : ''}`}>
      {lines.map((l, i) => (
        <span key={i} className={diff ? (l.startsWith('+') ? 'diff-add' : l.startsWith('-') ? 'diff-del' : '') : ''}>
          {l}
          {'\n'}
        </span>
      ))}
    </pre>
  );
}

const SEPARATOR = /^[━─═_\-–—=~]{5,}$/;

export function DiscordText({ text, onLink, className = '' }) {
  const ctx = { onLink };
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const blocks = [];
  let para = [];
  let list = null; // { ordered, items }
  let quote = [];
  let k = 0;

  const flushPara = () => {
    if (!para.length) return;
    const key = `p${k++}`;
    blocks.push(
      <p key={key}>
        {para.map((l, i) => (
          <span key={i}>
            {i > 0 && <br />}
            {inline(l, ctx, `${key}-${i}`)}
          </span>
        ))}
      </p>
    );
    para = [];
  };
  const flushList = () => {
    if (!list) return;
    const key = `l${k++}`;
    const Tag = list.ordered ? 'ol' : 'ul';
    blocks.push(
      <Tag key={key}>
        {list.items.map((it, i) => (
          <li key={i}>{inline(it, ctx, `${key}-${i}`)}</li>
        ))}
      </Tag>
    );
    list = null;
  };
  const flushQuote = () => {
    if (!quote.length) return;
    const key = `q${k++}`;
    blocks.push(
      <blockquote key={key}>
        <DiscordText text={quote.join('\n')} onLink={onLink} />
      </blockquote>
    );
    quote = [];
  };
  const flushAll = () => {
    flushPara();
    flushList();
    flushQuote();
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    const fence = trimmed.match(/^```(.*)$/);
    if (fence) {
      flushAll();
      let lang = '';
      let first = fence[1];
      const body = [];
      if (/^[\w+-]+$/.test(first)) {
        lang = first.toLowerCase();
        first = '';
      }
      if (first.includes('```')) {
        body.push(first.slice(0, first.indexOf('```')));
      } else {
        if (first) body.push(first);
        for (i += 1; i < lines.length; i++) {
          const at = lines[i].indexOf('```');
          if (at >= 0) {
            if (at > 0) body.push(lines[i].slice(0, at));
            break;
          }
          body.push(lines[i]);
        }
      }
      blocks.push(<CodeBlock key={`c${k++}`} lang={lang} lines={body} />);
      continue;
    }
    if (trimmed.startsWith('>>> ')) {
      flushPara();
      flushList();
      quote.push(trimmed.slice(4), ...lines.slice(i + 1));
      break;
    }
    const q = line.match(/^\s*> ?(.*)$/);
    if (q) {
      flushPara();
      flushList();
      quote.push(q[1]);
      continue;
    }
    flushQuote();
    if (!trimmed) {
      flushPara();
      flushList();
      continue;
    }
    if (SEPARATOR.test(trimmed)) {
      flushAll();
      blocks.push(<hr key={`h${k++}`} className="md-sep" />);
      continue;
    }
    const h = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      flushAll();
      if (h[2].trim()) {
        const Tag = `h${h[1].length + 2}`;
        blocks.push(<Tag key={`t${k++}`} className={`md-h${h[1].length}`}>{inline(h[2], ctx, `t${k}`)}</Tag>);
      }
      continue;
    }
    const sub = trimmed.match(/^-#\s+(.*)$/);
    if (sub) {
      flushAll();
      blocks.push(<p key={`s${k++}`} className="md-sub">{inline(sub[1], ctx, `s${k}`)}</p>);
      continue;
    }
    const li = line.match(/^\s*(?:[-*•]|(\d+)[.)])\s+(.*)$/);
    if (li) {
      flushPara();
      const ordered = Boolean(li[1]);
      if (list && list.ordered !== ordered) flushList();
      if (!list) list = { ordered, items: [] };
      list.items.push(li[2]);
      continue;
    }
    flushList();
    para.push(line);
  }
  flushAll();
  return <div className={`md ${className}`}>{blocks}</div>;
}

// Текст без разметки - для анонсов в карточках
export function plainText(text) {
  return String(text || '')
    .replace(/```[\w+-]*\n?/g, '')
    .replace(/<a?:(\w+):\d+>/g, '')
    .replace(/\[([^\]]+)\]\(\S+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/^\s*(#{1,3}|-#|>{1,3})\s*/gm, '')
    .replace(/\*\*|__|~~|\|\||`|^\s*[-*•]\s+/gm, '')
    .replace(/(^|\s)[*_](\S)/g, '$1$2')
    .replace(/(\S)[*_](\s|$)/g, '$1$2')
    .replace(/[━─═]{3,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Анонс поста без рубрики и заголовка (они показаны отдельно)
export function excerpt(post, max = 220) {
  let t = plainText(post.text);
  for (const head of [post.kicker, post.title]) {
    const h = plainText(head);
    if (h && t.startsWith(h)) t = t.slice(h.length).trim();
  }
  return t.length > max ? `${t.slice(0, max).replace(/\s+\S*$/, '')}…` : t;
}
