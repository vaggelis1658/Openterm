import { app, BrowserWindow, ipcMain, shell, safeStorage, dialog } from 'electron'
import { join } from 'path'
import { readFileSync } from 'fs'
import { SSHManager } from './ssh-manager'
import { Store } from './store'
import { AiService } from './ai-service'

let mainWindow: BrowserWindow | null = null
const sshManager = new SSHManager()
const store = new Store()
const aiService = new AiService()

function createWindow(): void {
  const isMac = process.platform === 'darwin'

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: isMac,
    icon: join(__dirname, '../../resources/icon.png'),
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    trafficLightPosition: isMac ? { x: 15, y: 15 } : undefined,
    backgroundColor: '#1a1a2e',
    vibrancy: isMac ? 'sidebar' : undefined,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// --- IPC: Window Controls ---
ipcMain.on('window:minimize', () => mainWindow?.minimize())
ipcMain.on('window:maximize', () => {
  if (mainWindow?.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow?.maximize()
  }
})
ipcMain.on('window:close', () => mainWindow?.close())
ipcMain.handle('window:isMaximized', () => mainWindow?.isMaximized() ?? false)
ipcMain.handle('window:getPlatform', () => process.platform)
ipcMain.handle('window:getSize', () => mainWindow?.getSize() ?? [1200, 800])
ipcMain.on('window:setSize', (_e, width: number, height: number) => {
  if (!mainWindow || mainWindow.isMaximized()) return
  const [, currentH] = mainWindow.getSize()
  mainWindow.setSize(Math.max(900, width), Math.max(600, height || currentH), true)
})

// --- IPC: Store ---
ipcMain.handle('store:getConnections', () => store.getConnections())
ipcMain.handle('store:saveConnection', (_e, conn) => store.saveConnection(conn))
ipcMain.handle('store:deleteConnection', (_e, id) => store.deleteConnection(id))
ipcMain.handle('store:getSettings', () => store.getSettings())
ipcMain.handle('store:saveSettings', (_e, settings) => store.saveSettings(settings))
ipcMain.handle('store:getSkills', () => store.getSkills())
ipcMain.handle('store:saveSkill', (_e, skill) => store.saveSkill(skill))
ipcMain.handle('store:deleteSkill', (_e, id) => store.deleteSkill(id))
ipcMain.handle('store:importSkills', (_e, skills) => store.importSkills(skills))

// --- IPC: Chat History ---
ipcMain.handle('chatHistory:getAll', () => store.getChatHistory())
ipcMain.handle('chatHistory:save', (_e, entry) => store.saveChatSession(entry))
ipcMain.handle('chatHistory:delete', (_e, sessionKey) => store.deleteChatSession(sessionKey))
ipcMain.handle('chatHistory:clearAll', () => store.clearAllChatHistory())

// --- IPC: SSH ---
ipcMain.handle('ssh:connect', async (_e, connConfig) => {
  try {
    const sessionId = await sshManager.connect(connConfig)
    return { success: true, sessionId }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('ssh:disconnect', (_e, sessionId: string) => {
  sshManager.disconnect(sessionId)
  return { success: true }
})

ipcMain.on('ssh:data', (_e, sessionId: string, data: string) => {
  sshManager.write(sessionId, data)
})

ipcMain.on('ssh:resize', (_e, sessionId: string, cols: number, rows: number) => {
  sshManager.resize(sessionId, cols, rows)
})

// Forward SSH data to renderer
sshManager.on('data', (sessionId: string, data: string) => {
  mainWindow?.webContents.send('ssh:data', sessionId, data)
})

sshManager.on('close', (sessionId: string) => {
  mainWindow?.webContents.send('ssh:close', sessionId)
})

sshManager.on('error', (sessionId: string, error: string) => {
  mainWindow?.webContents.send('ssh:error', sessionId, error)
})

// --- IPC: AI ---
ipcMain.handle('ai:chat', async (_e, messages: any[], settings: any, options?: any) => {
  try {
    const reply = await aiService.chat(messages, settings, options)
    return { success: true, reply }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

// AI Streaming
ipcMain.handle('ai:chatStream', async (_e, messages: any[], settings: any, streamId: string, options?: any) => {
  if (!mainWindow) return { success: false, error: 'No window' }
  try {
    await aiService.chatStream(messages, settings, mainWindow, streamId, options)
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

// Agent Management
ipcMain.handle('ai:getAgents', () => {
  return aiService.getAgentManager().getVisibleAgents()
})

ipcMain.handle('ai:getAgentConfig', (_e, agentId: string) => {
  return aiService.getAgentManager().getAgent(agentId)
})

// Token Info
ipcMain.handle('ai:getTokenInfo', (_e, messages: any[], modelName: string) => {
  return aiService.getTokenInfo(messages, modelName)
})

// Manual Compaction
ipcMain.handle('ai:compact', async (_e, messages: any[], settings: any) => {
  try {
    const result = await aiService.manualCompact(messages, settings)
    return { success: true, ...result }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

// --- IPC: SSH Exec ---
ipcMain.handle('ssh:exec', async (_e, sessionId: string, command: string) => {
  try {
    const output = await sshManager.exec(sessionId, command)
    return { success: true, output }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

// --- IPC: Encryption ---
ipcMain.handle('encrypt', (_e, text: string) => {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(text).toString('base64')
  }
  return text
})

ipcMain.handle('decrypt', (_e, encrypted: string) => {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
  }
  return encrypted
})

// --- IPC: File Dialog ---
ipcMain.handle('dialog:openFile', async (_e, options: any) => {
  if (!mainWindow) return { canceled: true, filePaths: [] }
  const result = await dialog.showOpenDialog(mainWindow, options)
  return result
})

ipcMain.handle('dialog:selectDirectory', async () => {
  if (!mainWindow) return { canceled: true, filePaths: [] }
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory']
  })
  return result
})

// --- IPC: SFTP ---
ipcMain.handle('sftp:ls', async (_e, sessionId: string, path: string) => {
  try {
    const data = await sshManager.sftpLs(sessionId, path)
    return { success: true, data }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('sftp:download', async (_e, sessionId: string, remotePath: string, localPath: string) => {
  try {
    await sshManager.sftpDownload(sessionId, remotePath, localPath)
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

ipcMain.handle('sftp:upload', async (_e, sessionId: string, localPath: string, remotePath: string) => {
  try {
    await sshManager.sftpUpload(sessionId, localPath, remotePath)
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

// --- IPC: Read file as data URL ---
ipcMain.handle('file:readAsDataUrl', async (_e, filePath: string) => {
  try {
    const data = readFileSync(filePath)
    const ext = filePath.split('.').pop()?.toLowerCase() || 'png'
    const mimeMap: Record<string, string> = {
      png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
      gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml'
    }
    const mime = mimeMap[ext] || 'image/png'
    return `data:${mime};base64,${data.toString('base64')}`
  } catch {
    return null
  }
})

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  sshManager.disconnectAll()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
