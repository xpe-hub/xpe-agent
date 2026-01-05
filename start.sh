#!/bin/bash
# ============================================
# XPE Agent - Launcher Script
# Agente de IA autónomo - Inicio rápido
# ============================================

echo "🚀 Iniciando XPE Agent..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Verificar que Node.js está instalado
if ! command -v node &> /dev/null; then
    echo "❌ Node.js no está instalado. Por favor instala Node.js 18+"
    exit 1
fi

# Verificar que npm está instalado
if ! command -v npm &> /dev/null; then
    echo "❌ npm no está instalado"
    exit 1
fi

# Verificar que Ollama está ejecutándose
echo "📍 Verificando Ollama..."
if ! curl -s http://localhost:11434/api/tags &> /dev/null; then
    echo "⚠️  Ollama no está ejecutándose en http://localhost:11434"
    echo "💡 Inicia Ollama con: ollama serve"
    echo ""
    read -p "¿Continuar de todos modos? (s/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Ss]$ ]]; then
        exit 1
    fi
else
    echo "✅ Ollama está ejecutándose"
fi

# Verificar que las dependencias están instaladas
if [ ! -d "node_modules" ]; then
    echo "📦 Instalando dependencias..."
    npm install
    echo "✅ Dependencias instaladas"
fi

# Verificar que el código está compilado
if [ ! -d "dist" ]; then
    echo "🔨 Compilando TypeScript..."
    npm run build
    echo "✅ Compilación completada"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🤖 XPE Agent - Menú de Inicio"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. 🤖 Iniciar Agente (Chat Interactivo)"
echo "2. 📝 Iniciar Agente (Modo Script)"
echo "3. 🔧 Ver Logs del Sistema"
echo "4. ℹ️  Ver Información del Sistema"
echo "5. 🚪 Salir"
echo ""
read -p "Selecciona una opción (1-5): " option

case $option in
    1)
        echo ""
        echo "🎯 Iniciando chat interactivo..."
        echo "Escribe 'exit' para salir"
        echo ""
        node dist/index.js
        ;;
    2)
        echo ""
        echo "📝 Modo script - Espera instrucciones..."
        node dist/index.js
        ;;
    3)
        echo ""
        echo "📋 Logs del sistema:"
        if [ -f "agent-memory.json" ]; then
            cat agent-memory.json | head -100
        else
            echo "No hay logs disponibles aún"
        fi
        ;;
    4)
        echo ""
        echo "ℹ️  Información del sistema:"
        echo "Node.js: $(node -v)"
        echo "Plataforma: $(uname -s)"
        echo "Directorio: $(pwd)"
        echo "Versión del agente: $(grep '"version":' package.json | cut -d'"' -f4)"
        ;;
    5)
        echo "👋 ¡Hasta luego!"
        exit 0
        ;;
    *)
        echo "❌ Opción inválida"
        exit 1
        ;;
esac
