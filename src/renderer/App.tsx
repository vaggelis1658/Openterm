import { useState, useEffect, useCallback, useRef } from 'react'
import {
  ConnectionConfig,
  Session,
  AiMessage,
  AppSettings,
  extractCommands,
  isDangerousCommand
} from './types'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { MonitorLeft, MonitorRight, useServerMetrics } from './components/ServerMonitor'

// ===========================
// COMPONENT: CommandBlock
// ===========================
function CommandBlock({
  command,
  relaxedMode,
  onExecute,
  autoExecuted
}: {
  command: string
  relaxedMode: boolean
  onExecute: (cmd: string) => void
  autoExecuted?: boolean
}) {
  const [executed, setExecuted] = useState(autoExecuted || false)
  const dangerous = isDangerousCommand(command)

  const handleExecute = () => {
    if (executed) return
    onExecute(command)
    setExecuted(true)
  }

  useEffect(() => {
    if (autoExecuted) setExecuted(true)
  }, [autoExecuted])

  return (
    <div className={`command-block ${dangerous ? 'dangerous' : ''}`}>
      <div className="command-block-header">
        <span className="command-block-lang">bash</span>
        {dangerous && (
          <span className="command-warning">⚠️ 危险命令</span>
        )}
        <div className="command-block-actions">
          {executed ? (
            <span className="execute-btn executed">✓ 已执行</span>
          ) : (
            <button
              className={`execute-btn ${dangerous ? 'danger' : 'primary'}`}
              onClick={handleExecute}
            >
              ▶ {dangerous ? '确认执行' : 'Execute'}
            </button>
          )}
        </div>
      </div>
      <div className="command-block-code">{command}</div>
    </div>
  )
}

