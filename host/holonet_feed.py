# -*- coding: utf-8 -*-
r"""
HoloNet для Phoenix Launcher: канал Discord «holonet» сервера Phoenix -> JSON для лаунчера.

Читает канал через REST API Discord токеном бота «Phoenix | Online Bot» (берётся из .env бота при запуске, никуда не
копируется и не печатается). К шлюзу Discord не подключается - бот, который сейчас работает с этим токеном, не мешает.
Раз в POLL_SEC забирает последние сообщения, склеивает пост автора с картинками, которые он прислал следом,
заменяет упоминания ролей/людей/каналов на имена и отдаёт:

  GET /api/holonet[?limit=N]  -> {"ok": true, "channel": "...", "updatedAt": ..., "posts": [...]}
  GET /health                 -> {"ok": true}

Пост: id, ts, author, avatar, kicker (рубрика), title, text (разметка Discord), images [{url, w, h}],
videos [{kind: youtube|gif|file, url, title, thumb}], link.
Запуск: python -I -B holonet_feed.py <config.json>   (config: token_env, token_key, channel_id, port, poll_sec)
Только стандартная библиотека Python.
"""
import json
import os
import re
import socket
import sys
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

API = "https://discord.com/api/v10"
HERE = os.path.dirname(os.path.abspath(__file__))
ARGS = [a for a in sys.argv[1:] if not a.startswith("--")]
CFG = json.load(open(ARGS[0] if ARGS else os.path.join(HERE, "config.json"), encoding="utf-8-sig"))
CHANNEL = str(CFG["channel_id"])
PORT = int(CFG.get("port", 8795))
POLL_SEC = max(60, int(CFG.get("poll_sec", 120)))
GROUP_SEC = 600          # картинки, присланные автором в течение 10 минут после текста, - часть того же поста
MAX_POSTS = 60
CACHE = os.path.join(HERE, "holonet_cache.json")
LOG = os.path.join(HERE, "holonet_feed.log")

state = {"posts": [], "channel": "", "guild": "", "updatedAt": 0, "error": ""}
lock = threading.Lock()
names = {"roles": {}, "channels": {}, "at": 0}


def log(msg):
    line = time.strftime("%Y-%m-%d %H:%M:%S ") + msg
    try:
        with open(LOG, "a", encoding="utf-8") as f:
            f.write(line + "\n")
        if os.path.getsize(LOG) > 2_000_000:
            os.replace(LOG, LOG + ".1")
    except OSError:
        pass


def read_token():
    env = {}
    with open(CFG["token_env"], encoding="utf-8-sig") as f:
        for line in f:
            m = re.match(r"\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$", line)
            if m:
                env[m.group(1)] = m.group(2).strip("\"'")
    tok = env.get(CFG.get("token_key", "DISCORD_BOT_TOKEN"), "")
    if not tok:
        raise SystemExit("нет токена в " + CFG["token_env"])
    return tok


TOKEN = read_token()


def api(path):
    req = urllib.request.Request(API + path, headers={"Authorization": "Bot " + TOKEN,
                                                      "User-Agent": "DiscordBot (phoenix-holonet-feed, 1.0)"})
    for _ in range(3):
        try:
            with urllib.request.urlopen(req, timeout=25) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            if e.code == 429:
                time.sleep(min(30, float(e.headers.get("Retry-After") or 5)))
                continue
            raise
    raise RuntimeError("rate limit")


def refresh_names(guild):
    if not guild or time.time() - names["at"] < 3600:
        return
    try:
        names["roles"] = {r["id"]: r["name"] for r in api("/guilds/%s/roles" % guild)}
        names["channels"] = {c["id"]: c["name"] for c in api("/guilds/%s/channels" % guild)}
        names["at"] = time.time()
    except Exception as e:  # нет прав на список - упоминания останутся общими
        log("names: %r" % e)
        names["at"] = time.time()


def display(user):
    return user.get("global_name") or user.get("username") or "HoloNet"


def avatar(user):
    if user.get("avatar"):
        return "https://cdn.discordapp.com/avatars/%s/%s.png?size=64" % (user["id"], user["avatar"])
    return ""


def resolve(text, msg):
    users = {u["id"]: display(u) for u in msg.get("mentions", [])}
    text = re.sub(r"<@&(\d+)>", lambda m: "@" + names["roles"].get(m.group(1), "роль"), text)
    text = re.sub(r"<@!?(\d+)>", lambda m: "@" + users.get(m.group(1), "участник"), text)
    text = re.sub(r"<#(\d+)>", lambda m: "#" + names["channels"].get(m.group(1), "канал"), text)
    text = re.sub(r"<t:(\d+)(?::\w)?>", lambda m: time.strftime("%d.%m.%Y %H:%M", time.localtime(int(m.group(1)))), text)
    return text


