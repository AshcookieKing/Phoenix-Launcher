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
  screenMode: 'borderless', optimizedLaunch: false, performancePreset: 'high', extraLaunchArgs: '', skipLogos: false,
  activeProfileId: '', soundsEnabled: true, minimizeOnLaunch: true, animationsEnabled: true,
  appVersion: '1.0.0', presetPath: 'preset/phoenix_preset.html', customPreset: false, modCount: 35,
  paths: { armaExe: 'D:/SteamLibrary/steamapps/common/Arma 3/arma3_x64.exe', workshopDir: 'D:/SteamLibrary/steamapps/workshop/content/107410', pathsValid: true },
  pathsValid: new URLSearchParams(location.search).get('nopath') ? false : true, pathErrors: [],
  profiles: [{ id: 'Rex', displayName: 'CT-7567 Rex' }],
  servers: [
    { id: 'farabad', name: 'Фарабад', tag: 'ФРОНТ', subtitle: 'Война с КНС · ALiVE · опорники и щиты', host: '109.248.4.45', port: 2302 },
    { id: 'kamino', name: 'Камино', tag: 'УЧЕБНЫЙ ХАБ', subtitle: 'Обучение клонов · симуляции · рекорды', host: '109.248.4.45', port: 2402 },
  ],
  links: { discord: '#', progression: '#', workshopMod: '#' },
};
const linked = !new URLSearchParams(location.search).get('unlinked');
const account = {
  steam: { steamId: '76561198000000001', personaName: 'Ima Gun Di' },
  roles: { ok: true, linked, pending: false, rank: linked ? 'CPL' : '', battalion: linked ? '212' : '', recruit: false,
    roles: { bso: 0, jedi: 0, mercenary: 1, slot3: 0, arc: 1, rc: 0 } },
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
  getAccount: async () => account,
  menuPairStart: async () => ({ ok: true, code: 'K7M2QX', url: '#' }),
  menuPairCancel: async () => ({ ok: true }),
  menuLogout: async () => ({ ok: false, noToken: true }),
  openUrl: async () => {}, openFolder: async () => {},
  autoDetectPaths: async () => ({ success: false, errors: ['Не найдено'] }),
  pickArmaExe: async () => ({ canceled: true }), pickWorkshopFolder: async () => ({ canceled: true }),
  pickPresetFile: async () => ({ canceled: true }), resetPreset: async () => ({ success: true, settings }),
  minimize() {}, close() {},
  onServers: noop, onLaunchProgress: noop, onLaunchRunning: noop, onLaunchReset: noop, onAccount: noop, onPairStatus: noop,
};
