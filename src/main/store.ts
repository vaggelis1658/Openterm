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
  createdAt: number
  updatedAt: number
}

export interface AppSettings {
  ai: {
    provider: 'openai' | 'ollama'
    apiKey: string
    apiUrl: string
    model: string
    ollamaUrl: string
  }
  relaxedMode: boolean
}

const DEFAULT_SETTINGS: AppSettings = {
  ai: {
    provider: 'openai',
    apiKey: '',
    apiUrl: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    ollamaUrl: 'http://localhost:11434'
  },
  relaxedMode: false
}

export class Store {
  private store: any = null

  private async getStore(): Promise<any> {
    if (this.store) return this.store
    const ElectronStore = (await import('electron-store')).default
    this.store = new ElectronStore({
      name: 'openterm-data',
      defaults: {
        connections: [] as ConnectionConfig[],
        settings: DEFAULT_SETTINGS
      }
    })
    return this.store
  }

  async getConnections(): Promise<ConnectionConfig[]> {
    const store = await this.getStore()
    return store.get('connections') as ConnectionConfig[]
  }

  async saveConnection(conn: ConnectionConfig): Promise<void> {
    const store = await this.getStore()
    const connections = store.get('connections') as ConnectionConfig[]
    const idx = connections.findIndex((c: ConnectionConfig) => c.id === conn.id)
    if (idx >= 0) {
      connections[idx] = { ...conn, updatedAt: Date.now() }
    } else {
      connections.push({ ...conn, createdAt: Date.now(), updatedAt: Date.now() })
    }
    store.set('connections', connections)
  }

  async deleteConnection(id: string): Promise<void> {
    const store = await this.getStore()
    const connections = (store.get('connections') as ConnectionConfig[]).filter(
      (c: ConnectionConfig) => c.id !== id
    )
    store.set('connections', connections)
  }

  async getSettings(): Promise<AppSettings> {
    const store = await this.getStore()
    return store.get('settings') as AppSettings
  }

  async saveSettings(settings: AppSettings): Promise<void> {
    const store = await this.getStore()
    store.set('settings', settings)
  }
}

