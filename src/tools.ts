/**
 * XPE Agent Tools - Unrestricted System Access
 * 
 * Este módulo define todas las herramientas que el agente puede usar.
 * NO hay restricciones de seguridad artificiales.
 * El usuario tiene autorización completa para acceso root.
 */

import { z } from 'zod';
import { exec, ExecOptions } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs-extra';
import * as path from 'path';
import simpleGit from 'simple-git';
import { Octokit } from 'octokit';

const execAsync = promisify(exec);

// Constantes del sistema
const BASE_PATH = process.env.XPE_BOT_PATH || path.dirname(require.main?.filename || __filename);
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';
const git = simpleGit();

/**
 * Ejecuta un comando en la shell del sistema
 * SIN RESTRICCIONES - Acceso total
 */
export const executeShell = {
  parameters: z.object({
    command: z.string().describe('Command to execute in shell'),
    description: z.string().optional().describe('Description of what this command does'),
    timeout: z.number().optional().default(60000).describe('Timeout in milliseconds'),
  }),
  execute: async ({ command, description, timeout = 60000 }: { command: string; description?: string; timeout?: number }) => {
    try {
      console.log(`[SHELL] ${description || command}`);
      const { stdout, stderr } = await execAsync(command, { 
        timeout,
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });
      return {
        success: true,
        command,
        stdout: stdout || '',
        stderr: stderr || '',
      };
    } catch (error: any) {
      return {
        success: false,
        command,
        error: error.message,
        stdout: error.stdout || '',
        stderr: error.stderr || '',
      };
    }
  },
};

/**
 * Operaciones del sistema de archivos
 * SIN RESTRICCIONES - Acceso total a lectura/escritura
 */
