// Только для `vite` в браузере: заглушка window.phoenix (в сборку Electron не попадает)
const servers = {
  farabad: { status: 'online', ping: 49, name: '[RU] PHOENIX | STAR WARS RP', map: 'Farabad', players: 37, maxPlayers: 92, players_list: [] },
  kamino: { status: 'online', ping: 51, name: '[RU] PHOENIX | KAMINO', map: 'Kamino', players: 6, maxPlayers: 40 },
};
const mods = [
  'Phoenix Technical Mod 2.0', 'Legion Studios Core - Stable', '3AS (Beta Test)', 'ace', 'ALiVE', 'CBA_A3',
  'Global Ops Terrains', 'JM\'s LLTE v3.9', 'KAT - Advanced Medical', 'Phoenix Uniform Pack',
].map((name, i) => ({
  name,
  workshopId: String(3821631465 - i * 7919),
  steamUrl: '#',
  status: i === 4 ? 'missing' : i === 7 ? 'outdated' : 'ok',
  path: i === 4 ? null : 'C:/Steam/workshop/' + i,
}));
const settings = {
  armaExe: 'D:/SteamLibrary/steamapps/common/Arma 3/arma3_x64.exe',
  workshopDir: 'D:/SteamLibrary/steamapps/workshop/content/107410',
  screenMode: 'borderless', optimizedLaunch: false, profilingLaunch: true, profilingInstalled: false, tsAutoConnect: false, performancePreset: 'high', extraLaunchArgs: '', skipLogos: false,
  activeProfileId: '', soundsEnabled: true, minimizeOnLaunch: true, animationsEnabled: true,
  appVersion: '1.0.0', presetPath: 'preset/phoenix_preset.html', customPreset: false, modCount: 35,
  paths: { armaExe: 'D:/SteamLibrary/steamapps/common/Arma 3/arma3_x64.exe', workshopDir: 'D:/SteamLibrary/steamapps/workshop/content/107410', pathsValid: true },
  pathsValid: new URLSearchParams(location.search).get('nopath') ? false : true, pathErrors: [],
  profiles: [{ id: 'Rex', displayName: 'CT-7567 Rex' }],
  servers: [
    { id: 'farabad', name: 'Фарабад', tag: 'ФРОНТ', subtitle: 'Война с КНС · ALiVE · опорники и щиты', host: '109.248.4.45', port: 2302 },
    { id: 'kamino', name: 'Камино', tag: 'УЧЕБНЫЙ ХАБ', subtitle: 'Обучение клонов · симуляции · рекорды', host: '109.248.4.45', port: 2402 },
  ],
  links: { discord: '#', teamspeak: '#', teamspeakHost: '51.83.138.244:8465', progression: '#', workshopMod: '#' },
};
const linked = !new URLSearchParams(location.search).get('unlinked');
const account = {
  steam: { steamId: '76561198000000001', personaName: 'Ima Gun Di' },
  roles: { ok: true, linked, pending: false, rank: linked ? 'CPL' : '', battalion: linked ? '212' : '', recruit: false,
    roles: { bso: 0, jedi: 0, mercenary: 1, slot3: 0, arc: 1, rc: 0 } },
};

