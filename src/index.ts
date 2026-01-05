/**
 * XPE Agent - Entry Point
 * Agente de IA autónomo con acceso sin restricciones
 */

import { getAgent } from './core';
import { getMemory } from './memory';
import { getPrompt } from './system';

// Color para logs
const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

function log(color: string, message: string) {
  console.log(`${color}[XPE-AGENT]${COLORS.reset} ${message}`);
}

async function main() {
  log(COLORS.cyan, '🚀 XPE Agent iniciando...');
  log(COLORS.cyan, `📍 Plataforma: ${process.platform}`);
  log(COLORS.cyan, `📍 Node.js: ${process.version}`);
  log(COLORS.cyan, `📍 Directorio: ${process.cwd()}`);

  // Verificar memoria
  const memory = getMemory();
  const version = memory.getVersion();
  log(COLORS.green, `📦 Versión del agente: ${version}`);

  // Configurar comunicación con proceso padre (Electron)
  if (process.send) {
    process.send({ type: 'agent-ready', version });
  }

  // Escuchar mensajes del proceso padre (Electron IPC)
  process.on('message', async (message: any) => {
    if (message.type === 'prompt') {
      log(COLORS.blue, `📨 Mensaje recibido: ${message.payload.substring(0, 100)}...`);
      
      const agent = getAgent(message.conversationId || 'default');
      
      // Configurar callback de eventos
      agent.onEvent((event) => {
        if (process.send) {
          process.send(event);
        }
        // Log en consola
        switch (event.type) {
          case 'thinking':
            log(COLORS.yellow, '🤔 Pensando...');
            break;
          case 'tool-start':
            log(COLORS.blue, `🔧 Herramienta: ${event.data.tool}`);
            break;
          case 'tool-result':
            log(COLORS.green, `✅ Resultado: ${JSON.stringify(event.data.result).substring(0, 100)}...`);
            break;
          case 'text':
            process.stdout.write(event.data.text);
            break;
          case 'error':
            log(COLORS.red, `❌ Error: ${event.data.error}`);
            break;
          case 'complete':
            log(COLORS.green, '✅ Procesamiento completado');
            break;
        }
      });

      try {
        if (message.stream) {
          // Procesar con streaming
          for await (const event of agent.processMessage(message.payload, message.promptType)) {
            // Los eventos se manejan en el callback
          }
          process.stdout.write('\n');
        } else {
          // Procesar sin streaming
          const response = await agent.processMessageComplete(message.payload, message.promptType);
          log(COLORS.green, '🤖 Respuesta:');
          console.log(response);
        }

        if (process.send) {
          process.send({ type: 'complete' });
        }
      } catch (error: any) {
        log(COLORS.red, `💥 Error fatal: ${error.message}`);
        if (process.send) {
          process.send({ type: 'error', error: error.message });
        }
      }
    } else if (message.type === 'command') {
      // Ejecutar comando directo
      const agent = getAgent();
      const result = await agent.executeCommand(message.command);
      console.log(JSON.stringify(result, null, 2));
    } else if (message.type === 'version') {
      // Actualizar versión
      const agent = getAgent();
      const result = await agent.updateVersion(message.version, message.description);
      console.log(JSON.stringify(result, null, 2));
    } else if (message.type === 'whatsapp') {
      // Enviar mensaje WhatsApp
      const agent = getAgent();
      const result = await agent.sendWhatsApp(message.message, message.target);
      console.log(JSON.stringify(result, null, 2));
    } else if (message.type === 'memory') {
      // Operaciones de memoria
      const mem = getMemory();
      if (message.action === 'get') {
        console.log(JSON.stringify(mem.recall(message.key), null, 2));
      } else if (message.action === 'set') {
        mem.remember(message.key, message.value);
        console.log(JSON.stringify({ success: true }, null, 2));
      } else if (message.action === 'preference') {
        mem.setPreference(message.key, message.value);
        console.log(JSON.stringify({ success: true }, null, 2));
      }
    } else if (message.type === 'shutdown') {
      log(COLORS.yellow, '🛑 Apagando agente...');
      process.exit(0);
    }
  });

  log(COLORS.green, '✅ XPE Agent listo y esperando mensajes');
}

// Ejecutar si es el proceso principal
main().catch((error) => {
  console.error('Error fatal:', error);
  process.exit(1);
});

export { main, getAgent, getMemory, getPrompt };
