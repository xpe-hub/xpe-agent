#!/usr/bin/env node
/**
 * XPE Agent - Standalone Launcher
 * Versión independiente lista para usar
 * No requiere compilación TypeScript
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.join(__dirname, '.env');

// Colores para la consola
const COLORS = {
    reset: '\x1b[0m',
    green: '\x1b[32m',
    blue: '\x1b[34m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    magenta: '\x1b[35m'
};

function log(color, message) {
    console.log(`${color}[XPE-AGENT]${COLORS.reset} ${message}`);
}

function logBanner() {
    console.log(`
${COLORS.cyan}╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║   ${COLORS.green}██╗  ██╗ █████╗  ██████╗██╗  ██╗███████╗██████╗ ${COLORS.cyan}         ║
║   ${COLORS.green}██║  ██║██╔══██╗██╔════╝██║ ██╔╝██╔════╝██╔══██╗${COLORS.cyan}         ║
║   ${COLORS.green}███████║███████║██║     █████╔╝ █████╗  ███████╗${COLORS.cyan}          ║
║   ${COLORS.green}██╔══██║██╔══██║██║     ██╔═██╗ ██╔══╝  ╚════██║${COLORS.cyan}          ║
║   ${COLORS.green}██║  ██║██║  ██║╚██████╗██║  ██╗███████╗██████╔╝${COLORS.cyan}          ║
║   ${COLORS.green}╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚══════╝╚═════╝ ${COLORS.cyan}          ║
║                                                                  ║
║   ${COLORS.magenta}🤖 AGENTE DE IA AUTÓNOMO - ACCESO SIN RESTRICCIONES${COLORS.cyan}         ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝${COLORS.reset}
    `);
}

async function checkOllama() {
    try {
        const response = await fetch('http://localhost:11434/api/tags');
        if (response.ok) {
            const data = await response.json();
            log(COLORS.green, `✅ Ollama ejecutándose (${data.models?.length || 0} modelos)`);
            return true;
        }
    } catch (e) {
        log(COLORS.yellow, '⚠️ Ollama no está ejecutándose');
    }
    return false;
}

async function checkNodeModules() {
    const nodeModules = path.join(__dirname, 'node_modules');
    if (!fs.existsSync(nodeModules)) {
        log(COLORS.blue, '📦 Instalando dependencias...');
        const { execSync } = await import('child_process');
        execSync('npm install', { cwd: __dirname, stdio: 'inherit' });
        log(COLORS.green, '✅ Dependencias instaladas');
    }
}

async function checkDist() {
    const distPath = path.join(__dirname, 'dist', 'index.js');
    if (!fs.existsSync(distPath)) {
        log(COLORS.blue, '🔨 Compilando TypeScript...');
        const { execSync } = await import('child_process');
        try {
            execSync('npm run build', { cwd: __dirname, stdio: 'inherit' });
            log(COLORS.green, '✅ Compilación completada');
        } catch (e) {
            log(COLORS.red, '❌ Error compilando. Ejecuta: npm run build');
            process.exit(1);
        }
    }
}

function loadEnv() {
    if (fs.existsSync(envFile)) {
        const content = fs.readFileSync(envFile, 'utf-8');
        content.split('\n').forEach(line => {
            const [key, ...value] = line.split('=');
            if (key && value) {
                process.env[key.trim()] = value.join('=').trim();
            }
        });
    }
}

function showHelp() {
    console.log(`
${COLORS.cyan}═══════════════════════════════════════════════════════════════════${COLORS.reset}
${COLORS.green}COMANDOS DISPONIBLES:${COLORS.reset}
${COLORS.cyan}───────────────────────────────────────────────────────────────────${COLORS.reset}
  start       Iniciar el agente en modo chat interactivo
  status      Verificar estado del sistema
  info        Mostrar información del agente
  version     Mostrar versión actual
  help        Mostrar esta ayuda
  exit        Salir

${COLORS.cyan}───────────────────────────────────────────────────────────────────${COLORS.reset}
${COLORS.green}EJEMPLOS:${COLORS.reset}
  node xpe-agent.js start
  node xpe-agent.js status
  node xpe-agent.js version

${COLORS.cyan}───────────────────────────────────────────────────────────────────${COLORS.reset}
${COLORS.green}NOTA:${COLORS.reset} Asegúrate de tener Ollama ejecutándose en http://localhost:11434
       y el modelo ${process.env.OLLAMA_MODEL || 'llama3:latest'} descargado.

${COLORS.cyan}═══════════════════════════════════════════════════════════════════${COLORS.reset}
    `);
}

function showInfo() {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));
    console.log(`
${COLORS.cyan}═══════════════════════════════════════════════════════════════════${COLORS.reset}
${COLORS.green}INFORMACIÓN DE XPE AGENT:${COLORS.reset}
${COLORS.cyan}───────────────────────────────────────────────────────────────────${COLORS.reset}
  Nombre:        ${pkg.name}
  Versión:       ${pkg.version}
  Descripción:   ${pkg.description}
  Autor:         ${pkg.author}
  Licencia:      ${pkg.license}

${COLORS.cyan}───────────────────────────────────────────────────────────────────${COLORS.reset}
${COLORS.green}CONFIGURACIÓN ACTUAL:${COLORS.reset}
  Ollama URL:    ${process.env.OLLAMA_URL || 'http://localhost:11434'}
  Modelo:        ${process.env.OLLAMA_MODEL || 'llama3:latest'}
  Directorio:    ${__dirname}
  Node.js:       ${process.version}
  Plataforma:    ${process.platform}

${COLORS.cyan}───────────────────────────────────────────────────────────────────${COLORS.reset}
${COLORS.green}COMANDOS ÚTILES:${COLORS.reset}
  • ollama pull llama3    - Descargar modelo Llama 3
  • ollama list           - Ver modelos instalados
  • ollama serve          - Iniciar servidor Ollama

${COLORS.cyan}═══════════════════════════════════════════════════════════════════${COLORS.reset}
    `);
}

async function startAgent() {
    loadEnv();
    
    const distIndex = path.join(__dirname, 'dist', 'index.js');
    
    if (!fs.existsSync(distIndex)) {
        await checkNodeModules();
        await checkDist();
    }
    
    loadEnv();
    
    log(COLORS.cyan, '🚀 Iniciando XPE Agent...');
    
    const agentProcess = spawn('node', [distIndex], {
        cwd: __dirname,
        env: process.env,
        stdio: ['pipe', 'pipe', 'pipe']
    });
    
    agentProcess.stdout.on('data', (data) => {
        process.stdout.write(data.toString());
    });
    
    agentProcess.stderr.on('data', (data) => {
        process.stderr.write(data.toString());
    });
    
    agentProcess.on('error', (error) => {
        log(COLORS.red, `❌ Error: ${error.message}`);
    });
    
    agentProcess.on('exit', (code) => {
        log(COLORS.yellow, `👋 Agente finalizado (código: ${code})`);
    });
    
    // Manejar signals
    process.on('SIGINT', () => {
        log(COLORS.yellow, '🛑 Deteniendo agente...');
        agentProcess.kill('SIGINT');
        process.exit(0);
    });
    
    process.on('SIGTERM', () => {
        log(COLORS.yellow, '🛑 Deteniendo agente...');
        agentProcess.kill('SIGTERM');
        process.exit(0);
    });
}

async function main() {
    const args = process.argv.slice(2);
    const command = args[0]?.toLowerCase() || 'start';
    
    logBanner();
    loadEnv();
    
    switch (command) {
        case 'start':
            await checkOllama();
            await startAgent();
            break;
            
        case 'status':
            log(COLORS.green, '✅ XPE Agent está listo');
            log(COLORS.blue, `📍 Versión: ${JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'))).version}`);
            log(COLORS.blue, `📍 Node.js: ${process.version}`);
            log(COLORS.blue, `📍 Plataforma: ${process.platform}`);
            await checkOllama();
            break;
            
        case 'info':
            showInfo();
            break;
            
        case 'version':
            const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json')));
            log(COLORS.green, `XPE Agent v${pkg.version}`);
            break;
            
        case 'help':
            showHelp();
            break;
            
        default:
            log(COLORS.yellow, `Comando desconocido: ${command}`);
            showHelp();
    }
}

main().catch(error => {
    log(COLORS.red, `Error: ${error.message}`);
    process.exit(1);
});
