// Персонажи меню Phoenix из профилей Arma: profileNamespace (*.vars.Arma3Profile) хранит PHXT_offlineChars -
// слоты [номер, [[ключ, значение]...]]. Меню переносит персонажей между профилями, поэтому берём самый свежий
// сохранённый профиль, где они есть. PHXT_charProfiles - id персонажа -> профиль Arma с его именем.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { readProfileVars } = require('./rap.cjs');
const { decodeProfileName } = require('./arma-profiles.cjs');

const VARS = ['phxt_offlinechars', 'phxt_offlineactive', 'phxt_charprofiles', 'phx_kitclass', 'phxt_characterlooks'];

function profileVarsFiles() {
  const docs = path.join(os.homedir(), 'Documents');
  const out = [];
  const other = path.join(docs, 'Arma 3 - Other Profiles');
  try {
    for (const d of fs.readdirSync(other, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const f = path.join(other, d.name, `${d.name}.vars.Arma3Profile`);
      if (fs.existsSync(f)) out.push({ file: f, folder: d.name, profile: decodeProfileName(d.name) });
    }
  } catch {}
  // профиль по умолчанию: Documents\Arma 3\<имя>.vars.Arma3Profile
  try {
    const main = path.join(docs, 'Arma 3');
    for (const f of fs.readdirSync(main)) {
      if (f.endsWith('.vars.Arma3Profile')) {
        const name = f.slice(0, -'.vars.Arma3Profile'.length);
        out.push({ file: path.join(main, f), folder: '', profile: decodeProfileName(name) });
      }
    }
  } catch {}
  for (const o of out) {
    try {
      o.mtime = fs.statSync(o.file).mtimeMs;
    } catch {
      o.mtime = 0;
    }
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}

const KIND = {
  cadet: 'Клон ВАР',
  mercenary: 'Наёмник',
  jedi: 'Джедай',
  bso: 'БСО',
};

function battalionOf(name) {
  const m = String(name || '').match(/^\s*\[([^\]]{1,8})\]/);
  return m ? m[1] : '';
}

let cache = { key: '', result: null };

function readCharacters() {
  const files = profileVarsFiles();
  const key = files.map((f) => `${f.file}:${f.mtime}`).join('|');
  if (cache.key === key && cache.result) return cache.result;

  let result = { ok: true, chars: [], profile: '', updatedAt: 0, kitClass: '' };
  for (const f of files) {
    let buf;
    try {
      buf = fs.readFileSync(f.file);
    } catch {
      continue;
    }
    // быстрый отсев: имена переменных профиля хранятся в нижнем регистре
    if (!buf.includes('phxt_offlinechars')) continue;
    let vars;
    try {
      vars = readProfileVars(buf, VARS);
    } catch {
      continue;
    }
    const raw = vars.get('phxt_offlinechars');
    if (!Array.isArray(raw) || !raw.length) continue;
    const charProfiles = vars.get('phxt_charprofiles') || {};
    const looks = vars.get('phxt_characterlooks') || {};
    const kit = vars.get('phx_kitclass');
    const active = Number(vars.get('phxt_offlineactive') ?? -1);
    const chars = [];
    for (const entry of raw) {
      if (!Array.isArray(entry) || entry.length !== 2 || !Array.isArray(entry[1])) continue;
      const kv = {};
      for (const pair of entry[1]) if (Array.isArray(pair) && pair.length === 2) kv[pair[0]] = pair[1];
      const kind = KIND[kv.kind] ? kv.kind : 'cadet';
      const id = String(kv.id || '');
      chars.push({
        slot: Number(entry[0]),
        id,
        name: String(kv.name || ''),
        kind,
        kindLabel: kind === 'bso' && kv.bsoType ? `БСО · ${String(kv.bsoType).toUpperCase()}` : KIND[kind],
        rank: String(kv.claimRank ? kv.claimRank : kv.rank || ''),
        claimPending: kv.claimStatus === 'pending',
        cloneNumber: String(kv.cloneNumber || '').startsWith('#claim') ? '' : String(kv.cloneNumber || ''),
        battalion: battalionOf(kv.name),
        status: String(kv.status || 'active'),
        profile: String(charProfiles[id] || ''),
        hasLook: Boolean(looks[id]),
        active: Number(entry[0]) === active,
      });
    }
    chars.sort((a, b) => a.slot - b.slot);
    result = {
      ok: true,
      chars,
      profile: f.profile,
      updatedAt: f.mtime,
      kitClass: Array.isArray(kit) ? String(kit[1] || '') : '',
    };
    break;
  }
  cache = { key, result };
  return result;
}

module.exports = { readCharacters };
