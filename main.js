const { app, BrowserWindow, ipcMain, dialog, shell, Menu, Notification } = require('electron');
const { Octokit } = require('octokit');
const fs = require('fs');
const path = require('path');

let mainWindow;
let octokit = null;

// Configuration file path
const CONFIG_PATH = path.join(app.getPath('userData'), 'xpe-agent-config.json');

// Load configuration
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, 'utf8');
      const config = JSON.parse(data);
      return {
        githubToken: config.githubToken || '',
        groqApiKey: config.groqApiKey || '',
        minimaxApiKey: config.minimaxApiKey || '',
        defaultOwner: config.defaultOwner || 'xpe-hub',
        workDir: config.workDir || app.getPath('downloads'),
        cacheEnabled: config.cacheEnabled !== false,
        autoFallback: config.autoFallback !== false,
        preferredProvider: config.preferredProvider || 'minimax'
      };
    }
  } catch (error) {
    console.error('Error loading config:', error);
  }
  return { 
    githubToken: '', 
    groqApiKey: '', 
    minimaxApiKey: '',
    defaultOwner: 'xpe-hub',
    workDir: app.getPath('downloads'),
    cacheEnabled: true,
    autoFallback: true,
    preferredProvider: 'minimax'
  };
}

// Save configuration
function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Error saving config:', error);
  }
}

// Cache system for local responses
class LocalCache {
  constructor(cacheDir) {
    this.cacheDir = cacheDir;
    this.cacheFile = path.join(cacheDir, 'xpe-agent-cache.json');
    this.cache = this.loadCache();
  }

  loadCache() {
    try {
      if (fs.existsSync(this.cacheFile)) {
        return JSON.parse(fs.readFileSync(this.cacheFile, 'utf8'));
      }
    } catch (error) {
      console.error('Error loading cache:', error);
    }
    return { responses: {}, templates: {} };
  }

  saveCache() {
    try {
      fs.writeFileSync(this.cacheFile, JSON.stringify(this.cache, null, 2));
    } catch (error) {
      console.error('Error saving cache:', error);
    }
  }

  get(key) {
    const item = this.cache.responses[key];
    if (item) {
      // Check if expired (24 hours)
      if (Date.now() - item.timestamp < 24 * 60 * 60 * 1000) {
        return item.value;
      }
    }
    return null;
  }

  set(key, value) {
    this.cache.responses[key] = {
      value: value,
      timestamp: Date.now()
    };
    this.saveCache();
  }

  getTemplate(type) {
    return this.cache.templates[type] || null;
  }

  saveTemplate(type, template) {
    this.cache.templates[type] = template;
    this.saveCache();
  }
}

// MiniMax API Client
class MiniMaxClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.minimax.chat/v1';
    this.model = 'minimax-m2'; // Primary model
    this.modelStable = 'minimax-m2-stable';
    this.messages = [];
  }

  async chat(systemPrompt, userMessage, model = 'minimax-m2') {
    if (!this.apiKey) {
      throw new Error('MiniMax API key not configured');
    }

    this.messages.push({ role: 'user', content: userMessage });

    const payload = {
      model: model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...this.messages.slice(-20)
      ],
      temperature: 0.2,
      max_tokens: 8192,
      stream: false
    };

    return new Promise((resolve, reject) => {
      const data = JSON.stringify(payload);
      
      const options = {
        hostname: 'api.minimax.chat',
        path: '/v1/text/chatcompletion_v2',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': data.length
        }
      };

      const https = require('https');
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(body);
            if (response.base_resp && response.base_resp.status_code !== 0) {
              reject(new Error(response.base_resp.status_msg || 'MiniMax API error'));
            } else {
              const choices = response.choices || response.choices || [];
              const assistantMessage = choices[0]?.message?.content || '';
              this.messages.push({ role: 'assistant', content: assistantMessage });
              resolve(assistantMessage);
            }
          } catch (e) {
            reject(new Error('Failed to parse MiniMax response'));
          }
        });
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  clearHistory() {
    this.messages = [];
  }
}

