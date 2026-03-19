export interface ConnectionConfig {
  id: string
  name: string
  host: string
  port: number
  username: string
  authType: 'password' | 'privateKey'
  password?: string
  privateKey?: string
  passphrase?: string
  group?: string
  bgImage?: string
  bgOpacity?: number
  createdAt?: number
  updatedAt?: number
}

export interface Session {
  id: string
  connectionId: string
  name: string
  host: string
  status: 'connecting' | 'connected' | 'disconnected' | 'error'
}

export interface AiMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface AiSettings {
  provider: 'openai' | 'ollama'
  apiKey: string
  apiUrl: string
  model: string
  ollamaUrl: string
}

export interface AppSettings {
  ai: AiSettings
  relaxedMode: boolean
}

// dangerous command patterns for relaxed mode
export const DANGEROUS_PATTERNS: RegExp[] = [
  /\brm\s+(-[a-zA-Z]*[rR]|--recursive)/,
  /\brm\s+-[a-zA-Z]*f/,
  /\bmkfs\b/,
  /\bformat\b/,
  /\bdd\s+if=/,
  /\bshutdown\b/,
  /\breboot\b/,
  /\bpoweroff\b/,
  /\binit\s+[06]\b/,
  /\biptables\s+-F/,
  /\bchmod\s+(-[a-zA-Z]*R|777)/,
  />\s*\/dev\/[sh]d/,
  /\bkill\s+-9\s+1\b/,
  /\bkillall\b/,
  /\bpasswd\b/,
  /\buserdel\b/,
  /\bgroupdel\b/,
  /\bmkswap\b/,
  /\bfdisk\b/,
  /\bparted\b/,
  /:(){ :|:& };:/
]

export function isDangerousCommand(cmd: string): boolean {
  return DANGEROUS_PATTERNS.some((pattern) => pattern.test(cmd))
}

export function extractCommands(text: string): string[] {
  const codeBlockRegex = /```(?:bash|sh|shell|zsh)?\s*\n([\s\S]*?)```/g
  const commands: string[] = []
  let match: RegExpExecArray | null
  while ((match = codeBlockRegex.exec(text)) !== null) {
    const block = match[1].trim()
    if (block) {
      commands.push(block)
    }
  }
  return commands
}

declare global {
  interface Window {
    electronAPI: {
      ssh: {
        connect: (config: any) => Promise<{ success: boolean; sessionId?: string; error?: string }>
        disconnect: (sessionId: string) => Promise<{ success: boolean }>
        sendData: (sessionId: string, data: string) => void
        resize: (sessionId: string, cols: number, rows: number) => void
        onData: (callback: (sessionId: string, data: string) => void) => () => void
        onClose: (callback: (sessionId: string) => void) => () => void
        onError: (callback: (sessionId: string, error: string) => void) => () => void
      }
      store: {
        getConnections: () => Promise<ConnectionConfig[]>
        saveConnection: (conn: ConnectionConfig) => Promise<void>
        deleteConnection: (id: string) => Promise<void>
        getSettings: () => Promise<AppSettings>
        saveSettings: (settings: AppSettings) => Promise<void>
      }
      ai: {
        chat: (
          messages: any[],
          settings: any
        ) => Promise<{ success: boolean; reply?: string; error?: string }>
      }
    }
  }
}
