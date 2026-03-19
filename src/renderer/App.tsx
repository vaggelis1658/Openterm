import { useState, useEffect, useCallback, useRef } from 'react'
import {
  ConnectionConfig,
  Session,
  AiMessage,
  AppSettings,
  ChatHistoryEntry,
  AgentConfig,
  TokenInfo,
  AgentResult,
  Workflow,
  WorkflowNode,
  AgentSkill,
  extractCommands,
  isDangerousCommand
} from './types'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { MonitorLeft, MonitorRight, useServerMetrics } from './components/ServerMonitor'
import { AgentResultPanel } from './components/AgentResultPanel'
import { WorkflowPanel } from './components/WorkflowPanel'
import { SkillEditorModal } from './components/SkillEditorModal'
import { SkillManagerModal } from './components/SkillManagerModal'
import { FileManagerPanel } from './components/FileManagerPanel'
import { playStepComplete, playStepError, playWorkflowDone, playWorkflowStart } from './utils/workflow-sounds'

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
  const [expanded, setExpanded] = useState(false)
  const dangerous = isDangerousCommand(command)

  const lines = command.split('\n')
  const isLongCommand = lines.length > 5

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
              ▶ {dangerous ? '确认跑通' : 'Execute'}
            </button>
          )}
        </div>
      </div>
      
      {isLongCommand && !expanded ? (
        <div 
          className="command-block-collapsed" 
          onClick={() => setExpanded(true)}
          style={{ padding: '12px 16px', background: 'rgba(0,0,0,0.2)', cursor: 'pointer', color: 'var(--text-secondary)', fontSize: 13, textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.05)' }}
        >
          <span>包含 {lines.length} 行脚本命令，点击展开查看具体内容...</span>
        </div>
      ) : (
        <div className="command-block-code">
          {command}
          {isLongCommand && expanded && (
            <div 
              onClick={() => setExpanded(false)}
              style={{ padding: '8px 0 0', cursor: 'pointer', color: 'var(--accent-blue)', fontSize: 12, textAlign: 'center', marginTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)' }}
            >
              ▲ 收起代码块
            </div>
          )}
        </div>
      )}
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
  
  let displayContent = message.content
  if (!isUser) {
    // Strip XML tags used for internal reasoning
    displayContent = displayContent.replace(/<response>([\s\S]*?)<\/response>/g, '$1').trim()
    displayContent = displayContent.replace(/<thinking>[\s\S]*?<\/thinking>/g, '').trim()
  }

  const commands = isUser ? [] : extractCommands(displayContent)
  const textParts = isUser
    ? [displayContent]
    : displayContent.split(/```(?:bash|sh|shell|zsh)?\s*\n[\s\S]*?```/)

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

  useEffect(() => { setForm(settings) }, [settings])

  const handleSave = () => {
    onSave(form)
  }

  return (
    <div className="settings-page">
      <h2>设置</h2>

      <div className="settings-grid">
      {/* Terminal Settings */}
      <div className="settings-section">
        <div className="settings-section-title">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="1" y="2" width="14" height="12" rx="2"/><path d="M4 6l3 2-3 2M8 10h4"/></svg>
          终端设置
        </div>
        <div className="form-group">
          <label className="form-label">字号</label>
          <input className="form-input" type="number" min="10" max="28" value={form.termFontSize ?? 13}
            onChange={(e) => setForm({ ...form, termFontSize: parseInt(e.target.value) || 13 })} />
        </div>
        <div className="form-group">
          <label className="form-label">主题</label>
          <select className="form-select" value={form.termTheme ?? 'github-dark'}
            onChange={(e) => setForm({ ...form, termTheme: e.target.value })}>
            <option value="github-dark">GitHub Dark</option>
            <option value="dracula">Dracula</option>
            <option value="monokai">Monokai</option>
            <option value="nord">Nord</option>
            <option value="solarized">Solarized Dark</option>
            <option value="gruvbox">Gruvbox</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">光标样式</label>
          <select className="form-select" value={form.termCursorStyle ?? 'block'}
            onChange={(e) => setForm({ ...form, termCursorStyle: e.target.value as 'block' | 'underline' | 'bar' })}>
            <option value="block">方块</option>
            <option value="underline">下划线</option>
            <option value="bar">竖线</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">光标闪烁</label>
          <select className="form-select" value={form.termCursorBlink === false ? 'off' : 'on'}
            onChange={(e) => setForm({ ...form, termCursorBlink: e.target.value === 'on' })}>
            <option value="on">开启</option>
            <option value="off">关闭</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">行高</label>
          <select className="form-select" value={form.termLineHeight ?? 1.2}
            onChange={(e) => setForm({ ...form, termLineHeight: parseFloat(e.target.value) })}>
            <option value="1.0">1.0 紧凑</option>
            <option value="1.2">1.2 标准</option>
            <option value="1.4">1.4 宽松</option>
            <option value="1.6">1.6 舒适</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">字体</label>
          <select className="form-select" value={form.termFontFamily ?? "'JetBrains Mono', 'SF Mono', 'Menlo', monospace"}
            onChange={(e) => setForm({ ...form, termFontFamily: e.target.value })}>
            <option value="'JetBrains Mono', 'SF Mono', 'Menlo', monospace">JetBrains Mono</option>
            <option value="'SF Mono', 'Monaco', monospace">SF Mono</option>
            <option value="'Menlo', monospace">Menlo</option>
            <option value="'Fira Code', monospace">Fira Code</option>
            <option value="'Source Code Pro', monospace">Source Code Pro</option>
            <option value="'Cascadia Code', monospace">Cascadia Code</option>
            <option value="'Consolas', monospace">Consolas</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">回滚缓冲</label>
          <select className="form-select" value={form.termScrollback ?? 5000}
            onChange={(e) => setForm({ ...form, termScrollback: parseInt(e.target.value) })}>
            <option value="1000">1,000 行</option>
            <option value="5000">5,000 行</option>
            <option value="10000">10,000 行</option>
            <option value="50000">50,000 行</option>
            <option value="100000">100,000 行</option>
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">背景透明度</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="range" className="form-input" style={{ flex: 1, padding: 0 }} min="0" max="100" value={form.termOpacity ?? 100}
              onChange={(e) => setForm({ ...form, termOpacity: parseInt(e.target.value) })} />
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', minWidth: 36 }}>{form.termOpacity ?? 100}%</span>
          </div>
        </div>
      </div>

      {/* AI Settings */}
      <div className="settings-section">
        <div className="settings-section-title">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6"/><path d="M5 6.5C5.5 5.5 6.5 5 8 5s2.5.5 3 1.5M5.5 9.5h5"/></svg>
          Agent 配置
        </div>
        <div className="form-group">
          <label className="form-label">AI 提供商</label>
          <select
            className="form-select"
            value={form.ai.provider}
            onChange={(e) => {
              const provider = e.target.value as any
              const defaults: Record<string, { apiUrl: string; model: string }> = {
                openai: { apiUrl: 'https://api.openai.com/v1/chat/completions', model: 'gpt-4o-mini' },
                anthropic: { apiUrl: 'https://api.anthropic.com/v1/messages', model: 'claude-sonnet-4-20250514' },
                ollama: { apiUrl: '', model: 'llama3' },
                custom: { apiUrl: form.ai.apiUrl, model: form.ai.model }
              }
              const d = defaults[provider] || defaults.openai
              setForm({ ...form, ai: { ...form.ai, provider, apiUrl: d.apiUrl, model: d.model } })
            }}
          >
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic Claude</option>
            <option value="ollama">Ollama (本地)</option>
            <option value="custom">自定义 (OpenAI 兼容)</option>
          </select>
        </div>

        {/* OpenAI / Anthropic / Custom — need API Key */}
        {(form.ai.provider === 'openai' || form.ai.provider === 'anthropic' || form.ai.provider === 'custom') && (
          <div className="form-group">
            <label className="form-label">API Key</label>
            <input
              className="form-input"
              type="password"
              placeholder={form.ai.provider === 'anthropic' ? 'sk-ant-...' : 'sk-...'}
              value={form.ai.apiKey}
              onChange={(e) => setForm({ ...form, ai: { ...form.ai, apiKey: e.target.value } })}
            />
          </div>
        )}

        {/* API URL — all except ollama auto-filled */}
        {form.ai.provider !== 'ollama' && (
          <div className="form-group">
            <label className="form-label">API URL</label>
            <input
              className="form-input"
              placeholder={form.ai.provider === 'anthropic' ? 'https://api.anthropic.com/v1/messages' : 'https://api.openai.com/v1/chat/completions'}
              value={form.ai.apiUrl}
              onChange={(e) => setForm({ ...form, ai: { ...form.ai, apiUrl: e.target.value } })}
            />
          </div>
        )}

        {/* Ollama URL */}
        {form.ai.provider === 'ollama' && (
          <div className="form-group">
            <label className="form-label">Ollama 地址</label>
            <input
              className="form-input"
              placeholder="http://localhost:11434"
              value={form.ai.ollamaUrl}
              onChange={(e) => setForm({ ...form, ai: { ...form.ai, ollamaUrl: e.target.value } })}
            />
          </div>
        )}

        {/* Model */}
        <div className="form-group">
          <label className="form-label">模型</label>
          <input
            className="form-input"
            placeholder={
              form.ai.provider === 'anthropic' ? 'claude-sonnet-4-20250514' :
              form.ai.provider === 'ollama' ? 'llama3' : 'gpt-4o-mini'
            }
            value={form.ai.model}
            onChange={(e) => setForm({ ...form, ai: { ...form.ai, model: e.target.value } })}
          />
        </div>

        {/* Custom System Prompt */}
        <div className="form-group">
          <label className="form-label">自定义 System Prompt (可选)</label>
          <textarea
            className="form-input"
            rows={3}
            placeholder="留空使用默认 Linux 运维助手提示词..."
            value={form.ai.customPrompt || ''}
            onChange={(e) => setForm({ ...form, ai: { ...form.ai, customPrompt: e.target.value } })}
            style={{ resize: 'vertical', minHeight: 60 }}
          />
        </div>
      </div>

      {/* File Manager Settings */}
      <div className="settings-section" style={{ marginTop: 20 }}>
        <div className="settings-section-title">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 3h12v10H2V3zm0 3h12M6 6v7"/></svg>
          文件区设置
        </div>
        <div className="form-group">
          <label className="form-label">默认下载路径</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="form-input"
              style={{ flex: 1 }}
              placeholder="未设置（下载时每次询问）"
              readOnly
              value={form.defaultDownloadPath || ''}
            />
            <button
              className="btn btn-secondary"
              onClick={async () => {
                const res = await window.electronAPI.dialog.selectDirectory()
                if (!res.canceled && res.filePaths.length > 0) {
                  setForm({ ...form, defaultDownloadPath: res.filePaths[0] })
                }
              }}
            >
              选择文件夹
            </button>
            {form.defaultDownloadPath && (
              <button
                className="btn btn-secondary"
                onClick={() => setForm({ ...form, defaultDownloadPath: undefined })}
              >
                清除
              </button>
            )}
          </div>
        </div>
      </div>
      
      </div>
      <button className="btn btn-primary" onClick={handleSave} style={{ marginTop: 24 }}>
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
      provider: 'custom',
      apiKey: 'sk-hJvJldZ0dkSG88mXHuiljDTNNcIc2nUv3L7tGEpw57BLFhdL',
      apiUrl: 'https://api.lhfcb.com/v1/chat/completions',
      model: 'claude-opus-4-6',
      ollamaUrl: 'http://localhost:11434',
      customPrompt: ''
    },
    relaxedMode: false,
    workflowMode: true
  })
  const [chatMessages, setChatMessages] = useState<Map<string, AiMessage[]>>(new Map())
  const [activeChatKey, setActiveChatKey] = useState<string | null>(null)
  const [chatInput, setChatInput] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [showModelSwitch, setShowModelSwitch] = useState(false)
  const [showChatHistory, setShowChatHistory] = useState(false)
  const [chatHistoryList, setChatHistoryList] = useState<ChatHistoryEntry[]>([])
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  // Agent & Token & Streaming state
  const [agents, setAgents] = useState<AgentConfig[]>([])
  const [activeAgentId, setActiveAgentId] = useState('smart')
  const [showAgentPicker, setShowAgentPicker] = useState(false)
  
  interface AttachedFile { name: string; path: string; size: number; type?: string }
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([])
  const [isDragOverInput, setIsDragOverInput] = useState(false)

  const [tokenInfo, setTokenInfo] = useState<TokenInfo | null>(null)
  const [streamingContent, setStreamingContent] = useState('')
  const streamIdRef = useRef<string | null>(null)
  const [connectingId, setConnectingId] = useState<string | null>(null)
  // Agent auto-execute result panel
  const [agentResults, setAgentResults] = useState<AgentResult[]>([])
  const [showResultPanel, setShowResultPanel] = useState(false)
  // Agent Skills State
  const [agentSkills, setAgentSkills] = useState<AgentSkill[]>([])
  const [activeLoadedSkills, setActiveLoadedSkills] = useState<Record<string, string[]>>({}) // sessionKey -> string[]
  const [showSkillManager, setShowSkillManager] = useState(false)
  const [showSkillDropdown, setShowSkillDropdown] = useState(false)
  const [showSaveSkillModal, setShowSaveSkillModal] = useState<{ isOpen: boolean; draftSkill?: Partial<AgentSkill> }>({ isOpen: false })
  const [showFileManager, setShowFileManager] = useState(false)
  const [showAiPanel, setShowAiPanel] = useState(true)
  // Workflow state
  const [activeWorkflow, setActiveWorkflow] = useState<Workflow | null>(null)
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

  const [platform, setPlatform] = useState<string>('darwin')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // Terminal refs
  const terminalRefs = useRef<Map<string, { terminal: Terminal; fitAddon: FitAddon; container: HTMLDivElement }>>(new Map())
  const terminalWrapperRef = useRef<HTMLDivElement>(null)
  const chatMessagesRef = useRef<HTMLDivElement>(null)
  const resizingRef = useRef(false)
  const chatPanelRef = useRef<HTMLDivElement>(null)
  const settingsRef = useRef(settings)
  settingsRef.current = settings
  const dataLoadedRef = useRef(false)
  // Refs for workflow engine (avoid stale closures in recursive setTimeout)
  const workflowRef = useRef(activeWorkflow)
  workflowRef.current = activeWorkflow
  const activeSessionIdRef = useRef(activeSessionId)
  activeSessionIdRef.current = activeSessionId
  const activeChatKeyRef = useRef(activeChatKey)
  activeChatKeyRef.current = activeChatKey
  // Ref for terminal settings (used in createTerminal to avoid stale closure)
  const termSettingsRef = useRef({
    termFontSize, termLineHeight, termTheme, termCursorStyle,
    termCursorBlink, termFontFamily, termScrollback, termBgImage
  })
  termSettingsRef.current = {
    termFontSize, termLineHeight, termTheme, termCursorStyle,
    termCursorBlink, termFontFamily, termScrollback, termBgImage
  }

  // Load data
  useEffect(() => {
    if (!window.electronAPI) return
    const load = async () => {
      try {
        const conns = await window.electronAPI.store.getConnections()
        setConnections(conns)
        const s = await window.electronAPI.store.getSettings()
        if (s) {
          setSettings(s)
          if (s.termBgImage) setTermBgImage(s.termBgImage)
          if (s.termFontSize != null) setTermFontSize(s.termFontSize)
          if (s.termLineHeight != null) setTermLineHeight(s.termLineHeight)
          if (s.termTheme) setTermTheme(s.termTheme)
          if (s.termCursorStyle) setTermCursorStyle(s.termCursorStyle)
          if (s.termCursorBlink != null) setTermCursorBlink(s.termCursorBlink)
          if (s.termOpacity != null) setTermOpacity(s.termOpacity)
          if (s.termScrollback != null) setTermScrollback(s.termScrollback)
          if (s.termFontFamily) setTermFontFamily(s.termFontFamily)
          if (s.sidebarCollapsed != null) setSidebarCollapsed(s.sidebarCollapsed)
        }
        // Load chat history
        const history = await window.electronAPI.chatHistory.getAll()
        if (history && history.length > 0) {
          setChatHistoryList(history)
          const map = new Map<string, AiMessage[]>()
          history.forEach((h: ChatHistoryEntry) => { map.set(h.sessionKey, h.messages) })
          setChatMessages(map)
        }
        const p = await window.electronAPI.window.getPlatform()
        setPlatform(p)
        // Load agents
        try {
          const agentList = await window.electronAPI.ai.getAgents()
          if (agentList) setAgents(agentList)
        } catch { /* first run */ }
        // Load skills
        try {
          const skillsList = await window.electronAPI.store.getSkills()
          if (skillsList) setAgentSkills(skillsList)
        } catch { /* error loading skills */ }
        // Mark data as loaded — allow auto-save from now on
        setTimeout(() => { dataLoadedRef.current = true }, 100)
      } catch {
        // first run
      }
    }
    load()
  }, [])

  // Streaming event listeners
  useEffect(() => {
    if (!window.electronAPI) return

    const removeDelta = window.electronAPI.ai.onStreamDelta((streamId, delta) => {
      if (streamIdRef.current === streamId) {
        setStreamingContent(prev => prev + delta)
      }
    })

    const removeEnd = window.electronAPI.ai.onStreamEnd((streamId) => {
      if (streamIdRef.current === streamId) {
        streamIdRef.current = null
        setAiLoading(false)
        // Finalize: move streamingContent to chatMessages
        setStreamingContent(prev => {
          if (prev) {
            // In relaxed mode: detect workflow JSON FIRST
            let isWorkflow = false
            let chatContent = prev

            if (settingsRef.current.relaxedMode && settingsRef.current.workflowMode) {
              try {
                let maybeJson = prev.trim()
                const jsonBlockMatch = maybeJson.match(/```(?:json)?\s*\n?([\s\S]*?)```/)
                if (jsonBlockMatch) maybeJson = jsonBlockMatch[1].trim()
                const braceMatch = maybeJson.match(/\{[\s\S]*\}/)
                if (braceMatch) maybeJson = braceMatch[0]
                const parsed = JSON.parse(maybeJson)
                if (parsed.workflow && parsed.steps && Array.isArray(parsed.steps)) {
                  isWorkflow = true
                  chatContent = `📋 已生成工作流计划「${parsed.title || '任务'}」，请在右侧面板查看并确认执行。`
                  createWorkflow({
                    title: parsed.title || '工作流',
                    description: parsed.description || '',
                    steps: parsed.steps
                  })
                }
              } catch { /* Not JSON */ }
            }

            const aiMsg: AiMessage = {
              role: 'assistant',
              content: chatContent,
              timestamp: Date.now(),
              agentId: activeAgentId
            }
            setChatMessages(prevMap => {
              const chatKey = activeChatKeyRef.current
              if (!chatKey) return prevMap
              const msgs = [...(prevMap.get(chatKey) || []), aiMsg]
              const newMap = new Map(prevMap)
              newMap.set(chatKey, msgs)
              // Persist
              const activeSession = sessions.find(s => s.id === activeSessionId)
              const conn = activeSession ? connections.find(c => c.id === activeSession.connectionId) : null
              window.electronAPI.chatHistory.save({
                sessionKey: chatKey,
                name: conn?.name || activeSession?.name || 'Unknown',
                messages: msgs,
                createdAt: Date.now(),
                updatedAt: Date.now()
              })
              // If not a workflow, fallback: extract commands and auto-execute
              if (!isWorkflow && settingsRef.current.relaxedMode) {
                const commands = extractCommands(prev)
                commands.forEach(cmd => {
                  if (!isDangerousCommand(cmd) && activeSessionId) {
                    // Detect write-type / multi-line commands that should run in the visible terminal
                    const isWriteCommand = /<<['"]?\w+['"]?|\bcat\s*>|\btee\s|\bmkdir\s|\btouch\s|\bcp\s|\bmv\s|\bchmod\s|\bchown\s|\bsed\s+-i|\becho\s.*>/i.test(cmd) || cmd.split('\n').length > 3
                    if (isWriteCommand) {
                      // Send to interactive terminal so the user sees it happen
                      window.electronAPI.ssh.sendData(activeSessionId, cmd + '\n')
                    } else {
                      handleAgentAutoExec(cmd)
                    }
                  }
                })
              }
              return newMap
            })
          }
          return ''
        })
      }
    })

    const removeError = window.electronAPI.ai.onStreamError((streamId, error) => {
      if (streamIdRef.current === streamId) {
        streamIdRef.current = null
        setAiLoading(false)
        setStreamingContent('')
        showToast(`AI 错误: ${error}`, 'error')
      }
    })

    const removeCompacted = window.electronAPI.ai.onCompacted((streamId, info) => {
      if (streamIdRef.current === streamId) {
        showToast(`📋 对话已压缩: ${info.tokensBefore} → ${info.tokensAfter} tokens`, 'success')
      }
    })

    return () => {
      removeDelta()
      removeEnd()
      removeError()
      removeCompacted()
    }
  }, [activeSessionId, activeAgentId, sessions, connections])

  // Update token info when chat messages change
  useEffect(() => {
    if (!window.electronAPI || !activeSessionId) return
    const activeSession = sessions.find(s => s.id === activeSessionId)
    const connId = activeSession?.connectionId
    if (!connId) return
    const msgs = chatMessages.get(connId) || []
    if (msgs.length === 0) { setTokenInfo(null); return }
    window.electronAPI.ai.getTokenInfo(
      msgs.map(m => ({ role: m.role, content: m.content })),
      settings.ai.model
    ).then(info => setTokenInfo(info)).catch(() => {})
  }, [chatMessages, activeSessionId, sessions, settings.ai.model])

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

      const ts = termSettingsRef.current
      const themeColors = TERMINAL_THEMES[ts.termTheme] || TERMINAL_THEMES['github-dark']
      const terminal = new Terminal({
        cursorBlink: ts.termCursorBlink,
        cursorStyle: ts.termCursorStyle,
        fontSize: ts.termFontSize,
        lineHeight: ts.termLineHeight,
        fontFamily: ts.termFontFamily,
        scrollback: ts.termScrollback,
        allowTransparency: true,
        theme: { ...themeColors, background: '#00000000' },
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
    const hasBg = !!(termBgImage || termBgImagePerSession.size > 0)
    terminalRefs.current.forEach((ref) => {
      ref.terminal.options.fontSize = termFontSize
      ref.terminal.options.lineHeight = termLineHeight
      ref.terminal.options.cursorStyle = termCursorStyle
      ref.terminal.options.cursorBlink = termCursorBlink
      ref.terminal.options.fontFamily = termFontFamily
      ref.terminal.options.scrollback = termScrollback
      ref.terminal.options.theme = hasBg
        ? { ...themeColors, background: '#00000000' }
        : themeColors
      ref.fitAddon.fit()
    })
  }, [termFontSize, termLineHeight, termTheme, termCursorStyle, termCursorBlink, termFontFamily, termScrollback, termBgImage, termBgImagePerSession])

  // Auto-save terminal settings when they change
  useEffect(() => {
    if (!dataLoadedRef.current) return
    const updated: AppSettings = {
      ...settingsRef.current,
      termFontSize, termLineHeight, termTheme, termCursorStyle,
      termCursorBlink, termOpacity, termScrollback, termFontFamily,
      termBgImage, sidebarCollapsed
    }
    setSettings(updated)
    window.electronAPI.store.saveSettings(updated)
  }, [termFontSize, termLineHeight, termTheme, termCursorStyle, termCursorBlink, termOpacity, termScrollback, termFontFamily, termBgImage, sidebarCollapsed])

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
    // Sync terminal state variables from settings page
    if (s.termFontSize != null) setTermFontSize(s.termFontSize)
    if (s.termLineHeight != null) setTermLineHeight(s.termLineHeight)
    if (s.termTheme) setTermTheme(s.termTheme)
    if (s.termCursorStyle) setTermCursorStyle(s.termCursorStyle)
    if (s.termCursorBlink != null) setTermCursorBlink(s.termCursorBlink)
    if (s.termOpacity != null) setTermOpacity(s.termOpacity)
    if (s.termScrollback != null) setTermScrollback(s.termScrollback)
    if (s.termFontFamily) setTermFontFamily(s.termFontFamily)
    if (s.termBgImage !== undefined) setTermBgImage(s.termBgImage ?? null)
    await window.electronAPI.store.saveSettings(s)
    showToast('设置已保存', 'success')
  }

  // Execute command in terminal (manual mode)
  const executeCommand = (cmd: string) => {
    if (!activeSessionId) return
    // For multi-line commands (heredocs etc.), send line-by-line with slight delay
    // so the PTY can process each line correctly
    const lines = cmd.split('\n')
    if (lines.length > 1) {
      lines.forEach((line, i) => {
        setTimeout(() => {
          window.electronAPI.ssh.sendData(activeSessionId!, line + '\n')
        }, i * 50)
      })
    } else {
      window.electronAPI.ssh.sendData(activeSessionId, cmd + '\n')
    }
  }

  // Agent auto-execute: hidden SSH exec → instant result → background AI analysis
  const handleAgentAutoExec = async (command: string) => {
    if (!activeSessionId || !activeConnectionId) return

    const resultId = `result-${Date.now()}-${Math.random().toString(36).slice(2)}`

    // Show loading state in result panel
    const loadingResult: AgentResult = {
      id: resultId,
      type: 'generic',
      title: '正在执行...',
      summary: '',
      timestamp: Date.now(),
      status: 'running',
      command
    }
    setAgentResults(prev => [loadingResult, ...prev])
    setShowResultPanel(true)

    try {
      // 1. Hidden SSH exec — instant for simple commands
      const execResult = await window.electronAPI.ssh.exec(activeSessionId, command)
      if (!execResult.success) {
        setAgentResults(prev => prev.map(r => r.id === resultId ? {
          ...r, status: 'error' as const, title: '执行失败', summary: execResult.error || '命令执行出错'
        } : r))
        return
      }

      const output = execResult.output || ''

      // Fallback function: if AI fails, just show raw output
      const rawLines = output.split('\n').filter(Boolean)
      const showFallback = () => {
        setAgentResults(prev => prev.map(r => r.id === resultId ? {
          ...r,
          status: 'done' as const,
          type: 'generic' as const,
          title: command.split(' ')[0] + ' 执行结果',
          summary: '执行完成，请展开查看详细的系统原始输出。',
          rawOutput: output
        } : r))
      }

      // 2. Background: send to AI for structured analysis
      // Notice we purposefully DO NOT set status='done' here, so the playful loading state stays visible!
      window.electronAPI.ai.chat(
        [{ role: 'user', content: `你是一个帮助Linux小白用户的助手。我在服务器上执行了命令 \`${command}\`，以下是输出结果：

\`\`\`
${output.slice(0, 3000)}
\`\`\`

请帮我分析这个结果，用大白话解释给完全不懂Linux的新手听。

要求：
1. summary 要用最通俗的大白话，像跟朋友聊天一样解释，比如"你的服务器内存还剩不少，暂时没啥问题"、"磁盘快满了，赶紧清理一下不然可能会出事"
2. 不要用任何英文专业术语，全部用中文大白话
3. 可以用比喻帮助理解，比如"内存就像手机运行内存，用太多会卡"
4. 如果有问题要给出简单的建议，告诉用户该怎么做
5. summary 控制在80字以内

请只回复以下 JSON 格式（不要其他内容）：
{
  "type": "memory|disk|process|network|service|generic",
  "title": "用大白话写的简短标题，比如'内存够用，不用担心'或'磁盘快满了！'",
  "summary": "大白话总结",
  "data": {
    // memory: { memoryTotal, memoryUsed, memoryFree, memoryPercent(数字0-100), swapTotal, swapUsed, processes: [{pid, name, cpu, mem}] }
    // disk: { disks: [{mount, size, used, avail, percent(数字0-100)}] }
    // process: { processes: [{pid, name, cpu, mem, user}] }
    // network: { connections: [{proto, local, remote, state}] }
    // service: { services: [{name, status(running|stopped|failed), description}] }
    // generic: { items: [{label, value, color?}] }  注：如果是generic类型且内容复杂（如docker信息），只需给出总结即可，不要把大段英文日志塞进 items，保持界面整洁干爽！
  }
}` }],
        settingsRef.current.ai,
        { agentId: activeAgentId }
      ).then(aiResult => {
        if (!aiResult.success || !aiResult.reply) {
          showFallback()
          return
        }
        try {
          let jsonStr = aiResult.reply.trim()
          const jsonMatch = jsonStr.match(/\`\`\`(?:json)?\s*\n?([\s\S]*?)\`\`\`/)
          if (jsonMatch) jsonStr = jsonMatch[1].trim()
          const braceMatch = jsonStr.match(/\{[\s\S]*\}/)
          if (braceMatch) jsonStr = braceMatch[0]
          const parsed = JSON.parse(jsonStr)
          
          setAgentResults(prev => prev.map(r => r.id === resultId ? {
            ...r,
            status: 'done' as const,
            type: parsed.type || 'generic',
            title: parsed.title || command.split(' ')[0] + ' 执行结果',
            summary: parsed.summary || '',
            data: parsed.data || undefined,
            rawOutput: output
          } : r))
        } catch {
          // AI parse failed, fallback to generic with AI text summary
          setAgentResults(prev => prev.map(r => r.id === resultId ? {
            ...r,
            status: 'done' as const,
            type: 'generic' as const,
            title: command.split(' ')[0] + ' 执行结果',
            summary: aiResult.reply!.slice(0, 300),
            rawOutput: output
          } : r))
        }
      }).catch(() => {
        showFallback()
      })

    } catch (err: any) {
      setAgentResults(prev => prev.map(r => r.id === resultId ? {
        ...r, status: 'error' as const, title: '执行出错', summary: err.message || String(err)
      } : r))
    }
  }

  // ===========================
  // WORKFLOW ENGINE
  // ===========================

  // Create a workflow from AI-generated plan
  const createWorkflow = (plan: { title: string; description: string; steps: Array<{ title: string; command: string; description: string }> }) => {
    const wf: Workflow = {
      id: `wf-${Date.now()}`,
      title: plan.title,
      description: plan.description,
      status: 'planning',
      currentNodeIndex: 0,
      createdAt: Date.now(),
      nodes: plan.steps.map((step, i) => ({
        id: `step-${i}-${Date.now()}`,
        title: step.title,
        command: step.command,
        description: step.description,
        status: 'pending' as const,
        selected: true
      }))
    }
    setActiveWorkflow(wf)
  }

  // User confirms — start executing
  const confirmWorkflow = () => {
    if (!activeWorkflow) return
    playWorkflowStart()
    setActiveWorkflow(prev => prev ? { ...prev, status: 'running', currentNodeIndex: 0 } : null)
    setTimeout(() => executeWorkflowStep(0), 300)
  }

  // Toggle a node's selected state (planning mode)
  const toggleWorkflowNode = (nodeId: string) => {
    setActiveWorkflow(prev => {
      if (!prev || prev.status !== 'planning') return prev
      const nodes = prev.nodes.map(n => n.id === nodeId ? { ...n, selected: !n.selected } : n)
      return { ...prev, nodes }
    })
  }

  // Execute a single workflow step (uses refs to avoid stale closures)
  const executeWorkflowStep = async (index: number) => {
    const sessionId = activeSessionIdRef.current
    const wf = workflowRef.current
    if (!sessionId || !wf) return
    
    if (index >= wf.nodes.length) {
      // All done!
      playWorkflowDone()
      setActiveWorkflow(prev => prev ? { ...prev, status: 'done' } : null)
      return
    }

    const node = wf.nodes[index]

    // Skip unselected nodes
    if (!node.selected) {
      setActiveWorkflow(prev => {
        if (!prev) return null
        const nodes = [...prev.nodes]
        nodes[index] = { ...nodes[index], status: 'skipped' }
        return { ...prev, nodes }
      })
      setTimeout(() => executeWorkflowStep(index + 1), 100)
      return
    }

    // Mark as running
    setActiveWorkflow(prev => {
      if (!prev) return null
      const nodes = [...prev.nodes]
      nodes[index] = { ...nodes[index], status: 'running' }
      return { ...prev, nodes, currentNodeIndex: index }
    })

    try {
      // Execute via hidden SSH
      const result = await window.electronAPI.ssh.exec(sessionId, node.command)

      if (result.success) {
        playStepComplete()
        const stepOutput = result.output || ''
        setActiveWorkflow(prev => {
          if (!prev) return null
          const nodes = [...prev.nodes]
          nodes[index] = { ...nodes[index], status: 'done', output: stepOutput }
          return { ...prev, nodes }
        })

        // AI analysis for this step — WAIT for it before next step
        try {
          const aiRes = await window.electronAPI.ai.chat(
            [{ role: 'user', content: `执行了命令 \`${node.command}\`，输出如下：
\`\`\`
${stepOutput.slice(0, 1500)}
\`\`\`
请用一句大白话（不超过50字）总结这个结果，给Linux小白看的，像跟朋友聊天。只回复总结文字，不要其他内容。` }],
            settingsRef.current.ai,
            { agentId: activeAgentId }
          )
          if (aiRes.success && aiRes.reply) {
            setActiveWorkflow(prev => {
              if (!prev) return null
              const nodes = [...prev.nodes]
              if (nodes[index]) nodes[index] = { ...nodes[index], summary: aiRes.reply!.trim() }
              return { ...prev, nodes }
            })
          }
        } catch { /* AI analysis failed, continue anyway */ }

        // Next step after summary is shown
        setTimeout(() => executeWorkflowStep(index + 1), 600)
      } else {
        // Step failed — get branch options from AI
        playStepError()
        const errorMsg = result.error || '命令执行失败'
        
        setActiveWorkflow(prev => {
          if (!prev) return null
          const nodes = [...prev.nodes]
          nodes[index] = { ...nodes[index], status: 'error', error: errorMsg }
          return { ...prev, nodes, status: 'paused' }
        })

        // Ask AI for branch options
        const branchResult = await window.electronAPI.ai.chat(
          [{ role: 'user', content: `工作流步骤"${node.title}"执行命令 \`${node.command}\` 失败了，错误信息：${errorMsg}

请给出2-3个备选方案，用 JSON 格式回复：
{ "branches": [{ "label": "方案名称", "description": "简单解释", "command": "替代命令" }] }` }],
          settingsRef.current.ai,
          { agentId: activeAgentId }
        )

        if (branchResult.success && branchResult.reply) {
          try {
            let jsonStr = branchResult.reply.trim()
            const m = jsonStr.match(/\{[\s\S]*\}/)
            if (m) jsonStr = m[0]
            const parsed = JSON.parse(jsonStr)
            if (parsed.branches) {
              setActiveWorkflow(prev => {
                if (!prev) return null
                const nodes = [...prev.nodes]
                nodes[index] = {
                  ...nodes[index],
                  branches: parsed.branches.map((b: any) => ({
                    label: b.label,
                    description: b.description,
                    nodes: [{ id: `branch-${Date.now()}-${Math.random().toString(36).slice(2)}`, title: b.label, command: b.command, description: b.description, status: 'pending' as const }]
                  }))
                }
                return { ...prev, nodes }
              })
            }
          } catch { /* ignore parse errors for branches */ }
        }
      }
    } catch (err: any) {
      playStepError()
      setActiveWorkflow(prev => {
        if (!prev) return null
        const nodes = [...prev.nodes]
        nodes[index] = { ...nodes[index], status: 'error', error: err.message || String(err) }
        return { ...prev, nodes, status: 'paused' }
      })
    }
  }

  // Handle branch selection — replace failed node with branch and continue
  const handleWorkflowBranch = async (nodeId: string, branchIdx: number) => {
    const wf = workflowRef.current
    if (!wf) return

    const nodeIndex = wf.nodes.findIndex(n => n.id === nodeId)
    if (nodeIndex === -1) return

    const node = wf.nodes[nodeIndex]
    const branch = node.branches?.[branchIdx]
    if (!branch || !branch.nodes[0]) return

    // Replace the failed node's command with the branch command and re-execute
    playWorkflowStart()
    setActiveWorkflow(prev => {
      if (!prev) return null
      const nodes = [...prev.nodes]
      nodes[nodeIndex] = {
        ...nodes[nodeIndex],
        title: branch.nodes[0].title,
        command: branch.nodes[0].command,
        description: branch.nodes[0].description,
        status: 'pending',
        error: undefined,
        output: undefined,
        branches: undefined
      }
      return { ...prev, nodes, status: 'running' }
    })

    setTimeout(() => executeWorkflowStep(nodeIndex), 300)
  }

  // Close workflow and save summary to chat
  const closeWorkflowWithSummary = () => {
    // ... existing closeWorkflowWithSummary ...
    const wf = workflowRef.current
    if (wf && wf.nodes.length > 0) {
      const lines: string[] = [`🎉 **工作流「${wf.title}」执行完成**\n`]
      wf.nodes.forEach((node, i) => {
        const icon = node.status === 'done' ? '✅' : node.status === 'error' ? '❌' : '⏭️'
        let line = `${icon} **${node.title}**`
        if (node.summary) line += ` — ${node.summary}`
        lines.push(line)
      })
      const summaryContent = lines.join('\n')

      const aiMsg: AiMessage = {
        role: 'assistant',
        content: summaryContent,
        timestamp: Date.now(),
        agentId: activeAgentId
      }
      const activeSession = sessions.find(s => s.id === activeSessionId)
      const chatKey = activeChatKeyRef.current
      if (chatKey) {
        setChatMessages(prevMap => {
          const msgs = [...(prevMap.get(chatKey) || []), aiMsg]
          const newMap = new Map(prevMap)
          newMap.set(chatKey, msgs)
          const conn = connections.find(c => c.id === activeSession?.connectionId)
          window.electronAPI.chatHistory.save({
            sessionKey: chatKey,
            name: conn?.name || activeSession?.name || 'Unknown',
            messages: msgs,
            createdAt: Date.now(),
            updatedAt: Date.now()
          })
          return newMap
        })
      }
    }
    setActiveWorkflow(null)
  }

  // --- Skill Synthesis ---
  const extractSkillFromHistory = async () => {
    if (!activeChatKey) return
    const messages = chatMessages.get(activeChatKey) || []
    if (messages.length === 0) {
      setToast({ message: '当前对话为空，无法提取技能', type: 'error' })
      return
    }

    setAiLoading(true)
    setToast({ message: '正在让AI压缩对话并提取核心技能...', type: 'success' })

    try {
      const historyStr = messages.map(m => `[${m.role}]: ${m.content}`).join('\n')
      
      const prompt = `你是一个资深的 Linux 架构师，负责审查以下聊天记录，并将其提炼为一个可高度复用的 "Agent 核心技能" (Skill)。
      
【原始对话】：
${historyStr.slice(-15000)}

【你的任务】：
请忽略错误尝试、闲聊和无关的输出日志，提取出：
1. 解决此问题的首要环境或前置条件。
2. 完整正确的命令执行步骤流。
3. 浓缩为一段可以直接塞给其他 AI 的 "System Prompt" (系统提示词)。在以后的对话中，如果用户遇到类似问题，AI只要看到你的这部分提示词，就能直接照做，不走弯路。

严格按照以下 XML 标签格式输出（不要输出 Markdown 的 code 块，直接输出内容即可）：
<skill>
  <title>提炼一个简短帅气的技能名，如 'Nginx HTTPS 一键部署'</title>
  <description>一句人话描述这个技能的作用</description>
  <tags>nginx, deploy, ssl</tags>
  <compressedContext>此处是用 Markdown 编写的提纯后的 System Prompt。内容包含排坑经验、完整的有效命令序列。必须浓缩、精炼。</compressedContext>
</skill>
`
      const result = await window.electronAPI.ai.chat(
        [{ role: 'user', content: prompt }], 
        settingsRef.current.ai, 
        { agentId: activeAgentId }
      )

      if (result.success && result.reply) {
        const reply = result.reply
        const titleMatch = reply.match(/<title>([\s\S]*?)<\/title>/i)
        const descMatch = reply.match(/<description>([\s\S]*?)<\/description>/i)
        const tagsMatch = reply.match(/<tags>([\s\S]*?)<\/tags>/i)
        const contextMatch = reply.match(/<compressedContext>([\s\S]*?)<\/compressedContext>/i)

        if (!titleMatch || !contextMatch) {
          throw new Error('AI 未返回完整的技能字段格式，请重试')
        }
        
        setShowSaveSkillModal({ 
          isOpen: true, 
          draftSkill: {
            title: titleMatch[1].trim(),
            description: descMatch ? descMatch[1].trim() : '',
            tags: tagsMatch ? tagsMatch[1].split(',').map(t => t.trim()).filter(Boolean) : [],
            compressedContext: contextMatch[1].trim()
          } 
        })
        setToast({ message: '技能提取成功，请审核保存', type: 'success' })
      } else {
        setToast({ message: '技能提取失败: ' + result.error, type: 'error' })
      }
    } catch (e: any) {
      setToast({ message: '技能提取解析错误: ' + e.message, type: 'error' })
    } finally {
      setAiLoading(false)
    }
  }

  // AI Chat — streaming version with Agent & Token management
  const handleSendChat = async () => {
    const rawInput = chatInput.trim()
    if ((!rawInput && attachedFiles.length === 0) || !activeSessionId || !activeChatKey || aiLoading) return

    setAiLoading(true)
    setStreamingContent('正在读取附件内容...')
    
    let finalInputContent = rawInput

    if (attachedFiles.length > 0) {
      for (const file of attachedFiles) {
        try {
          if (file.type === 'd') {
            setStreamingContent(`正在读取目录: ${file.name}...`)
            // Read folder contents up to 300 lines
            const execRes = await window.electronAPI.ssh.exec(activeSessionId, `ls -lah "${file.path}" | head -n 300`)
            if (execRes.success && execRes.output) {
              let content = execRes.output
              if (content.split('\n').length >= 295) {
                content += '\n\n[目录内容过长，已截断]'
              }
              finalInputContent = `<attached_directory path="${file.path}">\n${content}\n</attached_directory>\n\n` + finalInputContent
            } else {
              finalInputContent = `<attached_directory path="${file.path}">\n[读取目录失败: ${execRes.error}]\n</attached_directory>\n\n` + finalInputContent
            }
          } else {
            setStreamingContent(`正在读取文件: ${file.name}...`)
            // Read up to 50KB securely
            const execRes = await window.electronAPI.ssh.exec(activeSessionId, `head -c 50000 "${file.path}"`)
            if (execRes.success && execRes.output) {
              let content = execRes.output
              if (content.length >= 49500) {
                content += '\n\n[达到长度限制，已截断]'
              }
              finalInputContent = `<attached_file path="${file.path}">\n${content}\n</attached_file>\n\n` + finalInputContent
            } else {
              finalInputContent = `<attached_file path="${file.path}">\n[读取文件失败: ${execRes.error}]\n</attached_file>\n\n` + finalInputContent
            }
          }
        } catch (e: any) {
          finalInputContent = `[提取附件 ${file.path} 异常: ${e.message}]\n\n` + finalInputContent
        }
      }
      setAttachedFiles([])
    }

    const userMsg: AiMessage = {
      role: 'user',
      content: finalInputContent,
      timestamp: Date.now(),
      agentId: activeAgentId
    }

    const currentMessages = chatMessages.get(activeChatKey) || []
    const updatedMessages = [...currentMessages, userMsg]
    setChatMessages(new Map(chatMessages.set(activeChatKey, updatedMessages)))
    setChatInput('')
    setStreamingContent('')

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

    // Use streaming API with agent support
    const apiMessages: any[] = updatedMessages.map((m) => ({ role: m.role, content: m.content }))

    // Inject Active Skills (Context Engineering)
    const equippedSkillIds = activeLoadedSkills[activeChatKey] || []
    const equippedSkills = agentSkills.filter(s => equippedSkillIds.includes(s.id))
    if (equippedSkills.length > 0) {
      const skillsContext = equippedSkills.map(s => 
        `【装备技能: ${s.title}】\n${s.compressedContext}`
      ).join('\n\n')
      
      apiMessages.unshift({
        role: 'system',
        content: `你已预装载以下核心技能经验，请优先参考这些经过验证的步骤和规则解决用户问题：\n\n${skillsContext}`
      })
    }

    // In relaxed mode: inject workflow prompt so AI returns structured workflow JSON
    if (settings.relaxedMode && settings.workflowMode) {
      apiMessages.unshift({
        role: 'system' as any,
        content: `你是一个帮助Linux小白的服务器运维助手。当用户请求需要执行命令时，请生成一个工作流计划。

请用以下 JSON 格式回复（只回复 JSON，不要其他内容）：
{
  "workflow": true,
  "title": "用大白话描述这个任务",
  "description": "简单解释你要帮用户做什么",
  "steps": [
    { "title": "步骤标题(大白话)", "command": "要执行的Linux命令", "description": "用大白话解释这步在干什么" }
  ]
}

规则：
1. 标题和描述全部用大白话，不要专业术语
2. 每个步骤都要有清晰的解释，让Linux新手能看懂
3. 命令要准确可执行
4. 步骤不超过6个，简洁高效
5. 如果用户只是闲聊或问简单问题，正常回复文字即可，不需要工作流`
      })
    }

    const streamId = `stream-${Date.now()}-${Math.random().toString(36).slice(2)}`
    streamIdRef.current = streamId

    const result = await window.electronAPI.ai.chatStream(
      apiMessages,
      settings.ai,
      streamId,
      { agentId: activeAgentId, terminalContext: terminalContext || undefined }
    )

    if (!result.success) {
      setAiLoading(false)
      setStreamingContent('')
      streamIdRef.current = null
      showToast(`AI 错误: ${result.error}`, 'error')
    }
    // Note: streaming continues via IPC events (onStreamDelta/onStreamEnd/onStreamError)
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

  // Current session's messages — keyed by activeChatKey (supports multi-chat per connection)
  const activeSession = sessions.find((s) => s.id === activeSessionId)
  const activeConnectionId = activeSession?.connectionId || null

  // Auto-set activeChatKey when switching connections
  useEffect(() => {
    if (!activeConnectionId) { setActiveChatKey(null); return }
    // Find existing chat keys for this connection
    const existingKeys = Array.from(chatMessages.keys()).filter(k => k.startsWith(activeConnectionId + ':'))
    // Also check for legacy key (just connectionId)
    if (chatMessages.has(activeConnectionId)) existingKeys.unshift(activeConnectionId)
    if (existingKeys.length > 0) {
      // Use the last (most recent) key if current key doesn't belong to this connection
      if (!activeChatKey || !existingKeys.includes(activeChatKey)) {
        setActiveChatKey(existingKeys[existingKeys.length - 1])
      }
    } else {
      // Create first chat for this connection
      const newKey = `${activeConnectionId}:${Date.now()}`
      setActiveChatKey(newKey)
    }
  }, [activeConnectionId])

  const currentChatMessages = activeChatKey ? chatMessages.get(activeChatKey) || [] : []

  // Get all chat keys for current connection
  const connectionChatKeys = activeConnectionId
    ? Array.from(chatMessages.keys()).filter(k => k === activeConnectionId || k.startsWith(activeConnectionId + ':'))
        .filter(k => (chatMessages.get(k)?.length || 0) > 0)
    : []

  const createNewChat = () => {
    if (!activeConnectionId) return
    const newKey = `${activeConnectionId}:${Date.now()}`
    setActiveChatKey(newKey)
    setTokenInfo(null)
  }

  const connectedSessions = sessions.filter((s) => s.status === 'connected')

  return (
    <div className="app-layout">
      {/* SIDEBAR */}
      <div className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <div className="sidebar-header">
          {!sidebarCollapsed && <span className="sidebar-logo">OpenTerm</span>}
          <button className="sidebar-toggle-btn" onClick={() => setSidebarCollapsed(v => !v)}
            title={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              {sidebarCollapsed
                ? <><path d="M6 3l5 5-5 5"/><path d="M2 1v14"/></>
                : <><path d="M10 3l-5 5 5 5"/><path d="M14 1v14"/></>
              }
            </svg>
          </button>
        </div>

        <div className="sidebar-nav">
          <button
            className={`nav-item ${!activeSessionId && page === 'overview' ? 'active' : ''}`}
            onClick={() => {
              setActiveSessionId(null)
              setPage('overview')
            }}
            title="概览"
          >
            <span className="nav-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="1" y="1" width="6" height="6" rx="1"/><rect x="9" y="1" width="6" height="6" rx="1"/><rect x="1" y="9" width="6" height="6" rx="1"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg></span>
            {!sidebarCollapsed && <>
              概览
              {connections.length > 0 && (
                <span className="nav-badge">{connections.length}</span>
              )}
            </>}
          </button>
          <button
            className={`nav-item ${page === 'settings' && !activeSessionId ? 'active' : ''}`}
            onClick={() => {
              setActiveSessionId(null)
              setPage('settings')
            }}
            title="设置"
          >
            <span className="nav-icon"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="3"/><path d="M12.4 5.2a6 6 0 0 1 0 5.6M3.6 5.2a6 6 0 0 0 0 5.6M8 2v1M8 13v1M2 8h1M13 8h1M3.8 3.8l.7.7M11.5 11.5l.7.7M12.2 3.8l-.7.7M4.5 11.5l-.7.7"/></svg></span>
            {!sidebarCollapsed && '设置'}
          </button>

          {/* Sessions */}
          {connectedSessions.length > 0 && (
            <>
              {!sidebarCollapsed && <div className="sidebar-section-title">会话</div>}
              {sidebarCollapsed && <div className="sidebar-section-title" style={{ padding: '16px 0 6px', textAlign: 'center' }}>—</div>}
              {connectedSessions.map((session) => (
                <div
                  key={session.id}
                  className={`session-item ${activeSessionId === session.id ? 'active' : ''}`}
                  onClick={() => setActiveSessionId(session.id)}
                  title={session.name + ' — ' + session.host}
                >
                  <span className="session-dot" />
                  {!sidebarCollapsed && (
                    <>
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
                    </>
                  )}
                </div>
              ))}
            </>
          )}

          {/* Chat History in sidebar */}
          {!sidebarCollapsed && chatHistoryList.length > 0 && (
            <>
              <div className="sidebar-section-title">
                聊天历史
                <button className="sidebar-history-clear" onClick={() => {
                  window.electronAPI.chatHistory.clearAll()
                  setChatHistoryList([])
                  setChatMessages(new Map())
                }}>清除</button>
              </div>
              {chatHistoryList
                .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
                .slice(0, 20)
                .map(entry => (
                  <div key={entry.sessionKey}
                    className={`chat-history-sidebar-item ${activeConnectionId === entry.sessionKey ? 'active' : ''}`}
                    onClick={() => {
                      // Find connected session for this connectionId
                      const s = sessions.find(s => s.connectionId === entry.sessionKey && s.status === 'connected')
                      if (s) setActiveSessionId(s.id)
                    }}
                    title={`${entry.name} — ${entry.messages?.length || 0} 条消息`}
                  >
                    <svg className="chat-history-sidebar-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 3h12v10H2zM2 6h12"/><path d="M5 9h6"/></svg>
                    <span className="chat-history-sidebar-name">{entry.name}</span>
                    <span className="chat-history-sidebar-count">{entry.messages?.length || 0}</span>
                    <button className="chat-history-sidebar-del" onClick={(e) => {
                      e.stopPropagation()
                      window.electronAPI.chatHistory.delete(entry.sessionKey)
                      setChatHistoryList(prev => prev.filter(h => h.sessionKey !== entry.sessionKey))
                      setChatMessages(prev => { const m = new Map(prev); m.delete(entry.sessionKey); return m })
                    }}>×</button>
                  </div>
                ))}
            </>
          )}
          {sidebarCollapsed && chatHistoryList.length > 0 && (
            <>
              <div className="sidebar-section-title" style={{ padding: '16px 0 6px', textAlign: 'center' }}>—</div>
              {chatHistoryList
                .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
                .slice(0, 10)
                .map(entry => (
                  <div key={entry.sessionKey}
                    className={`chat-history-sidebar-item ${activeConnectionId === entry.sessionKey ? 'active' : ''}`}
                    onClick={() => {
                      const s = sessions.find(s => s.connectionId === entry.sessionKey && s.status === 'connected')
                      if (s) setActiveSessionId(s.id)
                    }}
                    title={`${entry.name} — ${entry.messages?.length || 0} 条消息`}
                  >
                    <svg className="chat-history-sidebar-icon" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 3h12v10H2zM2 6h12"/><path d="M5 9h6"/></svg>
                  </div>
                ))}
            </>
          )}
        </div>

        {connectedSessions.length > 0 && !sidebarCollapsed && (
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
              <button
                className={`mode-switch-btn ${showFileManager ? 'active' : ''}`}
                onClick={() => {
                  setShowFileManager(v => !v)
                  setTimeout(() => {
                    const ref = activeSessionId && terminalRefs.current.get(activeSessionId)
                    if (ref) ref.fitAddon.fit()
                  }, 250)
                }}
                style={{ marginRight: 8 }}
              >
                📁 文件区
              </button>
              <button
                className={`mode-switch-btn ${showAiPanel ? 'active' : ''}`}
                onClick={() => {
                  setShowAiPanel(v => !v)
                  setTimeout(() => {
                    const ref = activeSessionId && terminalRefs.current.get(activeSessionId)
                    if (ref) ref.fitAddon.fit()
                  }, 250)
                }}
                style={{ marginRight: 16 }}
              >
                🤖 AI 助手
              </button>
              <div className="mode-switch">
                <button
                  className={`mode-switch-btn ${viewMode === 'simple' ? 'active' : ''}`}
                  onClick={async () => {
                    if (viewMode === 'simple') return
                    setViewMode('simple')
                    const [w, h] = await window.electronAPI.window.getSize()
                    window.electronAPI.window.setSize(w - leftPanelWidth - rightPanelWidth, h)
                    setTimeout(() => {
                      const ref = activeSessionId && terminalRefs.current.get(activeSessionId)
                      if (ref) ref.fitAddon.fit()
                    }, 200)
                  }}
                >
                  📝 简洁
                </button>
                <button
                  className={`mode-switch-btn ${viewMode === 'engineering' ? 'active' : ''}`}
                  onClick={async () => {
                    if (viewMode === 'engineering') return
                    setViewMode('engineering')
                    const [w, h] = await window.electronAPI.window.getSize()
                    window.electronAPI.window.setSize(w + leftPanelWidth + rightPanelWidth, h)
                    setTimeout(() => {
                      const ref = activeSessionId && terminalRefs.current.get(activeSessionId)
                      if (ref) ref.fitAddon.fit()
                    }, 200)
                  }}
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
          {/* Window Controls (Windows/Linux only) */}
          {platform !== 'darwin' && (
            <div className="window-controls">
              <button className="window-ctrl-btn" onClick={() => window.electronAPI.window.minimize()}>
                <svg width="12" height="12" viewBox="0 0 12 12"><rect x="1" y="5.5" width="10" height="1" fill="currentColor"/></svg>
              </button>
              <button className="window-ctrl-btn" onClick={() => window.electronAPI.window.maximize()}>
                <svg width="12" height="12" viewBox="0 0 12 12"><rect x="1.5" y="1.5" width="9" height="9" rx="1" stroke="currentColor" strokeWidth="1" fill="none"/></svg>
              </button>
              <button className="window-ctrl-btn close" onClick={() => window.electronAPI.window.close()}>
                <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>
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
                          const dataUrl = await (window as any).electronAPI.file.readAsDataUrl(result.filePaths[0])
                          if (dataUrl) {
                            if (termBgMode === 'session' && activeSessionId) {
                              setTermBgImagePerSession(prev => new Map(prev).set(activeSessionId, dataUrl))
                            } else {
                              setTermBgImage(dataUrl)
                              const updated = { ...settings, termBgImage: dataUrl }
                              setSettings(updated)
                              window.electronAPI.store.saveSettings(updated)
                            }
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
                          const updated = { ...settings, termBgImage: null }
                          setSettings(updated)
                          window.electronAPI.store.saveSettings(updated)
                        }
                      }}>✕ 清除</button>
                    )}
                  </div>
                </div>
              )}
              {/* Terminal — layered: bg image -> overlay -> terminal */}
              <div className="terminal-container">
                {(() => {
                  const bg = (activeSessionId && termBgImagePerSession.get(activeSessionId)) || termBgImage
                  return bg ? (
                    <>
                      <div className="term-bg-layer" style={{
                        backgroundImage: `url('${bg}')`,
                        backgroundSize: 'cover',
                        backgroundPosition: 'center',
                        backgroundRepeat: 'no-repeat'
                      }} />
                      <div className="term-bg-overlay" style={{
                        background: (TERMINAL_THEMES[termTheme] || TERMINAL_THEMES['github-dark']).background,
                        opacity: termOpacity / 100
                      }} />
                    </>
                  ) : null
                })()}
                <div className="term-xterm-layer" ref={terminalWrapperRef} />
              </div>
              
              {/* File Manager is now moved to the responsive bottom area */}
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

          {/* Bottom Area (AI Chat & File Manager Split) */}
          {(showAiPanel || showFileManager) && activeSessionId && (
            <>
              {/* Shared Resize Handle */}
              <div
                className={`resize-handle ${resizingRef.current ? 'active' : ''}`}
                onMouseDown={handleResizeStart}
              />
              
              <div 
                className="bottom-panels-wrapper" 
                ref={chatPanelRef} 
                style={{ display: 'flex', flexDirection: 'row', minHeight: 120, height: 280, borderTop: '1px solid rgba(255,255,255,0.08)', backgroundColor: 'var(--bg-primary, #0d1117)', overflow: 'hidden' }}
              >
                {/* 1. File Manager Panel (Left) */}
                {showFileManager && (
                  <div className="bottom-panel-section" style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 300, borderRight: showAiPanel ? '1px solid rgba(255,255,255,0.06)' : 'none', overflow: 'hidden' }}>
                    <FileManagerPanel 
                      sessionId={activeSessionId} 
                      settings={settings}
                      onClose={() => setShowFileManager(false)} 
                      onToast={(msg, type) => setToast({ message: msg, type: type === 'info' ? 'success' : type as 'success' | 'error' })} 
                    />
                  </div>
                )}
                
                {/* 2. AI Chat Panel (Right) */}
                {showAiPanel && (
                  <div className="ai-chat-panel" style={{ flex: 1, height: '100%', minWidth: 300, borderTop: 'none' }}>
            <div className="ai-chat-header">
              <span className="ai-chat-title">
                <span className="sparkle">✨</span>
                Agent
              </span>
              {/* Model quick switch */}
              <div className="ai-model-switch-wrapper">
                <button className="ai-model-badge" onClick={() => setShowModelSwitch(v => !v)}>
                  {settings.ai.provider === 'anthropic' ? 'Claude' : settings.ai.provider === 'ollama' ? 'Ollama' : settings.ai.provider === 'custom' ? 'Custom' : 'OpenAI'} / {settings.ai.model || 'default'}
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2.5 4l2.5 2.5L7.5 4"/></svg>
                </button>
                {showModelSwitch && (
                  <div className="ai-model-dropdown">
                    <div className="ai-model-dropdown-title">快捷切换模型</div>
                    {[
                      { provider: 'custom' as const, models: ['gpt-5.3-codex', 'gpt-5.4-pro', 'gpt-5.2-codex'], label: 'Codex' },
                      { provider: 'openai' as const, models: ['gpt-4o-mini', 'gpt-4o', 'gpt-4-turbo', 'o3-mini'], label: 'OpenAI' },
                      { provider: 'anthropic' as const, models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-haiku-4-20250514'], label: 'Claude' },
                      { provider: 'ollama' as const, models: ['llama3', 'codellama', 'mistral', 'deepseek-coder'], label: 'Ollama' },
                    ].map(group => (
                      <div key={group.provider}>
                        <div className="ai-model-group-label">{group.label}</div>
                        {group.models.map(model => (
                          <button key={model}
                            className={`ai-model-option ${settings.ai.provider === group.provider && settings.ai.model === model ? 'active' : ''}`}
                            onClick={() => {
                              const defaults: Record<string, string> = {
                                openai: 'https://api.openai.com/v1/chat/completions',
                                anthropic: 'https://api.anthropic.com/v1/messages',
                                ollama: '',
                              }
                              // Codex models use their own endpoint + key
                              const isCodex = group.label === 'Codex'
                              const updated = {
                                ...settingsRef.current,
                                ai: {
                                  ...settingsRef.current.ai,
                                  provider: group.provider,
                                  model,
                                  apiUrl: isCodex ? 'https://www.codex.hair/v1/chat/completions' : (defaults[group.provider] || settingsRef.current.ai.apiUrl),
                                  ...(isCodex ? { apiKey: 'sk-3dd443b53bd1309c80cb9e00d32d657dfba7fb7dd0ca649de5741980efd74ebf' } : {})
                                }
                              }
                              setSettings(updated)
                              window.electronAPI.store.saveSettings(updated)
                              setShowModelSwitch(false)
                            }}
                          >{model}</button>
                        ))}
                      </div>
                    ))}
                    {/* Always show custom config if user has set a custom apiUrl */}
                    {(settings.ai.provider === 'custom' || (settings.ai.apiUrl && !settings.ai.apiUrl.includes('openai.com') && !settings.ai.apiUrl.includes('anthropic.com') && settings.ai.provider !== 'ollama')) && (
                      <div>
                        <div className="ai-model-group-label">自定义 API</div>
                        <button
                          className={`ai-model-option ${settings.ai.provider === 'custom' ? 'active' : ''}`}
                          onClick={() => {
                            // Switch back to custom config — keep existing apiUrl/apiKey/model
                            const updated = {
                              ...settingsRef.current,
                              ai: { ...settingsRef.current.ai, provider: 'custom' as const }
                            }
                            setSettings(updated)
                            window.electronAPI.store.saveSettings(updated)
                            setShowModelSwitch(false)
                          }}
                        >
                          {settings.ai.model}
                          <span className="ai-model-option-url">{settings.ai.apiUrl ? new URL(settings.ai.apiUrl).hostname : ''}</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="ai-chat-header-actions">
                {/* Agent Selector */}
                {agents.length > 0 && (
                  <div style={{ position: 'relative' }}>
                    <button
                      className="ai-header-btn"
                      title="切换 Agent 模式"
                      onClick={() => setShowAgentPicker(v => !v)}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, padding: '3px 8px', borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', width: 'auto', whiteSpace: 'nowrap' }}
                    >
                      <span>{agents.find(a => a.id === activeAgentId)?.icon || '🔧'}</span>
                      <span style={{ color: agents.find(a => a.id === activeAgentId)?.color }}>{agents.find(a => a.id === activeAgentId)?.name || 'Agent'}</span>
                    </button>
                    {showAgentPicker && (
                      <div style={{
                        position: 'absolute', top: '100%', right: 0, marginTop: 4, background: 'var(--bg-elevated, #1e1e2e)',
                        border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: 6, zIndex: 999,
                        minWidth: 200, boxShadow: '0 8px 32px rgba(0,0,0,0.4)'
                      }}>
                        {agents.map(agent => (
                          <button
                            key={agent.id}
                            onClick={() => { setActiveAgentId(agent.id); setShowAgentPicker(false) }}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px',
                              background: agent.id === activeAgentId ? 'rgba(255,255,255,0.08)' : 'transparent',
                              border: 'none', borderRadius: 8, cursor: 'pointer', color: 'var(--text-primary, #e0e0e0)',
                              fontSize: 13, textAlign: 'left'
                            }}
                          >
                            <span style={{ fontSize: 18 }}>{agent.icon}</span>
                            <div>
                              <div style={{ fontWeight: 500, color: agent.color }}>{agent.name}</div>
                              <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2, lineHeight: 1.3 }}>{agent.description}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {/* Token Usage Indicator */}
                {tokenInfo && tokenInfo.messagesCount > 0 && (
                  <div title={`Token: ${tokenInfo.currentTokens} / ${tokenInfo.contextWindow} (${tokenInfo.usageRatio}%)`}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)', padding: '0 4px' }}>
                    <div style={{
                      width: 40, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.1)', overflow: 'hidden'
                    }}>
                      <div style={{
                        width: `${Math.min(100, tokenInfo.usageRatio)}%`, height: '100%', borderRadius: 2,
                        background: tokenInfo.usageRatio > 80 ? '#f85149' : tokenInfo.usageRatio > 50 ? '#d29922' : '#3fb950',
                        transition: 'width 0.3s, background 0.3s'
                      }} />
                    </div>
                    <span>{tokenInfo.usageRatio}%</span>
                  </div>
                )}
                {/* Agent Result Panel toggle */}
                <button
                  className="ai-header-btn"
                  title={showResultPanel ? '关闭结果面板' : '打开结果面板'}
                  onClick={() => setShowResultPanel(v => !v)}
                  style={{ position: 'relative', width: 'auto', padding: '3px 8px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, borderRadius: 6, background: showResultPanel ? 'rgba(88,166,255,0.15)' : 'transparent', color: showResultPanel ? 'var(--accent-blue)' : 'var(--text-muted)' }}
                >
                  🤖
                  {agentResults.length > 0 && (
                    <span style={{ fontSize: 10, background: 'var(--accent-blue)', color: '#fff', borderRadius: 8, padding: '0 5px', minWidth: 16, textAlign: 'center', lineHeight: '16px' }}>{agentResults.length}</span>
                  )}
                </button>
                {/* Extract Skill */}
                {activeChatKey && currentChatMessages.length > 0 && (
                  <button 
                    className="ai-header-btn" 
                    title="提取核心技能 (Token压缩)" 
                    onClick={extractSkillFromHistory}
                    disabled={aiLoading}
                    style={{ fontSize: 13, gap: 4, width: 'auto', padding: '0 8px', color: 'var(--accent-yellow, #e3b341)' }}
                  >
                    ✨ 提取技能
                  </button>
                )}
                {/* Skill Manager */}
                <button 
                  className="ai-header-btn" 
                  title="管理 Agent 技能库" 
                  onClick={() => setShowSkillManager(true)}
                  style={{ fontSize: 13, gap: 4, width: 'auto', padding: '0 8px', color: 'var(--text-secondary)' }}
                >
                  📦 技能库
                </button>
                {/* Equip Skill Dropdown */}
                {activeChatKey && agentSkills.length > 0 && (
                  <div style={{ position: 'relative' }}>
                    <button 
                      className="ai-header-btn" 
                      title="为当前对话装备技能" 
                      onClick={() => setShowSkillDropdown(v => !v)}
                      style={{ fontSize: 13, gap: 4, width: 'auto', padding: '0 8px', color: (activeLoadedSkills[activeChatKey] && activeLoadedSkills[activeChatKey].length > 0) ? '#3fb950' : 'var(--text-secondary)' }}
                    >
                      📚 装备技能 {(activeLoadedSkills[activeChatKey]?.length || 0) > 0 ? `(${activeLoadedSkills[activeChatKey].length})` : ''}
                    </button>
                    {showSkillDropdown && (
                      <div style={{
                        position: 'absolute', top: '100%', right: 0, marginTop: 4, background: 'var(--bg-elevated, #1e1e2e)',
                        border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: 8, zIndex: 999,
                        minWidth: 240, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', maxHeight: 300, overflowY: 'auto'
                      }}>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8, padding: '0 4px', display: 'flex', justifyContent: 'space-between' }}>
                          <span>选择要装备的记忆：</span>
                          <span style={{ cursor: 'pointer', color: 'var(--accent-blue)' }} onClick={() => setShowSkillDropdown(false)}>完成</span>
                        </div>
                        {agentSkills.map(skill => {
                          const isEquipped = activeLoadedSkills[activeChatKey]?.includes(skill.id)
                          return (
                            <button
                              key={skill.id}
                              onClick={() => {
                                setActiveLoadedSkills(prev => {
                                  const current = prev[activeChatKey] || []
                                  const next = isEquipped ? current.filter(id => id !== skill.id) : [...current, skill.id]
                                  return { ...prev, [activeChatKey]: next }
                                })
                              }}
                              style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '8px 8px',
                                background: isEquipped ? 'rgba(88, 166, 255, 0.1)' : 'transparent',
                                border: 'none', borderRadius: 6, cursor: 'pointer', color: 'var(--text-primary)',
                                textAlign: 'left', marginBottom: 2
                              }}
                            >
                              <div style={{ flex: 1, overflow: 'hidden' }}>
                                <div style={{ fontSize: 13, fontWeight: 500, color: isEquipped ? 'var(--accent-blue)' : 'inherit', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{skill.title}</div>
                              </div>
                              {isEquipped && <span style={{ color: 'var(--accent-blue)', marginLeft: 8 }}>✓</span>}
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
                {/* Clear current session */}
                {activeChatKey && currentChatMessages.length > 0 && (
                  <button className="ai-header-btn" title="清除当前对话" onClick={() => {
                    setChatMessages(prev => { const m = new Map(prev); m.delete(activeChatKey); return m })
                    window.electronAPI.chatHistory.delete(activeChatKey)
                    setChatHistoryList(prev => prev.filter(h => h.sessionKey !== activeChatKey))
                    setTokenInfo(null)
                  }}>
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4h12M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M6 7v5M10 7v5M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9"/></svg>
                  </button>
                )}
                {/* New chat */}
                <button className="ai-header-btn" title="新建对话" onClick={createNewChat}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 3v10M3 8h10"/></svg>
                </button>
                <div className="relaxed-toggle" onClick={() => {
                  const updated = { ...settings, relaxedMode: !settings.relaxedMode }
                  setSettings(updated)
                  window.electronAPI.store.saveSettings(updated)
                }}>
                  <span className="relaxed-label">宽松</span>
                  <div className={`toggle-switch ${settings.relaxedMode ? 'on' : ''}`} />
                </div>
                <div className="relaxed-toggle" onClick={() => {
                  const updated = { ...settings, workflowMode: !settings.workflowMode }
                  setSettings(updated)
                  window.electronAPI.store.saveSettings(updated)
                }}>
                  <span className="relaxed-label">工作流</span>
                  <div className={`toggle-switch ${settings.workflowMode ? 'on' : ''}`} />
                </div>
              </div>
            </div>

            {/* Multi-chat tabs */}
            {connectionChatKeys.length > 1 && (
              <div className="chat-tabs-bar">
                {connectionChatKeys.map((key, i) => (
                  <button
                    key={key}
                    className={`chat-tab ${key === activeChatKey ? 'active' : ''}`}
                    onClick={() => setActiveChatKey(key)}
                    title={`对话 ${i + 1}`}
                  >
                    💬 {i + 1}
                  </button>
                ))}
              </div>
            )}

            <div className="ai-chat-messages" ref={chatMessagesRef}>
              {currentChatMessages.length === 0 && (() => {
                const tips = [
                  { icon: '💻', text: '"帮我查看内存使用情况"' },
                  { icon: '📊', text: '"检查磁盘空间够不够"' },
                  { icon: '🔍', text: '"找出最占CPU的进程"' },
                  { icon: '🐳', text: '"看看Docker容器运行状态"' },
                  { icon: '🌐', text: '"测试服务器网络通不通"' },
                  { icon: '🔧', text: '"帮我给服务器做个体检"' },
                ]
                const tipIndex = Math.floor((Date.now() / 3000) % tips.length)
                return (
                  <div className="ai-empty-state">
                    <div className="ai-empty-sparkle">✨</div>
                    <div className="ai-empty-title">用自然语言描述你想做的事</div>
                    <div className="ai-empty-tip" key={tipIndex}>
                      <span className="ai-empty-tip-icon">{tips[tipIndex].icon}</span>
                      <span>例如：{tips[tipIndex].text}</span>
                    </div>
                  </div>
                )
              })()}
              {currentChatMessages.map((msg, i) => (
                <ChatMessageView
                  key={i}
                  message={msg}
                  relaxedMode={settings.relaxedMode}
                  onExecute={executeCommand}
                />
              ))}
              {/* Streaming content — show AI response as it arrives */}
              {aiLoading && streamingContent && (() => {
                // In relaxed mode: if content looks like JSON workflow, show planning message
                const looksLikeJson = settings.relaxedMode && /^\s*[\{`]/.test(streamingContent)
                if (looksLikeJson) {
                  return (
                    <div className="ai-loading" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px' }}>
                      <div className="ai-loading-dots"><span /><span /><span /></div>
                      📋 正在规划工作流...
                    </div>
                  )
                }
                return (
                  <ChatMessageView
                    message={{ role: 'assistant', content: streamingContent, timestamp: Date.now() }}
                    relaxedMode={settings.relaxedMode}
                    onExecute={executeCommand}
                  />
                )
              })()}
              {aiLoading && !streamingContent && (
                <div className="ai-loading">
                  <div className="ai-loading-dots">
                    <span />
                    <span />
                    <span />
                  </div>
                  {agents.find(a => a.id === activeAgentId)?.icon || '✨'} {agents.find(a => a.id === activeAgentId)?.name || 'AI'} 正在思考...
                </div>
              )}
            </div>

            <div className="ai-chat-input-area">
              {attachedFiles.length > 0 && (
                <div className="ai-attached-files-container" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8, padding: '0 4px' }}>
                  {attachedFiles.map((file, i) => (
                    <div 
                      key={i} 
                      className="ai-file-pill" 
                      style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: '2px 8px', fontSize: 12 }}
                    >
                      <span>{file.type === 'd' ? '📁' : '📄'}</span>
                      <span style={{ maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={file.path}>{file.name}</span>
                      <button 
                        style={{ background: 'none', border: 'none', color: '#8b949e', cursor: 'pointer', padding: 0, marginLeft: 2, display: 'flex', alignItems: 'center' }}
                        onClick={() => setAttachedFiles(prev => prev.filter((_, idx) => idx !== i))}
                        title="移除附件"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div 
                className={`ai-chat-input-wrapper ${isDragOverInput ? 'drag-over' : ''}`}
                style={{
                  border: isDragOverInput ? '1px dashed var(--accent-blue)' : undefined,
                  background: isDragOverInput ? 'rgba(88, 166, 255, 0.05)' : undefined,
                  transition: 'all 0.2s',
                  position: 'relative'
                }}
                onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOverInput(true) }}
                onDragLeave={(e) => { e.preventDefault(); e.stopPropagation(); setIsDragOverInput(false) }}
                onDrop={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setIsDragOverInput(false)
                  try {
                    const data = e.dataTransfer.getData('application/sftp-file')
                    if (data) {
                      const fileInfo = JSON.parse(data)
                      setAttachedFiles(prev => {
                        if (prev.some(f => f.path === fileInfo.path)) return prev
                        return [...prev, fileInfo]
                      })
                    }
                  } catch (err) {}
                }}
              >
                {isDragOverInput && (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-elevated)', zIndex: 10, borderRadius: 8, color: 'var(--accent-blue)', fontSize: 13, pointerEvents: 'none' }}>
                    📥 松开附加到对话上下文
                  </div>
                )}
                <input
                  className="ai-chat-input"
                  placeholder={attachedFiles.length > 0 ? "输入问题让 Agent 分析文件..." : "输入问题，或从底部文件区拖拽文件到这里..."}
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
                  disabled={(!chatInput.trim() && attachedFiles.length === 0) || aiLoading}
                >
                  ➤
                </button>
              </div>
            </div>
                  </div>
                )}
              </div>
            </>
          )}
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

      {/* Right sidebar: Workflow Panel or Agent Result Panel */}
      {activeWorkflow && (
        <WorkflowPanel
          workflow={activeWorkflow}
          onConfirm={confirmWorkflow}
          onCancel={() => setActiveWorkflow(null)}
          onToggleNode={toggleWorkflowNode}
          onSelectBranch={handleWorkflowBranch}
          onClose={closeWorkflowWithSummary}
        />
      )}
      {!activeWorkflow && showResultPanel && (
        <AgentResultPanel
          results={agentResults}
          onClose={() => setShowResultPanel(false)}
          onClear={() => setAgentResults([])}
        />
      )}

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

      {/* Skill Modals */}
      <SkillEditorModal
        isOpen={showSaveSkillModal.isOpen}
        draftSkill={showSaveSkillModal.draftSkill}
        onClose={() => setShowSaveSkillModal({ isOpen: false })}
        onSave={async (skill) => {
          await window.electronAPI.store.saveSkill(skill)
          setAgentSkills(prev => {
            const idx = prev.findIndex(s => s.id === skill.id)
            if (idx >= 0) {
              const next = [...prev]
              next[idx] = skill
              return next
            }
            return [...prev, skill]
          })
          setShowSaveSkillModal({ isOpen: false })
          setToast({ message: '技能保存成功', type: 'success' })
        }}
      />

      <SkillManagerModal
        isOpen={showSkillManager}
        skills={agentSkills}
        onClose={() => setShowSkillManager(false)}
        onEdit={(skill) => {
          setShowSkillManager(false)
          setShowSaveSkillModal({ isOpen: true, draftSkill: skill })
        }}
        onDelete={async (id) => {
          await window.electronAPI.store.deleteSkill(id)
          setAgentSkills(prev => prev.filter(s => s.id !== id))
          setToast({ message: '技能已删除', type: 'success' })
        }}
        onImport={async (importedSkills) => {
          await window.electronAPI.store.importSkills(importedSkills)
          const newSkills = await window.electronAPI.store.getSkills()
          setAgentSkills(newSkills)
          setToast({ message: `成功导入 ${importedSkills.length} 个技能`, type: 'success' })
        }}
        onExport={() => {
          if (agentSkills.length === 0) return
          const jsonStr = JSON.stringify(agentSkills, null, 2)
          const blob = new Blob([jsonStr], { type: 'application/json' })
          const url = URL.createObjectURL(blob)
          const a = document.createElement('a')
          a.href = url
          a.download = `openterm-skills-${new Date().toISOString().slice(0, 10)}.json`
          a.click()
          URL.revokeObjectURL(url)
          setToast({ message: '技能已导出', type: 'success' })
        }}
      />

      {/* Toast */}
      {toast && <div className={`toast ${toast.type}`}>{toast.message}</div>}
    </div>
  )
}