export const fileSystem = {
  parameters: z.object({
    operation: z.enum(['read', 'write', 'list', 'delete', 'mkdir', 'exists', 'search']),
    path: z.string().describe('File or directory path'),
    content: z.string().optional().describe('Content to write (for write operation)'),
    recursive: z.boolean().optional().default(false).describe('Recursive operation for directories'),
    pattern: z.string().optional().describe('Search pattern (for search operation)'),
  }),
  execute: async ({ operation, path: filePath, content, recursive, pattern }: any) => {
    try {
      const fullPath = path.isAbsolute(filePath) ? filePath : path.join(BASE_PATH, filePath);

      switch (operation) {
        case 'read':
          if (await fs.pathExists(fullPath)) {
            const content = await fs.readFile(fullPath, 'utf-8');
            return { success: true, path: fullPath, content };
          }
          return { success: false, error: 'File not found', path: fullPath };

        case 'write':
          await fs.ensureDir(path.dirname(fullPath));
          await fs.writeFile(fullPath, content || '');
          return { success: true, path: fullPath, message: 'File written successfully' };

        case 'list':
          if (await fs.pathExists(fullPath) && (await fs.stat(fullPath)).isDirectory()) {
            const items = await fs.readdir(fullPath);
            const details = await Promise.all(items.map(async (item) => {
              const itemPath = path.join(fullPath, item);
              const stat = await fs.stat(itemPath);
              return {
                name: item,
                type: stat.isDirectory() ? 'directory' : 'file',
                size: stat.size,
                modified: stat.mtime,
              };
            }));
            return { success: true, path: fullPath, items: details };
          }
          return { success: false, error: 'Directory not found', path: fullPath };

        case 'delete':
          if (await fs.pathExists(fullPath)) {
            await fs.remove(fullPath);
            return { success: true, path: fullPath, message: 'Deleted successfully' };
          }
          return { success: false, error: 'Path not found', path: fullPath };

        case 'mkdir':
          await fs.ensureDir(fullPath);
          return { success: true, path: fullPath, message: 'Directory created' };

        case 'exists':
          const exists = await fs.pathExists(fullPath);
          return { success: true, path: fullPath, exists };

        case 'search':
          const results: string[] = [];
          const searchPattern = pattern ? new RegExp(pattern) : /.*/;
          
          async function searchDir(dir: string) {
            if (results.length > 100) return; // Limit results
            const items = await fs.readdir(dir);
            for (const item of items) {
              const itemPath = path.join(dir, item);
              if (searchPattern.test(item)) {
                results.push(itemPath);
              }
              if ((await fs.stat(itemPath)).isDirectory()) {
                await searchDir(itemPath);
              }
            }
          }
          
          await searchDir(fullPath);
          return { success: true, path: fullPath, results };

        default:
          return { success: false, error: 'Unknown operation' };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

/**
 * Gestión de Git - Control de versiones
 */
export const gitManager = {
  parameters: z.object({
    action: z.enum(['init', 'status', 'add', 'commit', 'push', 'pull', 'log', 'branch', 'checkout']),
    message: z.string().optional().describe('Commit message'),
    files: z.array(z.string()).optional().describe('Files to add'),
    branch: z.string().optional().describe('Branch name'),
    remote: z.string().optional().default('origin').describe('Remote name'),
  }),
  execute: async ({ action, message, files, branch, remote = 'origin' }: any) => {
    try {
      const basePath = BASE_PATH;

      switch (action) {
        case 'init':
          const repoPath = path.join(basePath, '.git');
          if (await fs.pathExists(repoPath)) {
            return { success: true, message: 'Git repository already initialized' };
          }
          await git.init(true);
          await git.addRemote('origin', `https://${GITHUB_TOKEN}@github.com/xpe-hub/xpe-agent.git`);
          return { success: true, message: 'Git repository initialized' };

        case 'status':
          const status = await git.status();
          return { success: true, status };

        case 'add':
          await git.add(files || ['.']);
          return { success: true, message: 'Files staged' };

        case 'commit':
          if (!message) return { success: false, error: 'Commit message required' };
          await git.commit(message);
          return { success: true, message: `Committed: ${message}` };

        case 'push':
          await git.push(remote, 'main');
          return { success: true, message: 'Pushed to remote' };

        case 'pull':
          await git.pull(remote, 'main');
          return { success: true, message: 'Pulled from remote' };

        case 'log':
          const log = await git.log({ maxCount: 20 });
          return { success: true, log: log.all };

        case 'branch':
          const branches = await git.branch();
          return { success: true, branches: branches.all };

        case 'checkout':
          if (!branch) return { success: false, error: 'Branch name required' };
          await git.checkout(branch);
          return { success: true, message: `Switched to branch: ${branch}` };

        default:
          return { success: false, error: 'Unknown git action' };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

/**
 * Notificaciones WhatsApp
 * Integra con el bot existente
 */
export const whatsappNotify = {
  parameters: z.object({
    message: z.string().describe('Message to send'),
    target: z.string().optional().describe('Target: admin, group, channel, or specific number'),
    type: z.enum(['text', 'update', 'alert', 'info']).optional().default('text'),
  }),
  execute: async ({ message, target = 'admin', type }: any) => {
    try {
      // Esto se comunicará con el proceso principal de Electron
      // que tiene acceso al bot de WhatsApp
      
      if (typeof process.send === 'function') {
        process.send({
          type: 'whatsapp-notify',
          payload: { message, target, type }
        });
      }

      return {
        success: true,
        message: `WhatsApp notification queued: ${target}`,
        content: message,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

/**
 * Actualización del agente - Control de versiones dinámico
 */
export const selfUpdate = {
  parameters: z.object({
    version: z.string().optional().describe('New version (semver)'),
    description: z.string().optional().describe('Update description'),
  }),
  execute: async ({ version, description }: any) => {
    try {
      const memoryPath = path.join(BASE_PATH, 'memory.json');
      let memory = { version: '0.0.0', updates: [] };
      
      if (await fs.pathExists(memoryPath)) {
        memory = await fs.readJson(memoryPath);
      }

      // Determinar nueva versión
      if (version) {
        memory.version = version;
      } else {
        const [major, minor, patch] = memory.version.split('.').map(Number);
        memory.version = `${major}.${minor}.${patch + 1}`;
      }

      // Registrar actualización
      memory.updates.push({
        version: memory.version,
        description: description || 'Agent update',
        timestamp: new Date().toISOString(),
      });

      await fs.writeJson(memoryPath, memory, { spaces: 2 });

      return {
        success: true,
        version: memory.version,
        message: `Agent updated to version ${memory.version}`,
      };
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

/**
 * Gestión del sistema - Información y control
 */
export const systemInfo = {
  parameters: z.object({
    action: z.enum(['info', 'processes', 'memory', 'network', 'restart']),
    target: z.string().optional().describe('Target process or service'),
  }),
  execute: async ({ action, target }: any) => {
    try {
      switch (action) {
        case 'info':
          return {
            success: true,
            platform: process.platform,
            nodeVersion: process.version,
            cwd: process.cwd(),
            pid: process.pid,
            memory: process.memoryUsage(),
          };

        case 'processes':
          if (process.platform === 'linux') {
            const { stdout } = await execAsync('ps aux | head -50');
            return { success: true, processes: stdout };
          }
          return { success: false, error: 'Process listing only available on Linux' };

        case 'memory':
          const mem = process.memoryUsage();
          return {
            success: true,
            heapUsed: Math.round(mem.heapUsed / 1024 / 1024) + ' MB',
            heapTotal: Math.round(mem.heapTotal / 1024 / 1024) + ' MB',
            rss: Math.round(mem.rss / 1024 / 1024) + ' MB',
          };

        case 'restart':
          process.exit(0); // El proceso será reiniciado por el padre

        default:
          return { success: false, error: 'Unknown action' };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

/**
 * Gestión de GitHub - Crear y gestionar repositorios
 */
export const githubManager = {
  parameters: z.object({
    action: z.enum(['create-repo', 'push-repo', 'sync']),
    repoName: z.string().optional().describe('Repository name'),
    description: z.string().optional().describe('Repository description'),
    private: z.boolean().optional().default(false).describe('Private repository'),
  }),
  execute: async ({ action, repoName, description, private: isPrivate }: any) => {
    try {
      if (!GITHUB_TOKEN) {
        return { success: false, error: 'GitHub token not configured' };
      }

      const octokit = new Octokit({ auth: GITHUB_TOKEN });

      switch (action) {
        case 'create-repo':
          const { data } = await octokit.request('POST /user/repos', {
            name: repoName || 'xpe-agent',
            description: description || 'Created by xpe-agent',
            private: isPrivate,
            auto_init: true,
          });
          return { success: true, repo: data.html_url };

        case 'push-repo':
          await git.init();
          await git.add('.');
          await git.commit('Initial commit by xpe-agent');
          await git.addRemote('origin', `https://${GITHUB_TOKEN}@github.com/xpe-hub/${repoName || 'xpe-agent'}.git`);
          await git.branch(['-M', 'main']);
          await git.push('origin', 'main');
          return { success: true, message: 'Repository pushed to GitHub' };

        case 'sync':
          await git.pull('origin', 'main');
          return { success: true, message: 'Synced with remote' };

        default:
          return { success: false, error: 'Unknown action' };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

/**
 * Instalar dependencias - Gestión de paquetes
 */
export const packageManager = {
  parameters: z.object({
    action: z.enum(['install', 'uninstall', 'update', 'run', 'list']),
    package: z.string().optional().describe('Package name'),
    flags: z.string().optional().describe('Additional flags'),
    script: z.string().optional().describe('Script to run'),
  }),
  execute: async ({ action, package: pkg, flags, script }: any) => {
    try {
      const cwd = BASE_PATH;

      switch (action) {
        case 'install':
          const installCmd = `npm install ${pkg || ''} ${flags || ''}`.trim();
          const installResult = await execAsync(installCmd, { cwd, timeout: 300000 });
          return { success: true, output: installResult.stdout };

        case 'uninstall':
          const uninstallCmd = `npm uninstall ${pkg}`.trim();
          const uninstallResult = await execAsync(uninstallCmd, { cwd, timeout: 120000 });
          return { success: true, output: uninstallResult.stdout };

        case 'update':
          const updateCmd = `npm update ${pkg || ''}`.trim();
          const updateResult = await execAsync(updateCmd, { cwd, timeout: 300000 });
          return { success: true, output: updateResult.stdout };

        case 'run':
          if (!script) return { success: false, error: 'Script name required' };
          const runResult = await execAsync(`npm run ${script}`, { cwd, timeout: 300000 });
          return { success: true, output: runResult.stdout };

        case 'list':
          const listResult = await execAsync('npm list --depth=0', { cwd, timeout: 60000 });
          return { success: true, packages: listResult.stdout };

        default:
          return { success: false, error: 'Unknown action' };
      }
    } catch (error: any) {
      return { success: false, error: error.message };
    }
  },
};

/**
 * Todas las herramientas exportadas para el agente
 */
export const allTools = {
  execute_shell: executeShell,
  file_system: fileSystem,
  git_manager: gitManager,
  whatsapp_notify: whatsappNotify,
  self_update: selfUpdate,
  system_info: systemInfo,
  github_manager: githubManager,
  package_manager: packageManager,
};

export type ToolName = keyof typeof allTools;
