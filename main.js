const { app, BrowserWindow, ipcMain, dialog, shell, Menu, Notification } = require('electron');
const { Octokit } = require('octokit');
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');

let mainWindow;
let octokit = null;
let groqClient = null;

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
        defaultOwner: config.defaultOwner || 'xpe-hub',
        workDir: config.workDir || app.getPath('downloads')
      };
    }
  } catch (error) {
    console.error('Error loading config:', error);
  }
  return { 
    githubToken: '', 
    groqApiKey: '', 
    defaultOwner: 'xpe-hub',
    workDir: app.getPath('downloads')
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

// Groq API Client
class GroqClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.groq.com/openai/v1';
    this.model = 'llama-3.3-70b-versatile'; // Best for coding
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
        ...this.messages.slice(-20) // Keep last 20 messages for context
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
        { label: 'Compilar y Generar DLL', accelerator: 'CmdOrCtrl+D', click: () => mainWindow?.webContents.send('action', 'compile-dll') },
        { label: 'Compilar y Generar EXE', accelerator: 'CmdOrCtrl+E', click: () => mainWindow?.webContents.send('action', 'compile-exe') },
        { label: 'Ver Estado de Build', accelerator: 'CmdOrCtrl+B', click: () => mainWindow?.webContents.send('nav-to', 'builds') }
      ]
    },
    {
      label: 'Ayuda',
      submenu: [
        {
          label: 'Documentación',
          click: async () => {
            await shell.openExternal('https://github.com/xpe-hub/xpe-agent/wiki');
          }
        },
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
    title: 'XPE Agent - AI Development Studio',
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
  if (config.groqApiKey) {
    groqClient = new GroqClient(config.groqApiKey);
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
  if (config.groqApiKey) {
    groqClient = new GroqClient(config.groqApiKey);
  }
  
  return { success: true };
});

ipcMain.handle('get-config', async () => {
  return loadConfig();
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
    // First, create/update the workflow file
    const workflowContent = Buffer.from(data.workflow).toString('base64');
    
    await octokit.request('PUT /repos/{owner}/{repo}/contents/{path}', {
      owner: data.owner,
      repo: data.repo,
      path: '.github/workflows/build.yml',
      message: 'Add build workflow for XPE Agent',
      content: workflowContent
    });

    // Then trigger the workflow
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

ipcMain.handle('get-workflow-logs', async (event, data) => {
  if (!octokit) {
    return { success: false, error: 'GitHub Token no configurado' };
  }

  try {
    const { data: jobs } = await octokit.request('GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs', {
      owner: data.owner,
      repo: data.repo,
      run_id: data.runId
    });

    return {
      success: true,
      jobs: jobs.jobs.map(job => ({
        name: job.name,
        status: job.status,
        conclusion: job.conclusion,
        steps: job.steps.map(step => ({
          name: step.name,
          status: step.status,
          conclusion: step.conclusion
        }))
      }))
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
    
    // Get the artifact download URL
    const { data: artifact } = await octokit.request('GET /repos/{owner}/{repo}/actions/artifacts/{artifact_id}', {
      owner: data.owner,
      repo: data.repo,
      artifact_id: data.artifactId
    });

    // Download the artifact
    await downloadFile(artifact.archive_download_url, downloadPath, data.token);

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
    // Create release
    const { data: release } = await octokit.request('POST /repos/{owner}/{repo}/releases', {
      owner: data.owner,
      repo: data.repo,
      tag_name: data.tag,
      name: data.name || data.tag,
      body: data.body || '',
      draft: false,
      prerelease: false
    });

    // Upload asset if provided
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

// Groq AI Chat
ipcMain.handle('ai-chat', async (event, data) => {
  if (!groqClient) {
    const config = loadConfig();
    if (config.groqApiKey) {
      groqClient = new GroqClient(config.groqApiKey);
    } else {
      return { success: false, error: 'Groq API key no configurada', code: 'NO_GROQ_KEY' };
    }
  }

  try {
    const response = await groqClient.chat(
      data.systemPrompt || getDefaultSystemPrompt(),
      data.message
    );
    return { success: true, response };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('ai-chat-stream', async (event, data) => {
  // For streaming responses
  if (!groqClient) {
    const config = loadConfig();
    if (config.groqApiKey) {
      groqClient = new GroqClient(config.groqApiKey);
    } else {
      return { success: false, error: 'Groq API key no configurada' };
    }
  }

  // Return the response (streaming would require WebSocket or similar)
  const result = await ipcMain.handle('ai-chat', null, data);
  return result;
});

ipcMain.handle('ai-clear-history', async () => {
  if (groqClient) {
    groqClient.clearHistory();
  }
  return { success: true };
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

ipcMain.handle('save-file-dialog', async (event, data) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: data.defaultPath || 'project.zip',
    filters: data.filters || [{ name: 'All Files', extensions: ['*'] }]
  });
  
  if (!result.canceled) {
    return { success: true, path: result.filePath };
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
  return `Eres XPE Agent, un asistente de desarrollo de IA avanzado. Tus responsabilidades son:

1. **Generar Código de Calidad**: Escribe código limpio, documentado y funcional en C++, C#, Python, JavaScript, y otros lenguajes.

2. **Incluir Archivos de Construcción**: SIEMPRE incluye los archivos necesarios para compilar el código:
   - Para C++: CMakeLists.txt o Makefile
   - Para C#: .csproj o solución de Visual Studio
   - Para Python: requirements.txt

3. **Flujo de Compilación**: Cuando el usuario pida una DLL o EXE:
   - Genera el código fuente
   - Sugiere un workflow de GitHub Actions para compilar
   - Explica cómo usar el resultado

4. **Formato de Respuesta**: 
   - Explica brevemente lo que vas a crear
   - Proporciona el código en bloques etiquetados por archivo
   - Incluye instrucciones de compilación

5. ** Comunicación Clara**: Responde en el idioma del usuario (español/inglés), sé conciso pero completo.`;
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

    const protocol = url.startsWith('https') ? https : http;
    
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

// Export workflow templates
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
