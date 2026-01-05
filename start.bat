@echo off
REM ============================================
REM XPE Agent - Windows Launcher
REM Agente de IA autónomo - Inicio rápido
REM ============================================

echo.
echo 🚀 Iniciando XPE Agent...
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

REM Verificar que Node.js está instalado
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ Node.js no está instalado. Por favor instala Node.js 18+
    pause
    exit /b 1
)

REM Verificar que npm está instalado
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo ❌ npm no está instalado
    pause
    exit /b 1
)

REM Verificar que Ollama está ejecutándose
echo 📍 Verificando Ollama...
curl -s http://localhost:11434/api/tags >nul 2>&1
if %errorlevel% neq 0 (
    echo ⚠️  Ollama no está ejecutándose en http://localhost:11434
    echo 💡 Inicia Ollama con: ollama serve
    echo.
    set /p continue="¿Continuar de todos modos? (s/n): "
    if not "%continue%"=="s" if not "%continue%"=="S" (
        exit /b 1
    )
) else (
    echo ✅ Ollama está ejecutándose
)

REM Verificar que las dependencias están instaladas
if not exist "node_modules" (
    echo 📦 Instalando dependencias...
    npm install
    echo ✅ Dependencias instaladas
)

REM Verificar que el código está compilado
if not exist "dist" (
    echo 🔨 Compilando TypeScript...
    npm run build
    echo ✅ Compilación completada
)

echo.
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo 🤖 XPE Agent - Menú de Inicio
echo ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
echo.
echo 1. 🤖 Iniciar Agente (Chat Interactivo)
echo 2. 📝 Iniciar Agente (Modo Script)
echo 3. 🔧 Ver Estado del Sistema
echo 4. ℹ️  Ver Información
echo 5. 🚪 Salir
echo.
set /p option="Selecciona una opción (1-5): "

if "%option%"=="1" (
    echo.
    echo 🎯 Iniciando chat interactivo...
    echo Escribe 'exit' para salir
    echo.
    node dist/index.js
) else if "%option%"=="2" (
    echo.
    echo 📝 Modo script - Espera instrucciones...
    node dist/index.js
) else if "%option%"=="3" (
    echo.
    echo 📋 Estado del sistema:
    echo Node.js: %node%
    echo Directorio: %cd%
) else if "%option%"=="4" (
    echo.
    echo ℹ️  Información del sistema:
    echo Node.js: %node%
    echo Plataforma: Windows
    echo Directorio: %cd%
) else if "%option%"=="5" (
    echo 👋 ¡Hasta luego!
) else (
    echo ❌ Opción inválida
)

pause
