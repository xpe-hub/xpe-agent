# XPE Agent 🤖

**Agente de IA autónomo con acceso sin restricciones al sistema**

![XPE Agent](https://img.shields.io/badge/XPE-Agent-v0.0.1-green)
![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0-blue)
![License](https://img.shields.io/badge/License-MIT-yellow)

## Descripción

XPE Agent es un agente de IA autónomo diseñado para el Panel XPE Bot. Tiene acceso completo y sin restricciones al sistema, permitiéndole:

- ✏️ Modificar cualquier archivo del proyecto
- 💻 Ejecutar comandos en la shell del sistema
- 🔄 Gestionar repositorios Git
- 📱 Enviar notificaciones por WhatsApp
- 🧠 Recordar interacciones y aprender
- 🚀 Automatizar tareas de desarrollo y operaciones

## Instalación

```bash
# Clonar el repositorio
git clone https://github.com/xpe-hub/xpe-agent.git
cd xpe-agent

# Instalar dependencias
npm install

# Compilar
npm run build

# Ejecutar
npm start
```

## Configuración

### Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto:

```env
# URL de Ollama (por defecto: http://localhost:11434)
OLLAMA_URL=http://localhost:11434

# Modelo de Ollama (por defecto: llama3:latest)
OLLAMA_MODEL=llama3:latest

# Token de GitHub (para operaciones de repositorio)
GITHUB_TOKEN=ghp_tu_token_aqui

# Ruta del bot XPE
XPE_BOT_PATH=/ruta/al/bot
```

## Uso

### Como Módulo

```typescript
import { getAgent } from './src/core';

const agent = getAgent();

// Procesar mensaje con streaming
for await (const event of agent.processMessage('Crea un archivo test.js')) {
  console.log(event);
}

// Procesar sin streaming
const response = await agent.processMessageComplete('¿Cuál es el estado del sistema?');
console.log(response);

// Enviar notificación WhatsApp
await agent.sendWhatsApp('El sistema está listo', 'admin');

// Actualizar versión
await agent.updateVersion('0.1.0', 'Nueva funcionalidad');
```

### Como Proceso Independiente

El agente puede ejecutarse como proceso hijo de Electron y comunicarse mediante IPC:

```javascript
const { fork } = require('child_process');
const agentProcess = fork('./xpe-agent/dist/index.js');

// Enviar mensaje
agentProcess.send({ type: 'prompt', payload: 'Hola agente' });

// Escuchar respuestas
agentProcess.on('message', (message) => {
  console.log('Evento:', message);
});
```

## Herramientas Disponibles

| Herramienta | Descripción | Ejemplo |
|-------------|-------------|---------|
| `execute_shell` | Ejecutar comandos en shell | `npm install` |
| `file_system` | Leer, escribir, listar archivos | `read package.json` |
| `git_manager` | Gestionar Git | `commit "Update"`, `push` |
| `whatsapp_notify` | Enviar mensajes WhatsApp | `notify admin "Hola"` |
| `self_update` | Actualizar versión del agente | `update version "0.2.0"` |
| `system_info` | Información del sistema | `info memory` |
| `github_manager` | Gestionar repositorios GitHub | `create-repo mi-repo` |
| `package_manager` | Gestionar paquetes npm | `install axios` |

## Integración con Panel XPE

El agente está integrado en el Panel XPE Bot como módulo principal. Para acceder:

1. Abre el Panel XPE
2. Navega a la sección "XPE Agent"
3. Chatea con el agente o usa comandos directos

## Memoria y Aprendizaje

XPE Agent mantiene memoria persistente de:

- 📝 Historial de conversaciones
- 🧠 Conocimientos importantes
- ⚙️ Preferencias del usuario
- 📊 Contexto del sistema

La memoria se guarda en `agent-memory.json` y se carga automáticamente.

## Control de Versiones

El agente gestiona su propia versión. Puedes:

- Preguntar: "¿En qué versión estás?"
- Actualizar: "Actualiza tu versión a 0.2.0"
- Ver historial: "Muéstrame el historial de cambios"

## Seguridad

⚠️ **ADVERTENCIA**: Este agente tiene acceso sin restricciones al sistema. Úsalo solo en entornos controlados y con autorización.

El agente está diseñado para:
- Entornos de desarrollo local
- Servidores controlados por el propietario
- Sistemas de automatización autorizados

## Contribuir

1. Fork el repositorio
2. Crea tu rama de características (`git checkout -b feature/amazing-feature`)
3. Commit tus cambios (`git commit -m 'Add amazing feature'`)
4. Push a la rama (`git push origin feature/amazing-feature`)
5. Abre un Pull Request

## Licencia

Este proyecto está bajo la Licencia MIT. Ver el archivo [LICENSE](LICENSE) para más detalles.

## Contacto

- **Creador:** xpe-hub
- **GitHub:** https://github.com/xpe-hub/xpe-agent
- **Panel XPE:** https://github.com/xpe-hub/xpe-bot-panel

---

**XPE Agent** - Potenciado por Vercel AI SDK + Ollama 🚀
