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
  LINKS: {
    discord: 'https://discord.gg/5FgEANx7Yu',
    progression: `http://${PHX_HOST}:8090/`,
    workshopMod: 'https://steamcommunity.com/sharedfiles/filedetails/?id=3821631465',
  },
};
