/**
 * XPE Agent Core
 * Motor principal del agente con integración Vercel AI SDK + Ollama/Groq
 */

import { streamText, generateText, tool, createOllama, createGroq } from 'ai';
import { getMemory, type MemoryEntry } from './memory';
import { getPrompt, type PromptType } from './system';
import * as tools from './tools';
import { z } from 'zod';

// Detectar proveedor de IA
const AI_PROVIDER = process.env.AI_PROVIDER || 'ollama';

// Configuración de Ollama
const ollamaProvider = createOllama({
  baseURL: process.env.OLLAMA_URL || 'http://localhost:11434',
});

// Configuración de Groq
const groqProvider = createGroq({
  apiKey: process.env.GROQ_API_KEY || '',
});

// Seleccionar proveedor y modelo
function getProviderAndModel() {
  const modelName = process.env.OLLAMA_MODEL || 'llama3:latest';
  const groqModel = process.env.GROQ_MODEL || 'llama-3.1-70b-versatile';
  
  if (AI_PROVIDER === 'groq') {
    return { provider: groqProvider, model: groqModel };
  }
  return { provider: ollamaProvider, model: modelName };
}

const { provider: aiProvider, model: defaultModel } = getProviderAndModel();

// Modelo por defecto
const DEFAULT_MODEL = defaultModel;

// Tipos de eventos del agente
export type AgentEventType = 
  | 'thinking'
  | 'tool-start'
  | 'tool-result'
  | 'text'
  | 'error'
  | 'complete';

export interface AgentEvent {
  type: AgentEventType;
  timestamp: string;
  data: any;
}

export type EventCallback = (event: AgentEvent) => void;

class XPEAgentCore {
  private memory: ReturnType<typeof getMemory>;
  private eventCallbacks: Set<EventCallback>;
  private conversationId: string;
  private model: string;
  private maxSteps: number;

  constructor(conversationId: string = 'default') {
    this.memory = getMemory();
    this.eventCallbacks = new Set();
    this.conversationId = conversationId;
    this.model = DEFAULT_MODEL;
    this.maxSteps = 15; // Máximo de pasos de razonamiento
  }

  /**
   * Registrar callback para eventos
   */
  onEvent(callback: EventCallback): () => void {
    this.eventCallbacks.add(callback);
    return () => this.eventCallbacks.delete(callback);
  }

  /**
   * Emitir evento a todos los callbacks
   */
  private emit(event: AgentEvent): void {
    this.eventCallbacks.forEach(cb => cb(event));
  }

  /**
   * Convertir herramientas al formato de Vercel AI SDK
   */
  private createToolDefinitions() {
    return {
      execute_shell: tool({
        description: tools.executeShell.parameters.shape.description,
        parameters: tools.executeShell.parameters.shape,
        execute: tools.executeShell.execute,
      }),
      file_system: tool({
        description: tools.fileSystem.parameters.shape.description,
        parameters: tools.fileSystem.parameters.shape,
        execute: tools.fileSystem.execute,
      }),
      git_manager: tool({
        description: tools.gitManager.parameters.shape.description,
        parameters: tools.gitManager.parameters.shape,
        execute: tools.gitManager.execute,
      }),
      whatsapp_notify: tool({
        description: tools.whatsappNotify.parameters.shape.description,
        parameters: tools.whatsappNotify.parameters.shape,
        execute: tools.whatsappNotify.execute,
      }),
      self_update: tool({
        description: tools.selfUpdate.parameters.shape.description,
        parameters: tools.selfUpdate.parameters.shape,
        execute: tools.selfUpdate.execute,
      }),
      system_info: tool({
        description: tools.systemInfo.parameters.shape.description,
        parameters: tools.systemInfo.parameters.shape,
        execute: tools.systemInfo.execute,
      }),
      github_manager: tool({
        description: tools.githubManager.parameters.shape.description,
        parameters: tools.githubManager.parameters.shape,
        execute: tools.githubManager.execute,
      }),
      package_manager: tool({
        description: tools.packageManager.parameters.shape.description,
        parameters: tools.packageManager.parameters.shape,
        execute: tools.packageManager.execute,
      }),
    };
  }

