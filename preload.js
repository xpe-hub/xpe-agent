const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Configuration
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  getConfig: () => ipcRenderer.invoke('get-config'),
  
  // User Information
  getUserInfo: () => ipcRenderer.invoke('get-user-info'),
  
  // Repository Management
  createRepo: (data) => ipcRenderer.invoke('create-repo', data),
  getRepoInfo: (data) => ipcRenderer.invoke('get-repo-info', data),
  
  // File Operations
  createFile: (data) => ipcRenderer.invoke('create-file', data),
  createMultipleFiles: (data) => ipcRenderer.invoke('create-multiple-files', data),
  
  // GitHub Actions
  triggerWorkflow: (data) => ipcRenderer.invoke('trigger-workflow', data),
  getWorkflowRuns: (data) => ipcRenderer.invoke('get-workflow-runs', data),
  getWorkflowRunStatus: (data) => ipcRenderer.invoke('get-workflow-run-status', data),
  getWorkflowLogs: (data) => ipcRenderer.invoke('get-workflow-logs', data),
  
  // Artifacts
  getArtifacts: (data) => ipcRenderer.invoke('get-artifacts', data),
  downloadArtifact: (data) => ipcRenderer.invoke('download-artifact', data),
  
  // Releases
  createReleaseWithAsset: (data) => ipcRenderer.invoke('create-release-with-asset', data),
  listReleases: (data) => ipcRenderer.invoke('list-releases', data),
  
  // AI Chat
  aiChat: (data) => ipcRenderer.invoke('ai-chat', data),
  aiChatStream: (data) => ipcRenderer.invoke('ai-chat-stream', data),
  aiClearHistory: () => ipcRenderer.invoke('ai-clear-history'),
  
  // Templates
  getWorkflowTemplates: () => ipcRenderer.invoke('get-workflow-templates'),
  
  // File Dialogs
  selectFile: () => ipcRenderer.invoke('select-file'),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  saveFileDialog: (data) => ipcRenderer.invoke('save-file-dialog', data),
  
  // Notifications & External
  showNotification: (data) => ipcRenderer.invoke('show-notification', data),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  
  // Navigation & Actions
  send: (channel, data) => ipcRenderer.send(channel, data),
  on: (channel, func) => {
    ipcRenderer.on(channel, (event, ...args) => func(...args));
  }
});