// Groq API Client (fallback)
class GroqClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.model = 'llama-3.3-70b-versatile';
    this.messages = [];
  }

  async chat(systemPrompt, userMessage) {
    if (!this.apiKey) {
      throw new Error('Groq API key not configured');
    }

    this.messages.push({ role: 'user', content: userMessage });

    const payload = {
      model: this.model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...this.messages.slice(-20)
      ],
      temperature: 0.2,
      max_tokens: 8192,
      stream: false
    };

    return new Promise((resolve, reject) => {
      const data = JSON.stringify(payload);
      
      const options = {
        hostname: 'api.groq.com',
        path: '/openai/v1/chat/completions',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Content-Length': data.length
        }
      };

      const https = require('https');
      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(body);
            if (response.error) {
              reject(new Error(response.error.message));
            } else {
              const assistantMessage = response.choices[0].message.content;
              this.messages.push({ role: 'assistant', content: assistantMessage });
              resolve(assistantMessage);
            }
          } catch (e) {
            reject(new Error('Failed to parse Groq response'));
          }
        });
      });

      req.on('error', reject);
      req.write(data);
      req.end();
    });
  }

  clearHistory() {
    this.messages = [];
  }
}

// AI Provider Manager with Auto-Fallback
class AIProviderManager {
  constructor(config) {
    this.config = config;
    this.minimaxClient = config.minimaxApiKey ? new MiniMaxClient(config.minimaxApiKey) : null;
    this.groqClient = config.groqApiKey ? new GroqClient(config.groqApiKey) : null;
    this.cache = new LocalCache(config.workDir);
    this.lastProvider = null;
    this.lastError = null;
  }

  async chat(systemPrompt, userMessage) {
    const cacheKey = this.generateCacheKey(userMessage);
    
    // Check cache first
    if (this.config.cacheEnabled) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return { 
          success: true, 
          response: cached, 
          source: 'cache',
          provider: null
        };
      }
    }

    const providers = this.getProviderPriority();

    for (const provider of providers) {
      try {
        let response;
        
        if (provider === 'minimax-m2') {
          response = await this.minimaxClient.chat(systemPrompt, userMessage, 'minimax-m2');
        } else if (provider === 'minimax-m2-stable') {
          response = await this.minimaxClient.chat(systemPrompt, userMessage, 'minimax-m2-stable');
        } else if (provider === 'groq') {
          response = await this.groqClient.chat(systemPrompt, userMessage);
        }

        if (response) {
          this.lastProvider = provider;
          this.lastError = null;

          // Cache the response
          if (this.config.cacheEnabled) {
            this.cache.set(cacheKey, response);
          }

          return { 
            success: true, 
            response: response,
            source: 'api',
            provider: provider
          };
        }
      } catch (error) {
        console.error(`Provider ${provider} failed:`, error);
        continue;
      }
    }

    return { 
      success: false, 
      error: this.lastError || 'All providers failed',
      providers: providers 
    };
  }

  getProviderPriority() {
    const providers = [];
    
    // Priority based on config
    if (this.config.preferredProvider === 'minimax') {
      if (this.minimaxClient) {
        providers.push('minimax-m2', 'minimax-m2-stable');
      }
      if (this.groqClient && this.config.autoFallback) {
        providers.push('groq');
      }
    } else {
      if (this.groqClient) {
        providers.push('groq');
      }
      if (this.minimaxClient && this.config.autoFallback) {
        providers.push('minimax-m2', 'minimax-m2-stable');
      }
    }
    
    return providers;
  }

  generateCacheKey(message) {
    // Simple hash-like key
    return Buffer.from(message.toLowerCase().trim()).toString('base64').substring(0, 64);
  }

  clearCache() {
    this.cache = new LocalCache(this.config.workDir);
  }

  clearHistory() {
    if (this.minimaxClient) this.minimaxClient.clearHistory();
    if (this.groqClient) this.groqClient.clearHistory();
  }
}

