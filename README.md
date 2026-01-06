# 🤖 XPE Agent GUI

**Aplicación de escritorio para crear releases en GitHub con DLLs, EXEs y cualquier archivo.**

![XPE Agent](https://img.shields.io/badge/XPE-Agent-GUI-green)
![Electron](https://img.shields.io/badge/Electron-30.0-blue)
![License](https://img.shields.io/badge/License-MIT-yellow)

## ✨ Características

- 📦 **Crear Releases** - Sube DLLs, EXEs, ZIPs a GitHub Releases
- 🔒 **Totalmente Local** - Funciona en tu PC, sin servidores externos
- 🎨 **Interfaz Gráfica** - Aplicación de escritorio simple y funcional
- 🐙 **GitHub Integration** - Gestión completa de releases

## 🚀 Instalación y Uso

### Requisitos
- Windows 10/11
- Node.js 18+
- GitHub Token

### Paso 1: Instalar Dependencias
```batch
npm install
```

### Paso 2: Ejecutar
```batch
npm start
```

### Paso 3: Compilar a EXE (Opcional)
```batch
npm run build
```

Esto creará un archivo `.exe` instalable en la carpeta `dist/`.

## ⚙️ Configuración

1. Abre XPE Agent GUI
2. Ingresa tu **GitHub Token** (con permisos `repo`)
3. Clic en "Guardar"

### Crear GitHub Token
1. Ve a: https://github.com/settings/tokens
2. Clic en "Generate new token (classic)"
3. Selecciona permisos: `repo` (control total de repositorios)
4. Copia el token y pégalo en XPE Agent

## 📦 Crear un Release

1. Ingresa el **Propietario** (ej: `xpe-hub`)
2. Ingresa el **Repositorio** (ej: `mi-proyecto`)
3. Ingresa el **Tag** (ej: `v1.0.0`)
4. Ingresa el **Nombre** (ej: `Mi Proyecto v1.0.0`)
5. Selecciona el **Archivo** (DLL, EXE, ZIP, etc.)
6. Escribe la **Descripción**
7. Clic en **"Crear Release"**

## 📋 Estructura

```
xpe-agent-gui/
├── main.js          # Proceso principal de Electron
├── index.html       # Interfaz gráfica
├── preload.js       # Comunicación segura IPC
├── package.json     # Dependencias y scripts
├── config.json      # Configuración (token guardado)
└── README.md        # Documentación
```

## 🔧 Dependencias

- **electron** - Framework de aplicación de escritorio
- **electron-builder** - Compilador de ejecutables
- **octokit** - API de GitHub

## 🏗️ Compilar EXE

Para crear un instalador `.exe`:

```batch
# Instalar electron-builder si no está
npm install electron-builder --save-dev

# Compilar para Windows
npm run build:win
```

El ejecutable se creará en: `dist/win-unpacked/XPE Agent.exe`

## 🔒 Seguridad

- El token se guarda localmente en `config.json`
- No se envía a ningún servidor externo
- Solo se usa para interactuar con la GitHub API

## 📞 Soporte

- **GitHub:** https://github.com/xpe-hub/xpe-agent

---

**XPE Agent GUI** - Tu herramienta local para gestionar releases en GitHub 🚀