// ===========================
// COMPONENT: ChatMessageView
// ===========================
function ChatMessageView({
  message,
  relaxedMode,
  onExecute
}: {
  message: AiMessage & { executedCommands?: Set<string> }
  relaxedMode: boolean
  onExecute: (cmd: string) => void
}) {
  const isUser = message.role === 'user'
  const commands = isUser ? [] : extractCommands(message.content)
  const textParts = isUser
    ? [message.content]
    : message.content.split(/```(?:bash|sh|shell|zsh)?\s*\n[\s\S]*?```/)

  return (
    <div className="chat-message">
      <div className={`chat-avatar ${isUser ? 'user' : 'ai'}`}>{isUser ? '👤' : '✨'}</div>
      <div className="chat-bubble">
        {textParts.map((part, i) => (
          <div key={i}>
            {part.trim() && (
              <div className="chat-bubble-text">
                {part
                  .trim()
                  .split('\n')
                  .map((line, j) => (
                    <p key={j}>{line}</p>
                  ))}
              </div>
            )}
            {commands[i] && (
              <CommandBlock
                command={commands[i]}
                relaxedMode={relaxedMode}
                onExecute={onExecute}
                autoExecuted={
                  message.executedCommands?.has(commands[i]) ||
                  (relaxedMode && !isDangerousCommand(commands[i]))
                }
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ===========================
// COMPONENT: ConnectionForm
// ===========================
function ConnectionForm({
  connection,
  onSave,
  onClose
}: {
  connection?: ConnectionConfig | null
  onSave: (conn: ConnectionConfig) => void
  onClose: () => void
}) {
  const [form, setForm] = useState<ConnectionConfig>(
    connection || {
      id: crypto.randomUUID(),
      name: '',
      host: '',
      port: 22,
      username: 'root',
      authType: 'password',
      password: '',
      privateKey: '',
      group: ''
    }
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name || !form.host || !form.username) return
    onSave(form)
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{connection ? '编辑连接' : '新建连接'}</h3>
          <button className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">连接名称</label>
              <input
                className="form-input"
                placeholder="My Server"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                autoFocus
              />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">主机地址</label>
                <input
                  className="form-input"
                  placeholder="192.168.1.1"
                  value={form.host}
                  onChange={(e) => setForm({ ...form, host: e.target.value })}
                />
              </div>
              <div className="form-group" style={{ maxWidth: 100 }}>
                <label className="form-label">端口</label>
                <input
                  className="form-input"
                  type="number"
                  value={form.port}
                  onChange={(e) => setForm({ ...form, port: parseInt(e.target.value) || 22 })}
                />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">用户名</label>
              <input
                className="form-input"
                placeholder="root"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">认证方式</label>
              <select
                className="form-select"
                value={form.authType}
                onChange={(e) =>
                  setForm({ ...form, authType: e.target.value as 'password' | 'privateKey' })
                }
              >
                <option value="password">密码</option>
                <option value="privateKey">私钥</option>
              </select>
            </div>
            {form.authType === 'password' ? (
              <div className="form-group">
                <label className="form-label">密码</label>
                <input
                  className="form-input"
                  type="password"
                  placeholder="输入密码"
                  value={form.password || ''}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                />
              </div>
            ) : (
              <div className="form-group">
                <label className="form-label">私钥内容</label>
                <textarea
                  className="form-input"
                  placeholder="粘贴私钥内容..."
                  value={form.privateKey || ''}
                  onChange={(e) => setForm({ ...form, privateKey: e.target.value })}
                />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">分组 (可选)</label>
              <input
                className="form-input"
                placeholder="生产环境 / 开发环境"
                value={form.group || ''}
                onChange={(e) => setForm({ ...form, group: e.target.value })}
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              取消
            </button>
            <button type="submit" className="btn btn-primary">
              {connection ? '保存' : '创建连接'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ===========================
// COMPONENT: SettingsPage
// ===========================
function SettingsPage({
  settings,
  onSave
}: {
  settings: AppSettings
  onSave: (s: AppSettings) => void
}) {
  const [form, setForm] = useState(settings)

  const handleSave = () => {
    onSave(form)
  }

  return (
    <div className="settings-page">
      <h2>⚙️ 设置</h2>
      <div className="settings-section">
        <div className="settings-section-title">🤖 Agent 配置</div>
        <div className="form-group">
          <label className="form-label">AI 提供商</label>
          <select
            className="form-select"
            value={form.ai.provider}
            onChange={(e) =>
              setForm({
                ...form,
                ai: { ...form.ai, provider: e.target.value as 'openai' | 'ollama' }
              })
            }
          >
            <option value="openai">OpenAI API</option>
            <option value="ollama">Ollama (本地)</option>
          </select>
        </div>
        {form.ai.provider === 'openai' ? (
          <>
            <div className="form-group">
              <label className="form-label">API Key</label>
              <input
                className="form-input"
                type="password"
                placeholder="sk-..."
                value={form.ai.apiKey}
                onChange={(e) => setForm({ ...form, ai: { ...form.ai, apiKey: e.target.value } })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">API URL</label>
              <input
                className="form-input"
                placeholder="https://api.openai.com/v1/chat/completions"
                value={form.ai.apiUrl}
                onChange={(e) => setForm({ ...form, ai: { ...form.ai, apiUrl: e.target.value } })}
              />
            </div>
            <div className="form-group">
              <label className="form-label">模型</label>
              <input
                className="form-input"
                placeholder="gpt-4o-mini"
                value={form.ai.model}
                onChange={(e) => setForm({ ...form, ai: { ...form.ai, model: e.target.value } })}
              />
            </div>
          </>
        ) : (
          <>
            <div className="form-group">
              <label className="form-label">Ollama 地址</label>
              <input
                className="form-input"
                placeholder="http://localhost:11434"
                value={form.ai.ollamaUrl}
                onChange={(e) =>
                  setForm({ ...form, ai: { ...form.ai, ollamaUrl: e.target.value } })
                }
              />
            </div>
            <div className="form-group">
              <label className="form-label">模型</label>
              <input
                className="form-input"
                placeholder="llama3"
                value={form.ai.model}
                onChange={(e) => setForm({ ...form, ai: { ...form.ai, model: e.target.value } })}
              />
            </div>
          </>
        )}
      </div>
      <button className="btn btn-primary" onClick={handleSave}>
        保存设置
      </button>
    </div>
  )
}

// ===========================
// TERMINAL THEMES
// ===========================
const TERMINAL_THEMES: Record<string, Record<string, string>> = {
  'github-dark': {
    background: '#0d1117', foreground: '#e6edf3', cursor: '#58a6ff', selectionBackground: '#264f78',
    black: '#484f58', red: '#ff7b72', green: '#3fb950', yellow: '#d29922',
    blue: '#58a6ff', magenta: '#bc8cff', cyan: '#76e3ea', white: '#e6edf3',
    brightBlack: '#6e7681', brightRed: '#ffa198', brightGreen: '#56d364', brightYellow: '#e3b341',
    brightBlue: '#79c0ff', brightMagenta: '#d2a8ff', brightCyan: '#b3f0ff', brightWhite: '#f0f6fc'
  },
  'dracula': {
    background: '#282a36', foreground: '#f8f8f2', cursor: '#f8f8f2', selectionBackground: '#44475a',
    black: '#21222c', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c',
    blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#f8f8f2',
    brightBlack: '#6272a4', brightRed: '#ff6e6e', brightGreen: '#69ff94', brightYellow: '#ffffa5',
    brightBlue: '#d6acff', brightMagenta: '#ff92df', brightCyan: '#a4ffff', brightWhite: '#ffffff'
  },
  'monokai': {
    background: '#272822', foreground: '#f8f8f2', cursor: '#f8f8f0', selectionBackground: '#49483e',
    black: '#272822', red: '#f92672', green: '#a6e22e', yellow: '#f4bf75',
    blue: '#66d9ef', magenta: '#ae81ff', cyan: '#a1efe4', white: '#f8f8f2',
    brightBlack: '#75715e', brightRed: '#f92672', brightGreen: '#a6e22e', brightYellow: '#f4bf75',
    brightBlue: '#66d9ef', brightMagenta: '#ae81ff', brightCyan: '#a1efe4', brightWhite: '#f9f8f5'
  },
  'nord': {
    background: '#2e3440', foreground: '#d8dee9', cursor: '#d8dee9', selectionBackground: '#434c5e',
    black: '#3b4252', red: '#bf616a', green: '#a3be8c', yellow: '#ebcb8b',
    blue: '#81a1c1', magenta: '#b48ead', cyan: '#88c0d0', white: '#e5e9f0',
    brightBlack: '#4c566a', brightRed: '#bf616a', brightGreen: '#a3be8c', brightYellow: '#ebcb8b',
    brightBlue: '#81a1c1', brightMagenta: '#b48ead', brightCyan: '#8fbcbb', brightWhite: '#eceff4'
  },
  'solarized-dark': {
    background: '#002b36', foreground: '#839496', cursor: '#93a1a1', selectionBackground: '#073642',
    black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900',
    blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
    brightBlack: '#586e75', brightRed: '#cb4b16', brightGreen: '#586e75', brightYellow: '#657b83',
    brightBlue: '#839496', brightMagenta: '#6c71c4', brightCyan: '#93a1a1', brightWhite: '#fdf6e3'
  },
  'one-dark': {
    background: '#282c34', foreground: '#abb2bf', cursor: '#528bff', selectionBackground: '#3e4451',
    black: '#545862', red: '#e06c75', green: '#98c379', yellow: '#e5c07b',
    blue: '#61afef', magenta: '#c678dd', cyan: '#56b6c2', white: '#d7dae0',
    brightBlack: '#636d83', brightRed: '#e06c75', brightGreen: '#98c379', brightYellow: '#e5c07b',
    brightBlue: '#61afef', brightMagenta: '#c678dd', brightCyan: '#56b6c2', brightWhite: '#ffffff'
  },
  'gruvbox': {
    background: '#282828', foreground: '#ebdbb2', cursor: '#ebdbb2', selectionBackground: '#504945',
    black: '#282828', red: '#cc241d', green: '#98971a', yellow: '#d79921',
    blue: '#458588', magenta: '#b16286', cyan: '#689d6a', white: '#a89984',
    brightBlack: '#928374', brightRed: '#fb4934', brightGreen: '#b8bb26', brightYellow: '#fabd2f',
    brightBlue: '#83a598', brightMagenta: '#d3869b', brightCyan: '#8ec07c', brightWhite: '#ebdbb2'
  }
}

// ===========================
// MAIN APP
// ===========================
type Page = 'overview' | 'settings'
type ViewMode = 'simple' | 'engineering'

export default function App() {
  const [page, setPage] = useState<Page>('overview')
  const [connections, setConnections] = useState<ConnectionConfig[]>([])
  const [sessions, setSessions] = useState<Session[]>([])
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('simple')
  const [leftPanelWidth, setLeftPanelWidth] = useState(280)
  const [rightPanelWidth, setRightPanelWidth] = useState(280)
  const { metrics: serverMetrics, error: metricsError } = useServerMetrics(
    viewMode === 'engineering' ? activeSessionId : null
  )
  const [showForm, setShowForm] = useState(false)
  const [editingConnection, setEditingConnection] = useState<ConnectionConfig | null>(null)
  const [settings, setSettings] = useState<AppSettings>({
    ai: {
      provider: 'openai',
      apiKey: '',
      apiUrl: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o-mini',
      ollamaUrl: 'http://localhost:11434'
    },
    relaxedMode: false
  })
  const [chatMessages, setChatMessages] = useState<Map<string, AiMessage[]>>(new Map())
  const [chatInput, setChatInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [connectingId, setConnectingId] = useState<string | null>(null)
  const [termFontSize, setTermFontSize] = useState(13)
  const [termLineHeight, setTermLineHeight] = useState(1.2)
  const [termTheme, setTermTheme] = useState('github-dark')
  const [termCursorStyle, setTermCursorStyle] = useState<'block' | 'underline' | 'bar'>('block')
  const [termCursorBlink, setTermCursorBlink] = useState(true)
  const [termOpacity, setTermOpacity] = useState(100)
  const [termScrollback, setTermScrollback] = useState(5000)
  const [termFontFamily, setTermFontFamily] = useState("'JetBrains Mono', 'SF Mono', 'Menlo', monospace")
  const [showTermSettings, setShowTermSettings] = useState(false)
  const [termBgImage, setTermBgImage] = useState<string | null>(null)
  const [termBgImagePerSession, setTermBgImagePerSession] = useState<Map<string, string>>(new Map())
  const [termBgMode, setTermBgMode] = useState<'global' | 'session'>('global')

  // Terminal refs
  const terminalRefs = useRef<Map<string, { terminal: Terminal; fitAddon: FitAddon; container: HTMLDivElement }>>(new Map())
  const terminalWrapperRef = useRef<HTMLDivElement>(null)
  const chatMessagesRef = useRef<HTMLDivElement>(null)
  const resizingRef = useRef(false)
  const chatPanelRef = useRef<HTMLDivElement>(null)

  // Load data
  useEffect(() => {
    if (!window.electronAPI) return
    const load = async () => {
      try {
        const conns = await window.electronAPI.store.getConnections()
        setConnections(conns)
        const s = await window.electronAPI.store.getSettings()
        if (s) setSettings(s)
      } catch {
        // first run
      }
    }
    load()
  }, [])

  // SSH event listeners
  useEffect(() => {
    if (!window.electronAPI) return

    const removeData = window.electronAPI.ssh.onData((sessionId, data) => {
      const ref = terminalRefs.current.get(sessionId)
      if (ref) {
        ref.terminal.write(data)
      }
    })

    const removeClose = window.electronAPI.ssh.onClose((sessionId) => {
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
      terminalRefs.current.delete(sessionId)
      setActiveSessionId((prev) => {
        if (prev === sessionId) return null
        return prev
      })
      showToast('连接已关闭', 'success')
    })

    const removeError = window.electronAPI.ssh.onError((sessionId, error) => {
      showToast(`连接错误: ${error}`, 'error')
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, status: 'error' as const } : s))
      )
    })

    return () => {
      removeData()
      removeClose()
      removeError()
    }
  }, [])

  // Auto scroll chat to bottom
  useEffect(() => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight
    }
  }, [chatMessages, activeSessionId])

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type })
    setTimeout(() => setToast(null), 3000)
  }

  // Create terminal for a session — creates a persistent container div
  const createTerminal = useCallback(
    (sessionId: string) => {
      if (terminalRefs.current.has(sessionId)) return
      if (!terminalWrapperRef.current) return

      // Create a dedicated container div for this session
      const container = document.createElement('div')
      container.className = 'terminal-session-container'
      container.style.cssText = 'width:100%;height:100%;display:none;'
      terminalWrapperRef.current.appendChild(container)

      const themeColors = TERMINAL_THEMES[termTheme] || TERMINAL_THEMES['github-dark']
      const terminal = new Terminal({
        cursorBlink: termCursorBlink,
        cursorStyle: termCursorStyle,
        fontSize: termFontSize,
        lineHeight: termLineHeight,
        fontFamily: termFontFamily,
        scrollback: termScrollback,
        theme: themeColors,
        allowProposedApi: true
      })

      const fitAddon = new FitAddon()
      terminal.loadAddon(fitAddon)
      terminal.open(container)

      setTimeout(() => {
        fitAddon.fit()
        const dims = fitAddon.proposeDimensions()
        if (dims) {
          window.electronAPI.ssh.resize(sessionId, dims.cols, dims.rows)
        }
      }, 150)

      terminal.onData((data) => {
        window.electronAPI.ssh.sendData(sessionId, data)
      })

      terminalRefs.current.set(sessionId, { terminal, fitAddon, container })
    },
    []
  )

  // Switch visible terminal when activeSessionId changes
  useEffect(() => {
    // Hide all terminal containers
    terminalRefs.current.forEach((ref) => {
      ref.container.style.display = 'none'
    })

    if (activeSessionId) {
      const ref = terminalRefs.current.get(activeSessionId)
      if (ref) {
        ref.container.style.display = 'block'
        setTimeout(() => {
          ref.fitAddon.fit()
          ref.terminal.focus()
        }, 50)
      } else {
        // Terminal not created yet — create it
        createTerminal(activeSessionId)
        // After creation, show it
        setTimeout(() => {
          const newRef = terminalRefs.current.get(activeSessionId)
          if (newRef) {
            newRef.container.style.display = 'block'
            newRef.fitAddon.fit()
            newRef.terminal.focus()
          }
        }, 100)
      }
    }
  }, [activeSessionId, createTerminal])

  // Resize observer for terminal wrapper
  useEffect(() => {
    if (!activeSessionId || !terminalWrapperRef.current) return

    const observer = new ResizeObserver(() => {
      const ref = terminalRefs.current.get(activeSessionId)
      if (ref) {
        setTimeout(() => {
          ref.fitAddon.fit()
          const dims = ref.fitAddon.proposeDimensions()
          if (dims) {
            window.electronAPI.ssh.resize(activeSessionId, dims.cols, dims.rows)
          }
        }, 50)
      }
    })

    observer.observe(terminalWrapperRef.current)
    return () => observer.disconnect()
  }, [activeSessionId])

  // Apply terminal settings to all instances
  useEffect(() => {
    const themeColors = TERMINAL_THEMES[termTheme] || TERMINAL_THEMES['github-dark']
    terminalRefs.current.forEach((ref) => {
      ref.terminal.options.fontSize = termFontSize
      ref.terminal.options.lineHeight = termLineHeight
      ref.terminal.options.cursorStyle = termCursorStyle
      ref.terminal.options.cursorBlink = termCursorBlink
      ref.terminal.options.fontFamily = termFontFamily
      ref.terminal.options.scrollback = termScrollback
      ref.terminal.options.theme = themeColors
      ref.fitAddon.fit()
    })
  }, [termFontSize, termLineHeight, termTheme, termCursorStyle, termCursorBlink, termFontFamily, termScrollback])

  // Connect to server
  const handleConnect = async (conn: ConnectionConfig) => {
    // Prevent double-connect
    if (connectingId === conn.id) return
    if (sessions.some((s) => s.connectionId === conn.id && (s.status === 'connected' || s.status === 'connecting'))) {
      // Already connected — switch to that session
      const existing = sessions.find((s) => s.connectionId === conn.id && s.status === 'connected')
      if (existing) setActiveSessionId(existing.id)
      return
    }

    setConnectingId(conn.id)

    const result = await window.electronAPI.ssh.connect(conn)
    setConnectingId(null)

    if (result.success && result.sessionId) {
      const newSession: Session = {
        id: result.sessionId,
        connectionId: conn.id,
        name: conn.name,
        host: conn.host,
        status: 'connected'
      }
      setSessions((prev) => [...prev, newSession])
      setActiveSessionId(result.sessionId)
      showToast(`已连接到 ${conn.name}`, 'success')
    } else {
      showToast(`连接失败: ${result.error}`, 'error')
    }
  }

  // Disconnect
  const handleDisconnect = async (sessionId: string) => {
    await window.electronAPI.ssh.disconnect(sessionId)
    // Remove terminal DOM
    const termRef = terminalRefs.current.get(sessionId)
    if (termRef) {
      termRef.terminal.dispose()
      termRef.container.remove()
      terminalRefs.current.delete(sessionId)
    }
    setSessions((prev) => prev.filter((s) => s.id !== sessionId))
    if (activeSessionId === sessionId) {
      setActiveSessionId(null)
    }
    showToast('已断开连接', 'success')
  }

  const handleDisconnectAll = () => {
    sessions.forEach((s) => handleDisconnect(s.id))
  }

  // Save connection
  const handleSaveConnection = async (conn: ConnectionConfig) => {
    await window.electronAPI.store.saveConnection(conn)
    const updated = await window.electronAPI.store.getConnections()
    setConnections(updated)
    setShowForm(false)
    setEditingConnection(null)
    showToast('连接已保存', 'success')
  }

  // Delete connection
  const handleDeleteConnection = async (id: string) => {
    await window.electronAPI.store.deleteConnection(id)
    const updated = await window.electronAPI.store.getConnections()
    setConnections(updated)
    showToast('连接已删除', 'success')
  }

  // Save settings
  const handleSaveSettings = async (s: AppSettings) => {
    setSettings(s)
    await window.electronAPI.store.saveSettings(s)
    showToast('设置已保存', 'success')
  }

  // Execute command in terminal
  const executeCommand = (cmd: string) => {
    if (!activeSessionId) return
    window.electronAPI.ssh.sendData(activeSessionId, cmd + '\n')
  }

  // AI Chat
  const handleSendChat = async () => {
    if (!chatInput.trim() || !activeSessionId || aiLoading) return

    const userMsg: AiMessage = {
      role: 'user',
      content: chatInput.trim(),
      timestamp: Date.now()
    }

    const currentMessages = chatMessages.get(activeSessionId) || []
    const updatedMessages = [...currentMessages, userMsg]
    setChatMessages(new Map(chatMessages.set(activeSessionId, updatedMessages)))
    setChatInput('')
    setAiLoading(true)

    // Get recent terminal buffer for context
    const termRef = terminalRefs.current.get(activeSessionId)
    let terminalContext = ''
    if (termRef) {
      const buffer = termRef.terminal.buffer.active
      const lines: string[] = []
      const startLine = Math.max(0, buffer.cursorY - 20)
      for (let i = startLine; i <= buffer.cursorY; i++) {
        const line = buffer.getLine(i)
        if (line) lines.push(line.translateToString().trimEnd())
      }
      terminalContext = lines.join('\n')
    }

    const apiMessages = updatedMessages.map((m) => ({ role: m.role, content: m.content }))
    if (terminalContext) {
      apiMessages.unshift({
        role: 'user' as const,
        content: `[当前终端最近输出]\n${terminalContext}\n[终端输出结束]`
      })
    }

    const result = await window.electronAPI.ai.chat(apiMessages, settings.ai)
    setAiLoading(false)

    if (result.success && result.reply) {
      const aiMsg: AiMessage = {
        role: 'assistant',
        content: result.reply,
        timestamp: Date.now()
      }
      const newMessages = [...updatedMessages, aiMsg]
      setChatMessages(new Map(chatMessages.set(activeSessionId, newMessages)))

      // Relaxed mode: auto-execute safe commands
      if (settings.relaxedMode) {
        const commands = extractCommands(result.reply)
        commands.forEach((cmd) => {
          if (!isDangerousCommand(cmd)) {
            executeCommand(cmd)
          }
        })
      }
    } else {
      showToast(`AI 错误: ${result.error}`, 'error')
    }
  }

  // Resize handle
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault()
    resizingRef.current = true

    const startY = e.clientY
    const panel = chatPanelRef.current
    if (!panel) return
    const startHeight = panel.offsetHeight

    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return
      const delta = startY - ev.clientY
      const newHeight = Math.max(120, Math.min(window.innerHeight * 0.6, startHeight + delta))
      panel.style.height = `${newHeight}px`

      // Refit terminal
      if (activeSessionId) {
        const ref = terminalRefs.current.get(activeSessionId)
        if (ref) {
          setTimeout(() => ref.fitAddon.fit(), 10)
        }
      }
    }

    const onUp = () => {
      resizingRef.current = false
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  // Current session's messages
  const currentChatMessages = activeSessionId ? chatMessages.get(activeSessionId) || [] : []

  // Active session
  const activeSession = sessions.find((s) => s.id === activeSessionId)

  const connectedSessions = sessions.filter((s) => s.status === 'connected')

  return (
    <div className="app-layout">
      {/* SIDEBAR */}
      <div className="sidebar">
        <div className="sidebar-header">
          <span className="sidebar-logo">OpenTerm</span>
        </div>

        <div className="sidebar-nav">
          <button
            className={`nav-item ${!activeSessionId && page === 'overview' ? 'active' : ''}`}
            onClick={() => {
              setActiveSessionId(null)
              setPage('overview')
            }}
          >
            <span className="nav-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg></span>
            概览
            {connections.length > 0 && (
              <span className="nav-badge">{connections.length}</span>
            )}
          </button>
          <button
            className={`nav-item ${page === 'settings' && !activeSessionId ? 'active' : ''}`}
            onClick={() => {
              setActiveSessionId(null)
              setPage('settings')
            }}
          >
            <span className="nav-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="3"/><path d="M12.4 5.2a6 6 0 0 1 0 5.6M3.6 5.2a6 6 0 0 0 0 5.6M8 2v1M8 13v1M2 8h1M13 8h1M3.8 3.8l.7.7M11.5 11.5l.7.7M12.2 3.8l-.7.7M4.5 11.5l-.7.7"/></svg></span>
            设置
          </button>

          {/* Sessions */}
          {connectedSessions.length > 0 && (
            <>
              <div className="sidebar-section-title">会话</div>
              {connectedSessions.map((session) => (
                <div
                  key={session.id}
                  className={`session-item ${activeSessionId === session.id ? 'active' : ''}`}
                  onClick={() => setActiveSessionId(session.id)}
                >
                  <span className="session-dot" />
                  <span>{session.name}</span>
                  <span
                    className="session-close"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDisconnect(session.id)
                    }}
                  >
                    ×
                  </span>
                </div>
              ))}
            </>
          )}
        </div>

        {connectedSessions.length > 0 && (
          <div className="sidebar-footer">
            <button className="close-all-btn" onClick={handleDisconnectAll}>
              ✕ 关闭所有
            </button>
          </div>
        )}
      </div>

      {/* MAIN */}
      <div className="main-content">
        {/* Titlebar */}
        <div className="main-titlebar">
          {activeSession ? (
            <>
              <span className="main-title">{activeSession.name}</span>
              <span className="main-title-sub">
                {connections.find((c) => c.id === activeSession.connectionId)?.username}@
                {activeSession.host}
              </span>
            </>
          ) : (
            <span className="main-title">{page === 'settings' ? '设置' : '概览'}</span>
          )}
          {activeSession && (
            <div className="titlebar-actions">
              <div className="mode-switch">
                <button
                  className={`mode-switch-btn ${viewMode === 'simple' ? 'active' : ''}`}
                  onClick={() => setViewMode('simple')}
                >
                  📝 简洁
                </button>
                <button
                  className={`mode-switch-btn ${viewMode === 'engineering' ? 'active' : ''}`}
                  onClick={() => setViewMode('engineering')}
                >
                  🔧 工程
                </button>
              </div>
            </div>
          )}
          {!activeSession && page === 'overview' && (
            <div className="titlebar-actions">
              <button className="titlebar-btn" onClick={() => setShowForm(true)}>
                + 新建连接
              </button>
            </div>
          )}
        </div>

        {/* Content — All views always mounted, toggled via display */}

        {/* Terminal View — ALWAYS in DOM, hidden when not active */}
        <div className="terminal-view" style={{ display: activeSessionId && activeSession ? 'flex' : 'none' }}>
          <div className="terminal-main-area">
            {/* Engineering Mode: LEFT Monitor Panel */}
            {viewMode === 'engineering' && activeSessionId && (
              <>
                <div className="monitor-panel-wrapper" style={{ width: leftPanelWidth, minWidth: 220, maxWidth: 400 }}>
                  <MonitorLeft metrics={serverMetrics} error={metricsError} />
                </div>
                <div
                  className="panel-divider"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    const startX = e.clientX
                    const startW = leftPanelWidth
                    const onMove = (ev: MouseEvent) => setLeftPanelWidth(Math.max(220, Math.min(400, startW + (ev.clientX - startX))))
                    const onUp = () => {
                      document.removeEventListener('mousemove', onMove)
                      document.removeEventListener('mouseup', onUp)
                      if (activeSessionId) { const ref = terminalRefs.current.get(activeSessionId); if (ref) ref.fitAddon.fit() }
                    }
                    document.addEventListener('mousemove', onMove)
                    document.addEventListener('mouseup', onUp)
                  }}
                />
              </>
            )}

            {/* Terminal column: toolbar + terminal */}
            <div className="terminal-col">
              {/* Terminal Settings Toolbar */}
              <div className="term-toolbar">
                <div className="term-toolbar-group">
                  <span className="term-toolbar-label">字号</span>
                  <button className="term-toolbar-btn" onClick={() => setTermFontSize(s => Math.max(8, s - 1))}>−</button>
                  <span className="term-toolbar-value">{termFontSize}</span>
                  <button className="term-toolbar-btn" onClick={() => setTermFontSize(s => Math.min(24, s + 1))}>+</button>
                </div>
                <div className="term-toolbar-group">
                  <span className="term-toolbar-label">主题</span>
                  <select className="term-toolbar-select" value={termTheme} onChange={(e) => setTermTheme(e.target.value)}>
                    <option value="github-dark">GitHub Dark</option>
                    <option value="dracula">Dracula</option>
                    <option value="monokai">Monokai</option>
                    <option value="nord">Nord</option>
                    <option value="solarized-dark">Solarized Dark</option>
                    <option value="one-dark">One Dark</option>
                    <option value="gruvbox">Gruvbox</option>
                  </select>
                </div>
                <div className="term-toolbar-group">
                  <span className="term-toolbar-label">透明</span>
                  <input type="range" className="term-toolbar-range" min="30" max="100" value={termOpacity}
                    onChange={(e) => setTermOpacity(parseInt(e.target.value))}
                  />
                  <span className="term-toolbar-value">{termOpacity}%</span>
                </div>
                <div className="term-toolbar-spacer" />
                <button className={`term-toolbar-gear ${showTermSettings ? 'active' : ''}`} onClick={() => setShowTermSettings(v => !v)}>⚙</button>
              </div>
              {/* Expanded Settings Panel */}
              {showTermSettings && (
                <div className="term-settings-panel">
                  <div className="term-settings-row">
                    <span className="term-settings-label">光标样式</span>
                    <div className="term-settings-btns">
                      {(['block', 'underline', 'bar'] as const).map(s => (
                        <button key={s} className={`term-settings-btn ${termCursorStyle === s ? 'active' : ''}`}
                          onClick={() => setTermCursorStyle(s)}>
                          {s === 'block' ? '▊ 方块' : s === 'underline' ? '▁ 下划' : '▏ 竖线'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="term-settings-row">
                    <span className="term-settings-label">光标闪烁</span>
                    <div className={`mini-toggle ${termCursorBlink ? 'on' : ''}`}
                      onClick={() => setTermCursorBlink(v => !v)} />
                  </div>
                  <div className="term-settings-row">
                    <span className="term-settings-label">行高</span>
                    <select className="term-toolbar-select" value={termLineHeight}
                      onChange={(e) => setTermLineHeight(parseFloat(e.target.value))}>
                      <option value="1.0">1.0 紧凑</option>
                      <option value="1.2">1.2 标准</option>
                      <option value="1.4">1.4 宽松</option>
                      <option value="1.6">1.6 舒适</option>
                    </select>
                  </div>
                  <div className="term-settings-row">
                    <span className="term-settings-label">字体</span>
                    <select className="term-toolbar-select" value={termFontFamily}
                      onChange={(e) => setTermFontFamily(e.target.value)}>
                      <option value="'JetBrains Mono', 'SF Mono', 'Menlo', monospace">JetBrains Mono</option>
                      <option value="'SF Mono', 'Monaco', monospace">SF Mono</option>
                      <option value="'Menlo', monospace">Menlo</option>
                      <option value="'Fira Code', monospace">Fira Code</option>
                      <option value="'Source Code Pro', monospace">Source Code Pro</option>
                      <option value="'Cascadia Code', monospace">Cascadia Code</option>
                      <option value="'Consolas', monospace">Consolas</option>
                    </select>
                  </div>
                  <div className="term-settings-row">
                    <span className="term-settings-label">回滚缓冲</span>
                    <select className="term-toolbar-select" value={termScrollback}
                      onChange={(e) => setTermScrollback(parseInt(e.target.value))}>
                      <option value="1000">1,000 行</option>
                      <option value="5000">5,000 行</option>
                      <option value="10000">10,000 行</option>
                      <option value="50000">50,000 行</option>
                      <option value="100000">100,000 行</option>
                    </select>
                  </div>
                  <div className="term-settings-row">
                    <span className="term-settings-label">背景图</span>
                    <div className="term-settings-btns">
                      <button className={`term-settings-btn ${termBgMode === 'global' ? 'active' : ''}`}
                        onClick={() => setTermBgMode('global')}>全局</button>
                      <button className={`term-settings-btn ${termBgMode === 'session' ? 'active' : ''}`}
                        onClick={() => setTermBgMode('session')}>当前终端</button>
                    </div>
                  </div>
                  <div className="term-settings-row">
                    <button className="term-settings-btn" onClick={async () => {
                      try {
                        const result = await (window as any).electronAPI.dialog.openFile({
                          properties: ['openFile'],
                          filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'] }]
                        })
                        if (!result.canceled && result.filePaths[0]) {
                          const path = result.filePaths[0]
                          if (termBgMode === 'session' && activeSessionId) {
                            setTermBgImagePerSession(prev => new Map(prev).set(activeSessionId, path))
                          } else {
                            setTermBgImage(path)
                          }
                        }
                      } catch (e) { console.error('Image picker error:', e) }
                    }}>📁 选择图片</button>
                    {(termBgImage || (activeSessionId && termBgImagePerSession.has(activeSessionId))) && (
                      <button className="term-settings-btn" onClick={() => {
                        if (termBgMode === 'session' && activeSessionId) {
                          setTermBgImagePerSession(prev => { const m = new Map(prev); m.delete(activeSessionId); return m })
                        } else {
                          setTermBgImage(null)
                        }
                      }}>✕ 清除</button>
                    )}
                  </div>
                </div>
              )}
              {/* Terminal — stable container with optional background */}
              <div className="terminal-container" ref={terminalWrapperRef} style={{
                opacity: termOpacity / 100,
                ...((() => {
                  const bg = (activeSessionId && termBgImagePerSession.get(activeSessionId)) || termBgImage
                  return bg ? {
                    backgroundImage: `url('file://${bg}')`,
                    backgroundSize: 'cover',
                    backgroundPosition: 'center',
                    backgroundRepeat: 'no-repeat'
                  } : {}
                })())
              }} />
            </div>

            {/* Engineering Mode: RIGHT Monitor Panel */}
            {viewMode === 'engineering' && activeSessionId && (
              <>
                <div
                  className="panel-divider"
                  onMouseDown={(e) => {
                    e.preventDefault()
                    const startX = e.clientX
                    const startW = rightPanelWidth
                    const onMove = (ev: MouseEvent) => setRightPanelWidth(Math.max(220, Math.min(400, startW - (ev.clientX - startX))))
                    const onUp = () => {
                      document.removeEventListener('mousemove', onMove)
                      document.removeEventListener('mouseup', onUp)
                      if (activeSessionId) { const ref = terminalRefs.current.get(activeSessionId); if (ref) ref.fitAddon.fit() }
                    }
                    document.addEventListener('mousemove', onMove)
                    document.addEventListener('mouseup', onUp)
                  }}
                />
                <div className="monitor-panel-wrapper right" style={{ width: rightPanelWidth, minWidth: 220, maxWidth: 400 }}>
                  <MonitorRight metrics={serverMetrics} error={metricsError} />
                </div>
              </>
            )}
          </div>

          {/* Resize Handle */}
          <div
            className={`resize-handle ${resizingRef.current ? 'active' : ''}`}
            onMouseDown={handleResizeStart}
          />

          {/* AI Chat Panel */}
          <div className="ai-chat-panel" ref={chatPanelRef}>
            <div className="ai-chat-header">
              <span className="ai-chat-title">
                <span className="sparkle">✨</span>
                Agent 帮助
              </span>
              <div className="relaxed-toggle" onClick={() => {
                const updated = { ...settings, relaxedMode: !settings.relaxedMode }
                setSettings(updated)
                window.electronAPI.store.saveSettings(updated)
              }}>
                <span className="relaxed-label">🔓 宽松模式</span>
                <div className={`toggle-switch ${settings.relaxedMode ? 'on' : ''}`} />
              </div>
            </div>

            <div className="ai-chat-messages" ref={chatMessagesRef}>
              {currentChatMessages.length === 0 && (
                <div
                  style={{
                    textAlign: 'center',
                    color: 'var(--text-muted)',
                    paddingTop: 40,
                    fontSize: 13
                  }}
                >
                  <div style={{ fontSize: 32, marginBottom: 8 }}>✨</div>
                  <div>用自然语言描述你想做的事</div>
                  <div style={{ fontSize: 12, marginTop: 4, opacity: 0.7 }}>
                    例如：&quot;帮我查看内存使用情况&quot;
                  </div>
                </div>
              )}
              {currentChatMessages.map((msg, i) => (
                <ChatMessageView
                  key={i}
                  message={msg}
                  relaxedMode={settings.relaxedMode}
                  onExecute={executeCommand}
                />
              ))}
              {aiLoading && (
                <div className="ai-loading">
                  <div className="ai-loading-dots">
                    <span />
                    <span />
                    <span />
                  </div>
                  AI 正在思考...
                </div>
              )}
            </div>

            <div className="ai-chat-input-area">
              <div className="ai-chat-input-wrapper">
                <input
                  className="ai-chat-input"
                  placeholder="输入你的问题，例如：帮我查看磁盘使用情况"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSendChat()
                    }
                  }}
                />
                <button
                  className="ai-send-btn"
                  onClick={handleSendChat}
                  disabled={!chatInput.trim() || aiLoading}
                >
                  ➤
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Settings — shown when no active session and page is settings */}
        {!activeSessionId && page === 'settings' && (
          <SettingsPage settings={settings} onSave={handleSaveSettings} />
        )}

        {/* Overview — shown when no active session and page is overview */}
        {!activeSessionId && page !== 'settings' && (
          /* Overview */
          <div className="overview-page">
            <div className="overview-header">
              <span className="overview-title">服务器</span>
              <span className="overview-count">{connections.length} 台服务器</span>
            </div>

            <div className="server-grid">
              {connections.map((conn) => {
                const isConnecting = connectingId === conn.id
                const isConnected = sessions.some((s) => s.connectionId === conn.id && s.status === 'connected')
                const hasBg = !!conn.bgImage
                return (
                  <div
                    key={conn.id}
                    className={`server-card ${isConnecting ? 'connecting' : ''} ${hasBg ? 'has-bg' : ''}`}
                    onDoubleClick={() => handleConnect(conn)}
                    style={hasBg ? { backgroundImage: `url('${conn.bgImage}')`, backgroundSize: 'cover', backgroundPosition: 'center' } : {}}
                  >
                    {hasBg && <div className="server-card-bg-overlay" style={{ opacity: (conn.bgOpacity ?? 60) / 100 }} />}
                    <div className="server-card-header">
                      {isConnecting ? (
                        <div className="card-connecting-spinner" />
                      ) : (
                        <span className={`server-status ${isConnected ? 'online' : 'offline'}`} />
                      )}
                      <span className="server-card-name">{conn.name}</span>
                      {isConnecting && (
                        <span className="card-connecting-label">连接中...</span>
                      )}
                      <div className="server-card-actions">
                        <button
                          className="card-action-btn"
                          title="设置背景图"
                          onClick={async (e) => {
                            e.stopPropagation()
                            try {
                              const result = await (window as any).electronAPI.dialog.openFile({
                                properties: ['openFile'],
                                filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] }]
                              })
                              if (!result.canceled && result.filePaths[0]) {
                                const dataUrl = await (window as any).electronAPI.file.readAsDataUrl(result.filePaths[0])
                                if (dataUrl) {
                                  const updated = { ...conn, bgImage: dataUrl, bgOpacity: conn.bgOpacity ?? 60 }
                                  await window.electronAPI.store.saveConnection(updated)
                                  setConnections(prev => prev.map(c => c.id === conn.id ? updated : c))
                                }
                              }
                            } catch (err) { console.error(err) }
                          }}
                        >
                          🖼
                        </button>
                        <button
                          className="card-action-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditingConnection(conn)
                            setShowForm(true)
                          }}
                        >
                          ✏️
                        </button>
                        <button
                          className="card-action-btn delete"
                          onClick={(e) => {
                            e.stopPropagation()
                            handleDeleteConnection(conn.id)
                          }}
                        >
                          🗑
                        </button>
                      </div>
                    </div>
                    <div className="server-card-info">
                      <span className="server-card-detail">
                        <span className="card-icon">⌘</span> {conn.host}:{conn.port}
                      </span>
                      <span className="server-card-detail">
                        <span className="card-icon">⊙</span> {conn.username}
                      </span>
                      {conn.group && (
                        <span className="server-card-detail"><span className="card-icon">⊡</span> {conn.group}</span>
                      )}
                    </div>
                    {/* Background Opacity Slider */}
                    {hasBg && (
                      <div className="card-bg-controls" onClick={(e) => e.stopPropagation()}>
                        <span className="card-bg-label">透明度</span>
                        <input type="range" className="card-bg-range" min="20" max="90" value={conn.bgOpacity ?? 60}
                          onChange={async (e) => {
                            const opacity = parseInt(e.target.value)
                            const updated = { ...conn, bgOpacity: opacity }
                            setConnections(prev => prev.map(c => c.id === conn.id ? updated : c))
                            await window.electronAPI.store.saveConnection(updated)
                          }}
                        />
                        <button className="card-bg-clear" onClick={async () => {
                          const updated = { ...conn, bgImage: undefined, bgOpacity: undefined }
                          await window.electronAPI.store.saveConnection(updated)
                          setConnections(prev => prev.map(c => c.id === conn.id ? updated : c))
                        }}>✕</button>
                      </div>
                    )}
                  </div>
                )
              })}

              <div className="add-server-card" onClick={() => setShowForm(true)}>
                <span className="add-server-icon">+</span>
                <span className="add-server-text">添加服务器</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Connection Form Modal */}
      {showForm && (
        <ConnectionForm
          connection={editingConnection}
          onSave={handleSaveConnection}
          onClose={() => {
            setShowForm(false)
            setEditingConnection(null)
          }}
        />
      )}

      {/* Toast */}
      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </div>
  )
}
