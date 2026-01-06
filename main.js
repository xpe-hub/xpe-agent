const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const { Octokit } = require('octokit');
const fs = require('fs');
const path = require('path');

let mainWindow;
let octokit = null;

// Configuration file path
const CONFIG_PATH = path.join(app.getPath('userData'), 'config.json');

// Load configuration
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const data = fs.readFileSync(CONFIG_PATH, 'utf8');
      const config = JSON.parse(data);
      // Validate required fields
      if (!config.githubToken) return { githubToken: '', owner: 'xpe-hub' };
      return config;
    }
  } catch (error) {
    console.error('Error loading config:', error);
  }
  return { githubToken: '', owner: 'xpe-hub' };
}

// Save configuration
function saveConfig(config) {
  try {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error('Error saving config:', error);
  }
}

// Create application menu
function createMenu() {
  const template = [
    {
      label: 'Archivo',
      submenu: [
        { label: 'Nueva Release', accelerator: 'CmdOrCtrl+N', click: () => mainWindow?.webContents.send('nav-to', 'release') },
        { type: 'separator' },
        { role: 'quit' }
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
      label: 'Ayuda',
      submenu: [
        {
          label: 'Documentación',
          click: async () => {
            await shell.openExternal('https://docs.github.com/en/repositories/releasing-projects-on-github');
          }
        }
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
    width: 1200,
    height: 800,
    minWidth: 1000,
    minHeight: 700,
    title: 'XPE Agent - GitHub Release Manager',
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    },
    frame: true,
    backgroundColor: '#0f0f1a'
    // icon: path.join(__dirname, 'assets', 'icon.png')
  });

  mainWindow.loadFile('index.html');

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Open external links in default browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Initialize Octokit if token exists
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

// IPC Handlers for GitHub operations
ipcMain.handle('set-token', async (event, token) => {
  const config = loadConfig();
  config.githubToken = token;
  saveConfig(config);
  octokit = new Octokit({ auth: token });
  return { success: true };
});

ipcMain.handle('get-config', async () => {
  return loadConfig();
});

ipcMain.handle('create-release', async (event, data) => {
  try {
    if (!octokit) {
      const config = loadConfig();
      if (config.githubToken) {
        octokit = new Octokit({ auth: config.githubToken });
      } else {
        return { success: false, error: 'GitHub Token no configurado', code: 'NO_TOKEN' };
      }
    }

    // Create release
    const { data: release } = await octokit.request('POST /repos/{owner}/{repo}/releases', {
      owner: data.owner,
      repo: data.repo,
      tag_name: data.tag,
      name: data.name || data.tag,
      body: data.body,
      draft: false,
      prerelease: false
    });

    // Upload asset if file provided
    if (data.filePath && fs.existsSync(data.filePath)) {
      const fileContent = fs.readFileSync(data.filePath);
      const fileName = path.basename(data.filePath);
      const contentType = getContentType(fileName);
      
      const uploadUrl = release.upload_url.replace('{?name,label}', `?name=${encodeURIComponent(fileName)}`);
      
      await octokit.request({
        method: 'POST',
        url: uploadUrl,
        headers: {
          'Content-Type': contentType,
          'Content-Length': fileContent.length
        },
        data: fileContent
      });
    }

    return { 
      success: true, 
      url: release.html_url,
      id: release.id,
      tag: release.tag_name,
      message: 'Release creado con éxito'
    };
  } catch (error) {
    console.error('Create release error:', error);
    return { success: false, error: error.message, code: error.status || 'UNKNOWN' };
  }
});

ipcMain.handle('list-releases', async (event, data) => {
  try {
    if (!octokit) {
      const config = loadConfig();
      if (config.githubToken) {
        octokit = new Octokit({ auth: config.githubToken });
      } else {
        return { success: false, error: 'GitHub Token no configurado', code: 'NO_TOKEN' };
      }
    }

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
        body: r.body,
        created_at: r.created_at,
        assets: r.assets.map(a => ({ 
          name: a.name, 
          size: a.size, 
          url: a.browser_download_url,
          downloads: a.download_count
        }))
      }))
    };
  } catch (error) {
    console.error('List releases error:', error);
    return { success: false, error: error.message, code: error.status || 'UNKNOWN' };
  }
});

ipcMain.handle('delete-release', async (event, data) => {
  try {
    if (!octokit) {
      const config = loadConfig();
      if (config.githubToken) {
        octokit = new Octokit({ auth: config.githubToken });
      } else {
        return { success: false, error: 'GitHub Token no configurado', code: 'NO_TOKEN' };
      }
    }

    await octokit.request('DELETE /repos/{owner}/{repo}/releases/{releaseId}', {
      owner: data.owner,
      repo: data.repo,
      releaseId: data.releaseId
    });

    return { success: true, message: 'Release eliminado' };
  } catch (error) {
    console.error('Delete release error:', error);
    return { success: false, error: error.message };
  }
});

ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: 'All Files', extensions: ['*'] },
      { name: 'Executables', extensions: ['exe', 'dll'] },
      { name: 'Archives', extensions: ['zip', '7z', 'rar'] },
      { name: 'Documents', extensions: ['md', 'txt', 'json'] }
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

ipcMain.handle('get-user-info', async () => {
  try {
    if (!octokit) {
      const config = loadConfig();
      if (config.githubToken) {
        octokit = new Octokit({ auth: config.githubToken });
      } else {
        return { success: false, error: 'Token no configurado', code: 'NO_TOKEN' };
      }
    }

    const { data } = await octokit.request('GET /user');
    return { 
      success: true, 
      login: data.login,
      name: data.name,
      avatar: data.avatar_url,
      email: data.email,
      public_repos: data.public_repos,
      private_repos: data.total_private_repos
    };
  } catch (error) {
    console.error('Get user info error:', error);
    return { success: false, error: error.message, code: error.status || 'UNKNOWN' };
  }
});

ipcMain.handle('get-repo-info', async (event, data) => {
  try {
    if (!octokit) {
      const config = loadConfig();
      if (config.githubToken) {
        octokit = new Octokit({ auth: config.githubToken });
      } else {
        return { success: false, error: 'Token no configurado', code: 'NO_TOKEN' };
      }
    }

    const { data: repo } = await octokit.request('GET /repos/{owner}/{repo}', {
      owner: data.owner,
      repo: data.repo
    });

    return {
      success: true,
      name: repo.name,
      full_name: repo.full_name,
      description: repo.description,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      open_issues: repo.open_issues_count,
      language: repo.language,
      updated_at: repo.updated_at
    };
  } catch (error) {
    console.error('Get repo info error:', error);
    return { success: false, error: error.message, code: error.status || 'UNKNOWN' };
  }
});

ipcMain.handle('open-external', async (event, url) => {
  await shell.openExternal(url);
  return { success: true };
});

function getContentType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const types = {
    '.exe': 'application/x-msdownload',
    '.dll': 'application/x-msdownload',
    '.zip': 'application/zip',
    '.7z': 'application/x-7z-compressed',
    '.rar': 'application/x-rar-compressed',
    '.json': 'application/json',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.gif': 'image/gif'
  };
  return types[ext] || 'application/octet-stream';
}
