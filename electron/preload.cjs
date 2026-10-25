const { contextBridge, ipcRenderer } = require('electron');

function on(channel, cb) {
  const handler = (_, payload) => cb(payload);
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('phoenix', {
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (next) => ipcRenderer.invoke('save-settings', next),
  getServers: () => ipcRenderer.invoke('get-servers'),
  refreshServers: () => ipcRenderer.invoke('refresh-servers'),
  getMods: () => ipcRenderer.invoke('get-mods'),
  checkMods: (opts) => ipcRenderer.invoke('check-mods', opts),
  syncMods: (ids) => ipcRenderer.invoke('sync-mods', ids),
  launch: (opts) => ipcRenderer.invoke('launch', opts),
  getAccount: (opts) => ipcRenderer.invoke('get-account', opts),
  menuPairStart: () => ipcRenderer.invoke('menu-pair-start'),
  menuPairCancel: () => ipcRenderer.invoke('menu-pair-cancel'),
  menuLogout: () => ipcRenderer.invoke('menu-logout'),
  openUrl: (url) => ipcRenderer.invoke('open-url', url),
  tsConnect: () => ipcRenderer.invoke('ts-connect'),
  getGalaxy: () => ipcRenderer.invoke('get-galaxy'),
  openFolder: (p) => ipcRenderer.invoke('open-folder', p),
  autoDetectPaths: () => ipcRenderer.invoke('auto-detect-paths'),
  pickArmaExe: () => ipcRenderer.invoke('pick-arma-exe'),
  pickWorkshopFolder: () => ipcRenderer.invoke('pick-workshop-folder'),
  pickPresetFile: () => ipcRenderer.invoke('pick-preset-file'),
  resetPreset: () => ipcRenderer.invoke('reset-preset'),
  minimize: () => ipcRenderer.send('window-minimize'),
  close: () => ipcRenderer.send('window-close'),
  onServers: (cb) => on('servers-update', cb),
  onLaunchProgress: (cb) => on('launch-progress', cb),
  onLaunchRunning: (cb) => on('launch-running', cb),
  onLaunchReset: (cb) => on('launch-reset', cb),
  onAccount: (cb) => on('account-update', cb),
  onPairStatus: (cb) => on('pair-status', cb),
});