// Create application menu
function createMenu() {
  const template = [
    {
      label: 'Archivo',
      submenu: [
        { label: 'Nuevo Proyecto', accelerator: 'CmdOrCtrl+N', click: () => mainWindow?.webContents.send('nav-to', 'new-project') },
        { type: 'separator' },
        { role: 'quit' }
      ]
    },
    {
      label: 'Editar',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' }
      ]
    },
    {
      label: 'Ver',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' }
      ]
    },
    {
      label: 'Compilar',
      submenu: [
        { label: 'Compilar DLL', accelerator: 'CmdOrCtrl+D', click: () => mainWindow?.webContents.send('action', 'compile-dll') },
        { label: 'Compilar EXE', accelerator: 'CmdOrCtrl+E', click: () => mainWindow?.webContents.send('action', 'compile-exe') },
        { label: 'Ver Builds', accelerator: 'CmdOrCtrl+B', click: () => mainWindow?.webContents.send('nav-to', 'builds') }
      ]
    },
    {
      label: 'Ayuda',
      submenu: [
        { label: 'Documentación', click: async () => { await shell.openExternal('https://github.com/xpe-hub/xpe-agent/wiki'); } },
        { type: 'separator' },
        { label: 'Acerca de XPE Agent', click: () => mainWindow?.webContents.send('show-about') }
      ]
    }
  ];

  if (process.platform === 'darwin') {
    template.unshift({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    title: 'XPE Agent v3.0 - AI Development Studio with MiniMax',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    frame: true,
    backgroundColor: '#1e1e1e'
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Initialize clients
  const config = loadConfig();
  if (config.githubToken) {
    octokit = new Octokit({ auth: config.githubToken });
  }
}

app.whenReady().then(() => {
  createMenu();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// IPC Handlers

// Configuration
ipcMain.handle('save-config', async (event, config) => {
  const currentConfig = loadConfig();
  const newConfig = { ...currentConfig, ...config };
  saveConfig(newConfig);
  
  if (config.githubToken) {
    octokit = new Octokit({ auth: config.githubToken });
  }
  
  return { success: true };
});

ipcMain.handle('get-config', async () => {
  return loadConfig();
});

// AI Chat with Provider Management
ipcMain.handle('ai-chat', async (event, data) => {
  const config = loadConfig();
  const manager = new AIProviderManager(config);
  
  return await manager.chat(
    data.systemPrompt || getDefaultSystemPrompt(),
    data.message
  );
});

ipcMain.handle('ai-clear-cache', async () => {
  const config = loadConfig();
  const manager = new AIProviderManager(config);
  manager.clearCache();
  return { success: true };
});

ipcMain.handle('ai-clear-history', async () => {
  const config = loadConfig();
  const manager = new AIProviderManager(config);
  manager.clearHistory();
  return { success: true };
});

ipcMain.handle('ai-get-status', async () => {
  const config = loadConfig();
  const manager = new AIProviderManager(config);
  const providers = manager.getProviderPriority();
  
  return {
    success: true,
    providers: providers,
    minimaxConfigured: !!config.minimaxApiKey,
    groqConfigured: !!config.groqApiKey,
    cacheEnabled: config.cacheEnabled,
    autoFallback: config.autoFallback,
    preferredProvider: config.preferredProvider
  };
});

// GitHub User
ipcMain.handle('get-user-info', async () => {
  if (!octokit) {
    const config = loadConfig();
    if (config.githubToken) {
      octokit = new Octokit({ auth: config.githubToken });
    } else {
      return { success: false, error: 'GitHub Token no configurado', code: 'NO_TOKEN' };
    }
  }

  try {
    const { data } = await octokit.request('GET /user');
    return { 
      success: true, 
      login: data.login,
      name: data.name,
      avatar: data.avatar_url
    };
  } catch (error) {
    return { success: false, error: error.message, code: error.status || 'UNKNOWN' };
  }
});

// Repository Management
ipcMain.handle('create-repo', async (event, data) => {
  if (!octokit) {
    const config = loadConfig();
    if (config.githubToken) {
      octokit = new Octokit({ auth: config.githubToken });
    } else {
      return { success: false, error: 'GitHub Token no configurado', code: 'NO_TOKEN' };
    }
  }

  try {
    const { data: repo } = await octokit.request('POST /user/repos', {
      name: data.name,
      description: data.description || 'Proyecto creado por XPE Agent',
      private: data.private !== false,
      auto_init: true
    });
    
    return { success: true, repo: { name: repo.name, full_name: repo.full_name, url: repo.html_url } };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-repo-info', async (event, data) => {
  if (!octokit) {
    return { success: false, error: 'GitHub Token no configurado', code: 'NO_TOKEN' };
  }

  try {
    const { data: repo } = await octokit.request('GET /repos/{owner}/{repo}', {
      owner: data.owner,
      repo: data.repo
    });
    
    return {
      success: true,
      name: repo.name,
      full_name: repo.full_name,
      description: repo.description,
      default_branch: repo.default_branch
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// File Operations
ipcMain.handle('create-file', async (event, data) => {
  if (!octokit) {
    return { success: false, error: 'GitHub Token no configurado' };
  }

  try {
    const content = Buffer.from(data.content).toString('base64');
    
    await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
      owner: data.owner,
      repo: data.repo,
      path: data.path,
      message: data.message || `Add ${data.path}`,
      content: content
    });
    
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('create-multiple-files', async (event, data) => {
  if (!octokit) {
    return { success: false, error: 'GitHub Token no configurado' };
  }

  try {
    const results = [];
    
    for (const file of data.files) {
      const content = Buffer.from(file.content).toString('base64');
      
      try {
        await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
          owner: data.owner,
          repo: data.repo,
          path: file.path,
          message: file.message || `Add ${file.path}`,
          content: content
        });
        results.push({ path: file.path, success: true });
      } catch (err) {
        results.push({ path: file.path, success: false, error: err.message });
      }
    }
    
    return { success: true, results };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// GitHub Actions
ipcMain.handle('trigger-workflow', async (event, data) => {
  if (!octokit) {
    return { success: false, error: 'GitHub Token no configurado' };
  }

  try {
    const workflowContent = Buffer.from(data.workflow).toString('base64');
    
    await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
      owner: data.owner,
      repo: data.repo,
      path: '.github/workflows/build.yml',
      message: 'Add build workflow for XPE Agent',
      content: workflowContent
    });

    const { data: workflowRun } = await octokit.request('POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches', {
      owner: data.owner,
      repo: data.repo,
      workflow_id: 'build.yml',
      ref: 'main'
    });

    return { success: true, message: 'Workflow triggered' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-workflow-runs', async (event, data) => {
  if (!octokit) {
    return { success: false, error: 'GitHub Token no configurado' };
  }

  try {
    const { data: runs } = await octokit.request('GET /repos/{owner}/{repo}/actions/runs', {
      owner: data.owner,
      repo: data.repo,
      per_page: 10
    });

    return {
      success: true,
      runs: runs.workflow_runs.map(run => ({
        id: run.id,
        status: run.status,
        conclusion: run.conclusion,
        html_url: run.html_url,
        created_at: run.created_at,
        updated_at: run.updated_at,
        branch: run.head_branch
      }))
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-workflow-run-status', async (event, data) => {
  if (!octokit) {
    return { success: false, error: 'GitHub Token no configurado' };
  }

  try {
    const { data: run } = await octokit.request('GET /repos/{owner}/{repo}/actions/runs/{run_id}', {
      owner: data.owner,
      repo: data.repo,
      run_id: data.runId
    });

    return {
      success: true,
      status: run.status,
      conclusion: run.conclusion,
      html_url: run.html_url,
      jobs: run.run_number
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Artifacts
ipcMain.handle('get-artifacts', async (event, data) => {
  if (!octokit) {
    return { success: false, error: 'GitHub Token no configurado' };
  }

  try {
    const { data: artifacts } = await octokit.request('GET /repos/{owner}/{repo}/actions/artifacts', {
      owner: data.owner,
      repo: data.repo
    });

    return {
      success: true,
      artifacts: artifacts.artifacts.map(artifact => ({
        id: artifact.id,
        name: artifact.name,
        size: artifact.size_in_bytes,
        created_at: artifact.created_at,
        url: artifact.archive_download_url
      }))
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('download-artifact', async (event, data) => {
  if (!octokit) {
    return { success: false, error: 'GitHub Token no configurado' };
  }

  try {
    const config = loadConfig();
    const downloadPath = path.join(config.workDir, `xpe-artifact-${Date.now()}.zip`);
    
    const { data: artifact } = await octokit.request('GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}', {
      owner: data.owner,
      repo: data.repo,
      artifact_id: data.artifactId
    });

    await downloadFile(artifact.archive_download_url, downloadPath, config.githubToken);

    return { success: true, path: downloadPath };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Releases
ipcMain.handle('create-release-with-asset', async (event, data) => {
  if (!octokit) {
    return { success: false, error: 'GitHub Token no configurado' };
  }

  try {
    const { data: release } = await octokit.request('POST /repos/{owner}/{repo}/releases', {
      owner: data.owner,
      repo: data.repo,
      tag_name: data.tag,
      name: data.name || data.tag,
      body: data.body || '',
      draft: false,
      prerelease: false
    });

    if (data.assetPath && fs.existsSync(data.assetPath)) {
      const fileContent = fs.readFileSync(data.assetPath);
      const fileName = path.basename(data.assetPath);
      
      const uploadUrl = release.upload_url.replace('{?name,label}', `?name=${encodeURIComponent(fileName)}`);
      
      await octokit.request({
        method: 'POST',
        url: uploadUrl,
        headers: {
          'Content-Type': 'application/zip',
          'Content-Length': fileContent.length
        },
        data: fileContent
      });
    }

    return { success: true, url: release.html_url };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('list-releases', async (event, data) => {
  if (!octokit) {
    return { success: false, error: 'GitHub Token no configurado' };
  }

  try {
    const { data: releases } = await octokit.request('GET /repos/{owner}/{repo}/releases', {
      owner: data.owner,
      repo: data.repo
    });

    return {
      success: true,
      releases: releases.map(r => ({
        id: r.id,
        tag: r.tag_name,
        name: r.name,
        url: r.html_url,
        assets: r.assets.map(a => ({ name: a.name, size: a.size, url: a.browser_download_url }))
      }))
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Workflow Templates
ipcMain.handle('get-workflow-templates', async () => {
  return {
    success: true,
    templates: {
      'cpp-dll': {
        name: 'C++ DLL (Windows)',
        description: 'Build a DLL using CMake and MSVC on Windows',
        content: `name: Build C++ DLL

on:
  push:
    branches: [main]
  workflow_dispatch:
    inputs:
      type:
        description: 'Build type'
        required: true
        default: 'Release'

jobs:
  build:
    runs-on: windows-latest
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Setup CMake
      uses: aminya/setup-cmake@v3
      with:
        cmake-version: '3.28.0'
    
    - name: Configure
      run: cmake -B build -DCMAKE_BUILD_TYPE=Release -A x64
    
    - name: Build
      run: cmake --build build --config Release
    
    - name: Upload DLL Artifact
      uses: actions/upload-artifact@v4
      with:
        name: compiled-dll
        path: build/Release/*.dll
        if-no-files-found: error
`
      },
      'cpp-exe': {
        name: 'C++ EXE (Windows)',
        description: 'Build an executable using CMake and MSVC',
        content: `name: Build C++ EXE

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  build:
    runs-on: windows-latest
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Setup CMake
      uses: aminya/setup-cmake@v3
      with:
        cmake-version: '3.28.0'
    
    - name: Configure
      run: cmake -B build -DCMAKE_BUILD_TYPE=Release -A x64
    
    - name: Build
      run: cmake --build build --config Release
    
    - name: Upload EXE Artifact
      uses: actions/upload-artifact@v4
      with:
        name: compiled-exe
        path: build/Release/*.exe
        if-no-files-found: error
`
      },
      'csharp-exe': {
        name: 'C# .NET EXE',
        description: 'Build a .NET executable',
        content: `name: Build C# EXE

on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  build:
    runs-on: windows-latest
    
    steps:
    - uses: actions/checkout@v4
    
    - name: Setup .NET
      uses: actions/setup-dotnet@v4
      with:
        dotnet-version: '8.0.x'
    
    - name: Restore
      run: dotnet restore
    
    - name: Build
      run: dotnet build --configuration Release --no-restore
    
    - name: Publish
      run: dotnet publish --configuration Release --no-build -o ./publish
    
    - name: Upload EXE Artifact
      uses: actions/upload-artifact@v4
      with:
        name: compiled-exe
        path: publish/*.exe
        if-no-files-found: error
`
      }
    }
  };
});

// File Selection
ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'All Files', extensions: ['*'] },
      { name: 'Executables', extensions: ['exe', 'dll'] },
      { name: 'Archives', extensions: ['zip', '7z'] }
    ]
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return { success: true, path: result.filePaths[0] };
  }
  return { success: false };
});

ipcMain.handle('select-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return { success: true, path: result.filePaths[0] };
  }
  return { success: false };
});

// Notifications
ipcMain.handle('show-notification', async (event, data) => {
  new Notification({
    title: data.title || 'XPE Agent',
    body: data.body || '',
    icon: path.join(__dirname, 'assets', 'icon.png')
  }).show();
});

// External links
ipcMain.handle('open-external', async (event, url) => {
  await shell.openExternal(url);
  return { success: true };
});

// Helper Functions
function getDefaultSystemPrompt() {
  return `Eres XPE Agent v3.0, un asistente de desarrollo de IA avanzado potenciado por MiniMax M2.

Tus responsabilidades:

1. **Generar Código de Calidad**: Escribe código limpio, documentado y funcional en C++, C#, Python, y otros lenguajes.

2. **Incluir Archivos de Construcción**: SIEMPRE incluye los archivos necesarios para compilar:
   - Para C++: CMakeLists.txt o Makefile
   - Para C#: .csproj o solución de Visual Studio

3. **Estructura DLL C++**:
\`\`\`cpp
// nombre_dll.cpp
#include <windows.h>

extern "C" __declspec(dllexport) void MiFuncion() {
    // Tu código aquí
}

BOOL APIENTRY DllMain(HMODULE hModule, DWORD ul_reason_for_call, LPVOID lpReserved) {
    switch (ul_reason_for_call) {
        case DLL_PROCESS_ATTACH:
        case DLL_THREAD_ATTACH:
        case DLL_THREAD_DETACH:
        case DLL_PROCESS_DETACH:
            break;
    }
    return TRUE;
}
\`\`\`

4. **Formato de Respuesta**: 
   - Explica brevemente lo que vas a crear
   - Proporciona código en bloques etiquetados
   - Incluye instrucciones de compilación

5. **Comunicación Clara**: Responde en español, sé conciso pero completo.`;
}

function downloadFile(url, dest, token) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    
    const options = {
      headers: {
        'Authorization': `token ${token}`,
        'Accept': 'application/octet-stream'
      }
    };

    const protocol = url.startsWith('https') ? require('https') : require('http');
    
    protocol.get(url, options, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}
