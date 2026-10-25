// Галактика Phoenix для вкладки «Галактика»: сводка общей кампании, HoloNet и статус серверов Arma (живая карта)
const { request } = require('./phx-api.cjs');
const { GALAXY_API, MAP_API, BATTLE_MAPS } = require('./phx-config.cjs');

async function getGalaxy() {
  const [view, holonet, ...summaries] = await Promise.all([
    request(`${GALAXY_API}/api/galaxy/view`, { timeout: 8000 }),
    request(`${GALAXY_API}/api/galaxy/holonet`, { timeout: 8000 }),
    ...BATTLE_MAPS.map((b) => request(`${MAP_API}/api/map/summary?server_id=${b.serverId}`, { timeout: 6000 })),
  ]);
  if (view.status !== 200 || !view.data?.planets) {
    return { ok: false, error: 'Сервер галактики недоступен' };
  }
  return {
    ok: true,
    view: view.data,
    holonet: holonet.status === 200 ? holonet.data : null,
    battles: BATTLE_MAPS.map((b, i) => ({
      ...b,
      url: `${MAP_API}/view?server_id=${b.serverId}&map=${b.map}`,
      summary: summaries[i].status === 200 ? summaries[i].data : null,
    })),
  };
}

module.exports = { getGalaxy };
