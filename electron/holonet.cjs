// HoloNet: лента канала «holonet» Discord Phoenix. Канал читает бот «Phoenix | Online Bot» на хосте (.239,
// host\holonet_feed.py) - в лаунчере токена бота нет. Последняя лента хранится в настройках - видна и без сети.
const http = require('http');
const { HOLONET_API } = require('./phx-config.cjs');

function fetchFeed(limit = 40, timeout = 10000) {
  return new Promise((resolve) => {
    const req = http.get(`${HOLONET_API}?limit=${limit}`, { timeout }, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(res.statusCode === 200 && json.ok ? json : null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
  });
}

function createHoloNet(store, onUpdate) {
  let feed = store.get('holonetCache') || null;
  let timer = null;

  async function refresh() {
    const fresh = await fetchFeed();
    if (fresh && Array.isArray(fresh.posts)) {
      const changed = !feed || feed.posts?.[0]?.id !== fresh.posts[0]?.id || feed.posts?.length !== fresh.posts.length;
      feed = { channel: fresh.channel, updatedAt: fresh.updatedAt, posts: fresh.posts, fetchedAt: Date.now() };
      store.set('holonetCache', feed);
      if (changed) onUpdate?.(feed);
      return { ...feed, online: true };
    }
    return feed ? { ...feed, online: false } : { posts: [], online: false };
  }

  return {
    get: () => (feed ? { ...feed, online: Date.now() - (feed.fetchedAt || 0) < 15 * 60000 } : null),
    refresh,
    start(intervalMs = 5 * 60000) {
      refresh().then((f) => onUpdate?.(f));
      timer = setInterval(refresh, intervalMs);
    },
    stop() {
      if (timer) clearInterval(timer);
    },
  };
}

module.exports = { createHoloNet, fetchFeed };
