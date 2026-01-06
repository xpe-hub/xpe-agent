const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Token management
  setToken: (token) => ipcRenderer.invoke('set-token', token),
  getConfig: () => ipcRenderer.invoke('get-config'),
  
  // User information
  getUserInfo: () => ipcRenderer.invoke('get-user-info'),
  
  // Repository information
  getRepoInfo: (data) => ipcRenderer.invoke('get-repo-info', data),
  
  // Release management
  createRelease: (data) => ipcRenderer.invoke('create-release', data),
  listReleases: (data) => ipcRenderer.invoke('list-releases', data),
  deleteRelease: (data) => ipcRenderer.invoke('delete-release', data),
  
  // File operations
  selectFile: () => ipcRenderer.invoke('select-file'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  
  // External links
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  
  // Navigation
  send: (channel, data) => ipcRenderer.send(channel, data),
  on: (channel, func) => {
    ipcRenderer.on(channel, (event, ...args) => func(...args));
  }
});