PING_RE = r"\|\||@here|@everyone|<@[&!]?\d+>"


def only_ping(text):
    """Сообщение только из пингов (||@here||, @everyone, роли) - в ленту не идёт."""
    return not re.sub(PING_RE, "", text or "").strip()


def strip_ping_lines(text):
    """Строки только из пингов (обычно первая строка «@Игрок Phoenix») в тексте поста не нужны."""
    return "\n".join(l for l in (text or "").splitlines() if not (l.strip() and only_ping(l))).strip()


def youtube_id(url):
    m = re.search(r"(?:youtu\.be/|youtube\.com/(?:watch\?v=|embed/|shorts/))([\w-]{11})", url or "")
    return m.group(1) if m else ""


def proxy(img, width=1280):
    url = img.get("proxy_url") or img.get("url") or ""
    w = img.get("width") or 0
    # media.discordapp.net уменьшает картинку сам - лаунчеру не нужны 2-мегабайтные PNG
    if url and w > width and "media.discordapp.net" in url:
        url += ("&" if "?" in url else "?") + "width=%d&height=%d" % (width, round((img.get("height") or 0) * width / w))
    return url


def media(msg):
    imgs, vids, links = [], [], set()
    for a in msg.get("attachments", []):
        ctype = a.get("content_type") or ""
        if ctype.startswith("image/"):
            imgs.append({"url": proxy(a), "w": a.get("width"), "h": a.get("height")})
        elif ctype.startswith("video/"):
            vids.append({"kind": "file", "url": a["url"], "type": ctype})
    for e in msg.get("embeds", []):
        thumb = e.get("thumbnail") or {}
        yt = youtube_id(e.get("url"))
        if yt:
            vids.append({"kind": "youtube", "url": "https://www.youtube.com/watch?v=" + yt, "title": e.get("title", ""),
                         "thumb": proxy(thumb, 960)})
            links.add(e.get("url", ""))
        elif e.get("type") == "gifv" and (e.get("video") or {}).get("url"):
            v = e["video"]
            vids.append({"kind": "gif", "url": v.get("proxy_url") or v["url"], "thumb": proxy(thumb, 960)})
            links.add(e.get("url", ""))
        else:
            img = e.get("image") or thumb
            if img.get("proxy_url") or img.get("url"):
                imgs.append({"url": proxy(img), "w": img.get("width"), "h": img.get("height")})
                if e.get("type") == "image":
                    links.add(e.get("url", ""))
    return imgs, vids, links


def embed_text(msg):
    parts = []
    for e in msg.get("embeds", []):
        if e.get("type") in ("image", "gifv", "video") or youtube_id(e.get("url")):
            continue
        if e.get("title"):
            parts.append("## " + e["title"])
        if e.get("description"):
            parts.append(e["description"])
        for f in e.get("fields", []):
            parts.append("**%s**\n%s" % (f.get("name", ""), f.get("value", "")))
    return "\n\n".join(parts)


def clean_line(line):
    s = re.sub(PING_RE, "", line).strip()
    if not s or s.startswith("```") or re.fullmatch(r"[━─═_\-–—=~|\s*#`]+", s):
        return "", False
    styled = bool(re.match(r"^(#{1,3}\s|\*\*|__|⚠|📰|📡)", s))
    s = re.sub(r"^#{1,3}\s*", "", s)
    s = re.sub(r"\*\*|__|~~|`|^\*|\*$", "", s).strip(" *_")
    return re.sub(r"\s{2,}", " ", s)[:160], styled


def headline(raw):
    """(kicker, title): первая строка - рубрика, если вторая короткая и выделена (жирным/заголовком), иначе заголовок."""
    lines = []
    for line in raw.splitlines():
        s, styled = clean_line(line)
        if s:
            lines.append((s, styled))
        if len(lines) == 2:
            break
    if not lines:
        return "", ""
    if len(lines) == 2 and lines[1][1] and len(lines[1][0]) <= 160 and len(lines[0][0]) <= 90:
        return lines[0][0], lines[1][0]
    return "", lines[0][0]