  /**
   * Procesar mensaje con streaming
   */
  async *processMessage(
    userMessage: string,
    promptType: PromptType = 'general'
  ): AsyncGenerator<AgentEvent, void, unknown> {
    // Emitir evento de pensamiento
    this.emit({
      type: 'thinking',
      timestamp: new Date().toISOString(),
      data: { message: 'Procesando mensaje...' },
    });

    // Guardar mensaje del usuario en memoria
    this.memory.addMessage(this.conversationId, 'user', userMessage);

    // Obtener contexto de conversación
    const conversationHistory = this.memory.getContext(this.conversationId);

    // Generar prompt del sistema
    const systemPrompt = getPrompt(promptType);

    try {
      // Usar Vercel AI SDK con Ollama
      const result = await streamText({
        model: aiProvider(this.model),
        system: systemPrompt,
        messages: [
          ...conversationHistory.map((entry: MemoryEntry) => ({
            role: entry.role,
            content: entry.content,
          })),
          { role: 'user', content: userMessage },
        ],
        tools: this.createToolDefinitions(),
        maxSteps: this.maxSteps,
        onFinish: (result) => {
          // Guardar respuesta en memoria
          this.memory.addMessage(
            this.conversationId,
            'assistant',
            result.text
          );
          
          this.emit({
            type: 'complete',
            timestamp: new Date().toISOString(),
            data: { success: true },
          });
        },
        onStepFinish: (step) => {
          // Emitir herramientas usadas
          if (step.toolCalls && step.toolCalls.length > 0) {
            step.toolCalls.forEach((toolCall) => {
              this.emit({
                type: 'tool-start',
                timestamp: new Date().toISOString(),
                data: {
                  tool: toolCall.toolName,
                  input: toolCall.input,
                },
              });
            });
          }

          // Emitir resultados de herramientas
          if (step.toolResults && step.toolResults.length > 0) {
            step.toolResults.forEach((toolResult) => {
              this.emit({
                type: 'tool-result',
                timestamp: new Date().toISOString(),
                data: {
                  tool: toolResult.toolName,
                  result: toolResult.result,
                },
              });
            });
          }
        },
      });

      // Stream de texto
      for await (const textPart of result.textStream) {
        this.emit({
          type: 'text',
          timestamp: new Date().toISOString(),
          data: { text: textPart },
        });
        yield { type: 'text', timestamp: new Date().toISOString(), data: { text: textPart } };
      }
    } catch (error: any) {
      this.emit({
        type: 'error',
        timestamp: new Date().toISOString(),
        data: { error: error.message },
      });
      throw error;
    }
  }

  /**
   * Procesar mensaje sin streaming (respuesta completa)
   */
  async processMessageComplete(
    userMessage: string,
    promptType: PromptType = 'general'
  ): Promise<string> {
    this.emit({
      type: 'thinking',
      timestamp: new Date().toISOString(),
      data: { message: 'Procesando mensaje...' },
    });

    this.memory.addMessage(this.conversationId, 'user', userMessage);
    const conversationHistory = this.memory.getContext(this.conversationId);
    const systemPrompt = getPrompt(promptType);

    try {
      const result = await generateText({
        model: aiProvider(this.model),
        system: systemPrompt,
        messages: [
          ...conversationHistory.map((entry: MemoryEntry) => ({
            role: entry.role,
            content: entry.content,
          })),
          { role: 'user', content: userMessage },
        ],
        tools: this.createToolDefinitions(),
        maxSteps: this.maxSteps,
      });

      this.memory.addMessage(this.conversationId, 'assistant', result.text);
      
      this.emit({
        type: 'complete',
        timestamp: new Date().toISOString(),
        data: { success: true },
      });

      return result.text;
    } catch (error: any) {
      this.emit({
        type: 'error',
        timestamp: new Date().toISOString(),
        data: { error: error.message },
      });
      throw error;
    }
  }

  /**
   * Ejecutar comando directo del shell
   */
  async executeCommand(command: string): Promise<any> {
    return tools.executeShell.execute({ command });
  }

  /**
   * Ejecutar operación de archivo
   */
  async fileOperation(operation: string, path: string, content?: string): Promise<any> {
    return tools.fileSystem.execute({ operation, path, content });
  }

  /**
   * Enviar notificación WhatsApp
   */
  async sendWhatsApp(message: string, target: string = 'admin'): Promise<any> {
    return tools.whatsappNotify.execute({ message, target });
  }

  /**
   * Actualizar versión del agente
   */
  async updateVersion(version: string, description?: string): Promise<any> {
    return tools.selfUpdate.execute({ version, description });
  }

  /**
   * Cambiar modelo de IA
   */
  setModel(model: string): void {
    this.model = model;
  }

  /**
   * Cambiar ID de conversación
   */
  setConversationId(id: string): void {
    this.conversationId = id;
  }

  /**
   * Obtener historial de conversación
   */
  getHistory(): MemoryEntry[] {
    return this.memory.getContext(this.conversationId);
  }

  /**
   * Limpiar conversación
   */
  clearConversation(): void {
    this.memory.clearConversation(this.conversationId);
  }

  /**
   * Recordar información
   */
  remember(key: string, value: any): void {
    this.memory.remember(key, value);
  }

  /**
   * Recordar información del usuario
   */
  setPreference(key: string, value: any): void {
    this.memory.setPreference(key, value);
  }
}

// Singleton
let agentInstance: XPEAgentCore | null = null;

export function getAgent(conversationId?: string): XPEAgentCore {
  if (!agentInstance) {
    agentInstance = new XPEAgentCore(conversationId);
  }
  if (conversationId) {
    agentInstance.setConversationId(conversationId);
  }
  return agentInstance;
}

export { XPEAgentCore };
