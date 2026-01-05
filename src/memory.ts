/**
 * XPE Agent Memory System
 * Persistencia de contexto y aprendizaje
 */

import fs from 'fs-extra';
import path from 'path';

interface MemoryEntry {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

interface AgentMemory {
  version: string;
  conversations: Map<string, MemoryEntry[]>;
  longTermMemory: Map<string, any>;
  preferences: Map<string, any>;
  lastUpdated: string;
}

class AgentMemory {
  private memoryPath: string;
  private contextWindow: number = 50; // Últimos 50 mensajes en contexto

  constructor(memoryPath?: string) {
    this.memoryPath = memoryPath || path.join(process.cwd(), 'agent-memory.json');
    this.conversations = new Map();
    this.longTermMemory = new Map();
    this.preferences = new Map();
    this.lastUpdated = new Date().toISOString();
    this.load();
  }

  /**
   * Cargar memoria desde disco
   */
  async load(): Promise<void> {
    try {
      if (await fs.pathExists(this.memoryPath)) {
        const data = await fs.readJson(this.memoryPath);
        this.version = data.version || '0.0.0';
        this.lastUpdated = data.lastUpdated || this.lastUpdated;
        
        // Restaurar conversaciones
        if (data.conversations) {
          for (const [id, entries] of Object.entries(data.conversations)) {
            this.conversations.set(id, entries as MemoryEntry[]);
          }
        }

        // Restaurar memoria a largo plazo
        if (data.longTermMemory) {
          for (const [key, value] of Object.entries(data.longTermMemory)) {
            this.longTermMemory.set(key, value);
          }
        }

        // Restaurar preferencias
        if (data.preferences) {
          for (const [key, value] of Object.entries(data.preferences)) {
            this.preferences.set(key, value);
          }
        }
      }
    } catch (error) {
      console.error('[MEMORY] Error loading memory:', error);
    }
  }

  /**
   * Guardar memoria en disco
   */
  async save(): Promise<void> {
    try {
      const data = {
        version: this.version,
        lastUpdated: this.lastUpdated,
        conversations: Object.fromEntries(this.conversations),
        longTermMemory: Object.fromEntries(this.longTermMemory),
        preferences: Object.fromEntries(this.preferences),
      };
      await fs.writeJson(this.memoryPath, data, { spaces: 2 });
    } catch (error) {
      console.error('[MEMORY] Error saving memory:', error);
    }
  }

  /**
   * Agregar mensaje a la conversación actual
   */
  addMessage(conversationId: string, role: 'user' | 'assistant' | 'system', content: string, metadata?: Record<string, any>): void {
    if (!this.conversations.has(conversationId)) {
      this.conversations.set(conversationId, []);
    }

    const conversation = this.conversations.get(conversationId)!;
    conversation.push({
      role,
      content,
      timestamp: new Date().toISOString(),
      metadata,
    });

    // Mantener solo los últimos N mensajes
    if (conversation.length > this.contextWindow * 2) {
      this.conversations.set(conversationId, conversation.slice(-this.contextWindow));
    }

    this.lastUpdated = new Date().toISOString();
    this.save();
  }

  /**
   * Obtener contexto de conversación
   */
  getContext(conversationId: string): MemoryEntry[] {
    return this.conversations.get(conversationId) || [];
  }

  /**
   * Guardar información en memoria a largo plazo
   */
  remember(key: string, value: any): void {
    this.longTermMemory.set(key, value);
    this.lastUpdated = new Date().toISOString();
    this.save();
  }

  /**
   * Recuperar información de memoria a largo plazo
   */
  recall(key: string): any {
    return this.longTermMemory.get(key);
  }

  /**
   * Olvidar información específica
   */
  forget(key: string): boolean {
    const result = this.longTermMemory.delete(key);
    if (result) this.save();
    return result;
  }

  /**
   * Guardar preferencia del usuario
   */
  setPreference(key: string, value: any): void {
    this.preferences.set(key, value);
    this.lastUpdated = new Date().toISOString();
    this.save();
  }

  /**
   * Obtener preferencia del usuario
   */
  getPreference(key: string, defaultValue?: any): any {
    return this.preferences.get(key) ?? defaultValue;
  }

  /**
   * Obtener todas las preferencias como objeto
   */
  getAllPreferences(): Record<string, any> {
    return Object.fromEntries(this.preferences);
  }

  /**
   * Resumir conversación para contexto eficiente
   */
  summarizeConversation(conversationId: string): string {
    const conversation = this.conversations.get(conversationId) || [];
    if (conversation.length === 0) return 'No hay conversación previa.';

    const lastMessages = conversation.slice(-10);
    const summary = lastMessages
      .map(m => `[${m.role}]: ${m.content.substring(0, 100)}${m.content.length > 100 ? '...' : ''}`)
      .join('\n');

    return `Resumen de conversación reciente:\n${summary}`;
  }

  /**
   * Obtener todas las memorias como array (para contexto del agente)
   */
  getAllAsContext(): string[] {
    const context: string[] = [];

    // Preferencias del usuario
    const prefs = this.getAllPreferences();
    if (Object.keys(prefs).length > 0) {
      context.push(`Preferencias del usuario: ${JSON.stringify(prefs)}`);
    }

    // Memorias importantes
    const memories = Array.from(this.longTermMemory.entries());
    if (memories.length > 0) {
      const memorySummary = memories
        .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
        .join('\n');
      context.push(`Memorias del agente:\n${memorySummary}`);
    }

    return context;
  }

  /**
   * Actualizar versión del agente
   */
  setVersion(version: string): void {
    this.version = version;
    this.lastUpdated = new Date().toISOString();
    this.save();
  }

  /**
   * Obtener versión actual
   */
  getVersion(): string {
    return this.version;
  }

  /**
   * Limpiar conversación específica
   */
  clearConversation(conversationId: string): void {
    this.conversations.delete(conversationId);
    this.save();
  }

  /**
   * Limpiar toda la memoria
   */
  clearAll(): void {
    this.conversations.clear();
    this.longTermMemory.clear();
    this.preferences.clear();
    this.lastUpdated = new Date().toISOString();
    this.save();
  }

  /**
   * Exportar memoria completa
   */
  export(): object {
    return {
      version: this.version,
      lastUpdated: this.lastUpdated,
      conversations: Object.fromEntries(this.conversations),
      longTermMemory: Object.fromEntries(this.longTermMemory),
      preferences: Object.fromEntries(this.preferences),
    };
  }
}

// Singleton instance
let memoryInstance: AgentMemory | null = null;

export function getMemory(memoryPath?: string): AgentMemory {
  if (!memoryInstance) {
    memoryInstance = new AgentMemory(memoryPath);
  }
  return memoryInstance;
}

export { AgentMemory, type MemoryEntry, type AgentMemory as AgentMemoryType };