def build(messages, guild):
    msgs = sorted(messages, key=lambda m: int(m["id"]))
    posts = []
    for m in msgs:
        if m.get("type") not in (0, 19):
            continue
        raw = (m.get("content") or "").strip()
        imgs, vids, links = media(m)
        for u in links:  # ссылка, вместо которой показан ролик/картинка
            raw = raw.replace(u, "").strip()
        etext = embed_text(m)
        if etext:
            raw = (raw + "\n\n" + etext).strip()
        raw = strip_ping_lines(raw)
        if not raw and not imgs and not vids:
            continue
        ts = m["timestamp"]
        t = time.mktime(time.strptime(ts[:19], "%Y-%m-%dT%H:%M:%S"))
        last = posts[-1] if posts else None
        # продолжение поста: тот же автор дописал следом (длинная статья в нескольких сообщениях, картинки, ролик)
        if last and last["_author"] == m["author"]["id"] and (t - last["_t"] <= 180 or (not raw and t - last["_t"] <= GROUP_SEC)):
            if raw:
                last["_raw"].append(raw)
                last["_text"].append(resolve(raw, m))
            last["images"] += imgs
            last["videos"] += vids
            last["_t"] = t
            continue
        posts.append({
            "id": m["id"], "ts": ts, "author": display(m["author"]), "avatar": avatar(m["author"]),
            "images": imgs, "videos": vids,
            "link": "https://discord.com/channels/%s/%s/%s" % (guild, CHANNEL, m["id"]),
            "_author": m["author"]["id"], "_t": t, "_raw": [raw] if raw else [], "_text": [resolve(raw, m)] if raw else [],
        })
    out = []
    for p in reversed(posts):
        kicker, title = headline("\n".join(p["_raw"]))
        if not title:
            title = next((v.get("title") for v in p["videos"] if v.get("title")), "") or "HoloNet"
        p.update(kicker=kicker, title=title, text="\n\n".join(p["_text"]))
        out.append({k: v for k, v in p.items() if not k.startswith("_")})
    return out[:MAX_POSTS]


def poll_once():
    ch = api("/channels/" + CHANNEL)
    guild = ch.get("guild_id", "")
    refresh_names(guild)
    messages, before = [], None
    for _ in range(2):  # до 200 сообщений: картинки идут отдельными сообщениями
        q = "/channels/%s/messages?limit=100" % CHANNEL + ("&before=" + before if before else "")
        batch = api(q)
        messages += batch
        if len(batch) < 100:
            break
        before = batch[-1]["id"]
    posts = build(messages, guild)
    with lock:
        state.update(posts=posts, channel=ch.get("name", ""), guild=guild, updatedAt=int(time.time()), error="")
    try:
        with open(CACHE + ".tmp", "w", encoding="utf-8") as f:
            json.dump(state, f, ensure_ascii=False)
        os.replace(CACHE + ".tmp", CACHE)
    except OSError:
        pass


def poller():
    while True:
        try:
            poll_once()
        except Exception as e:
            with lock:
                state["error"] = str(e)[:200]
            log("poll: %r" % e)
        time.sleep(POLL_SEC)


hits = {}


def rate_ok(ip):
    now = int(time.time() // 60)
    k = (ip, now)
    hits[k] = hits.get(k, 0) + 1
    if len(hits) > 5000:
        for old in [x for x in hits if x[1] < now]:
            hits.pop(old, None)
    return hits[k] <= 30


class Handler(BaseHTTPRequestHandler):
    server_version = "phx_holonet/1"

    def log_message(self, fmt, *args):
        pass

    def reply(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if not rate_ok(self.client_address[0]):
            return self.reply(429, {"ok": False, "error": "rate"})
        u = urlparse(self.path)
        if u.path == "/health":
            return self.reply(200, {"ok": True})
        if u.path == "/api/holonet":
            try:
                limit = max(1, min(MAX_POSTS, int((parse_qs(u.query).get("limit") or ["30"])[0])))
            except ValueError:
                limit = 30
            with lock:
                return self.reply(200, {"ok": True, "channel": state["channel"], "updatedAt": state["updatedAt"],
                                        "error": state["error"], "posts": state["posts"][:limit]})
        return self.reply(404, {"ok": False, "error": "path"})


class Server(ThreadingHTTPServer):
    # Windows: без SO_EXCLUSIVEADDRUSE второй экземпляр тоже займёт порт, и запросы уйдут случайной копии
    allow_reuse_address = os.name != "nt"
    daemon_threads = True

    def server_bind(self):
        if hasattr(socket, "SO_EXCLUSIVEADDRUSE"):
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()


def main():
    if "--once" in sys.argv:  # проверка: один опрос, сводка в stdout
        poll_once()
        for p in state["posts"]:
            print(p["ts"][:16], p["author"][:12], "|", p["kicker"][:40], "|", p["title"][:60], "| img", len(p["images"]), "vid", [v["kind"] for v in p["videos"]], "len", len(p["text"]))
        print(len(state["posts"]), "posts, channel", state["channel"])
        return
    if os.path.exists(CACHE):
        try:
            with open(CACHE, encoding="utf-8") as f:
                state.update(json.load(f))
        except (OSError, ValueError):
            pass
    threading.Thread(target=poller, daemon=True).start()
    srv = Server(("0.0.0.0", PORT), Handler)
    log("start port %d channel %s" % (PORT, CHANNEL))
    srv.serve_forever()


if __name__ == "__main__":
    main()