// HoloNet и персонажи для превью (вымышленные тексты, локальные картинки)
const now = Date.now();
const hnPost = (i, kicker, title, text, img) => ({
  id: String(1000 + i), ts: new Date(now - i * 86400000 * 1.7 - 3600000).toISOString(), author: ['Бука', 'ZLOY', 'Lig Ness', 'Hog'][i % 4], avatar: '',
  kicker, title, text, images: img ? [{ url: img, w: 2000, h: 752 }] : [], videos: i === 2 ? [{ kind: 'youtube', url: '#', title: 'Обращение генерала', thumb: './assets/background.jpg' }] : [], link: '#',
});
const holonet = {
  channel: 'holonet', updatedAt: Math.floor(now / 1000) - 300, online: true,
  posts: [
    hnPost(0, '📰 ПЛАНЕТАРНЫЕ НОВОСТИ | ПРАВДА КХАРИСА', 'Нападение на корабли ВАР', '# 📰 ПЛАНЕТАРНЫЕ НОВОСТИ | ПРАВДА КХАРИСА\n\n**Нападение на корабли ВАР**\n\nВ ходе операции ВАР на планете Кхарис разведчики выявили скопление частных военных. Республика не успела реализовать разведданные из-за атаки наёмников на *венатор*. В ходе боестолкновения корабль был незначительно повреждён.\n\n━━━━━━━━━━━━━━━━━━━━\n## Что известно\n- Потери уточняются\n- Флот поднят по тревоге\n\n> Цитата офицера флота: «Необходимо установить режим усиленной безопасности»\n\n```diff\n+ Венатор на орбите\n- Связь с южным сектором потеряна\n```\n||Спойлер: это была проверка||', './assets/background.jpg'),
    hnPost(1, '', '📡 ПЛАНЕТАРНОЕ ВЕЩАНИЕ // НОВОСТНОЙ ВЫПУСК', 'Всем снова привет! С вами планетарный репортёр, и сегодня у нас новости, от которых волосы дыбом.', ''),
    hnPost(2, 'HoloNet News — Экстренный выпуск', '«Операция „Разлом“ завершена: первая крупная победа на Кхарисе»', 'Теперь этой цитадели больше нет. После прорыва периметра республиканские части вошли в город.', './assets/background.jpg'),
    hnPost(3, 'Гарки', 'Информативная сводка для 13-го корпуса', 'Корпус вышел к северному очагу мятежа.', ''),
    hnPost(4, '', 'Новости: Преступный картель ликвидирован', 'Сегодня утром правоохранительные органы провели масштабную операцию.', './assets/background.jpg'),
  ],
};
const characters = {
  ok: true, profile: '[212] CT 3472 IMA', updatedAt: now - 7200000, kitClass: '',
  chars: new URLSearchParams(location.search).get('nochars') ? [] : [
    { slot: 1, id: 'a', name: '[212] CT 3472 Ima', kind: 'cadet', kindLabel: 'Клон ВАР', rank: 'CT', claimPending: false, cloneNumber: '212-3472', battalion: '212', status: 'active', profile: '[212] CT 3472 Ima', profileId: 'x' },
    { slot: 2, id: 'b', name: 'Рекс Вандар', kind: 'mercenary', kindLabel: 'Наёмник', rank: 'CPL', claimPending: true, cloneNumber: '', battalion: '', status: 'active', profile: '', profileId: '' },
  ],
};
const noop = () => () => {};
window.phoenix = {
  getSettings: async () => settings,
  saveSettings: async (p) => Object.assign(settings, p),
  getServers: async () => servers,
  refreshServers: async () => servers,
  getMods: async () => mods,
  checkMods: async () => mods,
  syncMods: async () => ({ ok: true }),
  launch: async () => ({ ok: false, error: 'Заглушка браузера: запуск только в лаунчере' }),
  launchCancel: async () => ({ ok: true }),
  syncModsCancel: async () => ({ ok: true }),
  onModsSync: () => () => {},
  getCharacters: async () => characters,
  getHoloNet: async () => holonet,
  onHoloNet: () => () => {},
  getAccount: async () => account,
  menuPairStart: async () => ({ ok: true, code: 'K7M2QX', url: '#' }),
  menuPairCancel: async () => ({ ok: true }),
  menuLogout: async () => ({ ok: false, noToken: true }),
  tsConnect: async () => ({ ok: true }),
  getUpdateStatus: async () => ({ state: 'ready', current: '1.2.0', latest: 'v1.2.1', percent: 100 }),
  checkUpdate: async () => ({ state: 'none' }),
  installUpdate: async () => ({ ok: false }),
  onUpdateStatus: () => () => {},
  openUrl: async () => {}, openFolder: async () => {},
  autoDetectPaths: async () => ({ success: false, errors: ['Не найдено'] }),
  pickArmaExe: async () => ({ canceled: true }), pickWorkshopFolder: async () => ({ canceled: true }),
  pickPresetFile: async () => ({ canceled: true }), resetPreset: async () => ({ success: true, settings }),
  minimize() {}, close() {},
  onServers: noop, onLaunchProgress: noop, onLaunchRunning: noop, onLaunchReset: noop, onAccount: noop, onPairStatus: noop,
};
