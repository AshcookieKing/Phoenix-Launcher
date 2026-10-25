// Адреса систем Phoenix: серверы, бот (Discord OAuth), phx_roleapi (роли меню), сайт подготовки клона
const PHX_HOST = '109.248.4.45';

module.exports = {
  PHX_HOST,
  SERVERS: [
    {
      id: 'farabad',
      name: 'Фарабад',
      tag: 'ФРОНТ',
      subtitle: 'Война с КНС · ALiVE · опорники и щиты',
      host: PHX_HOST,
      port: 2302,
      queryPort: 2303,
    },
    {
      id: 'kamino',
      name: 'Камино',
      tag: 'УЧЕБНЫЙ ХАБ',
      subtitle: 'Обучение клонов · симуляции · рекорды',
      host: PHX_HOST,
      port: 2402,
      queryPort: 2403,
    },
  ],
  BOT_API: `http://${PHX_HOST}:5003`,
  ROLE_API: `http://${PHX_HOST}:8792`,
  MENU_LOGIN_URL: `http://${PHX_HOST}:5003/phx/menu/login?code=`,
  // Общая галактика (HoloNet) и живые карты серверов Arma (map_api, server_id из rim_maplive)
  GALAXY_API: `http://${PHX_HOST}:3005`,
  MAP_API: `http://${PHX_HOST}:5050`,
  BATTLE_MAPS: [
    { serverId: 2, planet: 'Рилот', title: 'Фарабад', map: 'farabad' },
    { serverId: 3, planet: 'Камино', title: 'Камино', map: 'kamino' },
  ],
  LINKS: {
    discord: 'https://discord.gg/5FgEANx7Yu',
    // TeamSpeak Phoenix (TFAR): клиент TS3 открывается сразу на сервере
    teamspeak: 'ts3server://phoenixrparma3.ts3.so',
    teamspeakHost: 'phoenixrparma3.ts3.so',
    progression: `http://${PHX_HOST}:8090/`,
    galaxy: `http://${PHX_HOST}:3005/`,
    battleMap: `http://${PHX_HOST}:5050/view`,
    workshopMod: 'https://steamcommunity.com/sharedfiles/filedetails/?id=3821631465',
  },
};
