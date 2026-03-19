import { contextBridge, ipcRenderer } from 'electron'

export interface ElectronAPI {
  ssh: {
    connect: (config: any) => Promise<{ success: boolean; sessionId?: string; error?: string }>
    disconnect: (sessionId: string) => Promise<{ success: boolean }>
    sendData: (sessionId: string, data: string) => void
    resize: (sessionId: string, cols: number, rows: number) => void
    exec: (sessionId: string, command: string) => Promise<{ success: boolean; output?: string; error?: string }>
    onData: (callback: (sessionId: string, data: string) => void) => () => void
    onClose: (callback: (sessionId: string) => void) => () => void
    onError: (callback: (sessionId: string, error: string) => void) => () => void
  }
  store: {
    getConnections: () => Promise<any[]>
    saveConnection: (conn: any) => Promise<void>
    deleteConnection: (id: string) => Promise<void>
    getSettings: () => Promise<any>
    saveSettings: (settings: any) => Promise<void>
  }
  ai: {
    chat: (messages: any[], settings: any) => Promise<{ success: boolean; reply?: string; error?: string }>
  }
  dialog: {
    openFile: (options: any) => Promise<{ canceled: boolean; filePaths: string[] }>
  }
  file: {
    readAsDataUrl: (filePath: string) => Promise<string | null>
  }
}

const api: ElectronAPI = {
  ssh: {
    connect: (config) => ipcRenderer.invoke('ssh:connect', config),
    disconnect: (sessionId) => ipcRenderer.invoke('ssh:disconnect', sessionId),
    sendData: (sessionId, data) => ipcRenderer.send('ssh:data', sessionId, data),
    resize: (sessionId, cols, rows) => ipcRenderer.send('ssh:resize', sessionId, cols, rows),
    exec: (sessionId, command) => ipcRenderer.invoke('ssh:exec', sessionId, command),
    onData: (callback) => {
      const handler = (_: any, sessionId: string, data: string) => callback(sessionId, data)
      ipcRenderer.on('ssh:data', handler)
      return () => ipcRenderer.removeListener('ssh:data', handler)
    },
    onClose: (callback) => {
      const handler = (_: any, sessionId: string) => callback(sessionId)
      ipcRenderer.on('ssh:close', handler)
      return () => ipcRenderer.removeListener('ssh:close', handler)
    },
    onError: (callback) => {
      const handler = (_: any, sessionId: string, error: string) => callback(sessionId, error)
      ipcRenderer.on('ssh:error', handler)
      return () => ipcRenderer.removeListener('ssh:error', handler)
    }
  },
  store: {
    getConnections: () => ipcRenderer.invoke('store:getConnections'),
    saveConnection: (conn) => ipcRenderer.invoke('store:saveConnection', conn),
    deleteConnection: (id) => ipcRenderer.invoke('store:deleteConnection', id),
    getSettings: () => ipcRenderer.invoke('store:getSettings'),
    saveSettings: (settings) => ipcRenderer.invoke('store:saveSettings', settings)
  },
  ai: {
    chat: (messages, settings) => ipcRenderer.invoke('ai:chat', messages, settings)
  },
  dialog: {
    openFile: (options) => ipcRenderer.invoke('dialog:openFile', options)
  },
  file: {
    readAsDataUrl: (filePath) => ipcRenderer.invoke('file:readAsDataUrl', filePath)
  }
}

contextBridge.exposeInMainWorld('electronAPI', api)
