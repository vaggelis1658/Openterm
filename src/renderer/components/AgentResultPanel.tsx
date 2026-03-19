import { useState } from 'react'
import type { AgentResult } from '../types'

// ===========================
// Progress Bar Component
// ===========================
function ProgressBar({ percent, color, label, detail }: { percent: number; color?: string; label?: string; detail?: string }) {
  const barColor = color || (percent > 90 ? '#f85149' : percent > 70 ? '#d29922' : percent > 50 ? '#58a6ff' : '#3fb950')
  return (
    <div className="agent-progress-row">
      {label && <span className="agent-progress-label">{label}</span>}
      <div className="agent-progress-track">
        <div className="agent-progress-fill" style={{ width: `${Math.min(100, percent)}%`, background: barColor }} />
      </div>
      <span className="agent-progress-value">{detail || `${percent}%`}</span>
    </div>
  )
}

// ===========================
// Memory Card
// ===========================
function MemoryCard({ result }: { result: AgentResult }) {
  const d = result.data
  return (
    <div className="agent-card memory">
      <div className="agent-card-icon">🧠</div>
      <div className="agent-card-content">
        <div className="agent-card-title">{result.title}</div>
        {d?.memoryPercent != null && (
          <ProgressBar percent={d.memoryPercent} label="内存" detail={`${d.memoryUsed || '?'} / ${d.memoryTotal || '?'}`} />
        )}
        {d?.swapUsed && d.swapTotal && (
          <ProgressBar percent={parseFloat(d.swapUsed) / Math.max(1, parseFloat(d.swapTotal)) * 100} label="Swap" detail={`${d.swapUsed} / ${d.swapTotal}`} color="#a371f7" />
        )}
        {d?.processes && d.processes.length > 0 && (
          <div className="agent-proc-list">
            <div className="agent-proc-header">
              <span>进程</span><span>CPU</span><span>内存</span>
            </div>
            {d.processes.slice(0, 8).map((p, i) => (
              <div key={i} className="agent-proc-row" style={{ animationDelay: `${i * 60}ms` }}>
                <span className="agent-proc-name" title={p.name}>{p.name}</span>
                <span className="agent-proc-cpu">{p.cpu}</span>
                <span className="agent-proc-mem">{p.mem}</span>
              </div>
            ))}
          </div>
        )}
        <div className="agent-card-summary">{result.summary}</div>
      </div>
    </div>
  )
}

// ===========================
// Disk Card
// ===========================
function DiskCard({ result }: { result: AgentResult }) {
  const d = result.data
  return (
    <div className="agent-card disk">
      <div className="agent-card-icon">💾</div>
      <div className="agent-card-content">
        <div className="agent-card-title">{result.title}</div>
        {d?.disks?.map((disk, i) => (
          <ProgressBar key={i} percent={disk.percent} label={disk.mount} detail={`${disk.used} / ${disk.size}`} />
        ))}
        <div className="agent-card-summary">{result.summary}</div>
      </div>
    </div>
  )
}

// ===========================
// Process Card
// ===========================
function ProcessCard({ result }: { result: AgentResult }) {
  const d = result.data
  return (
    <div className="agent-card process">
      <div className="agent-card-icon">⚙️</div>
      <div className="agent-card-content">
        <div className="agent-card-title">{result.title}</div>
        {d?.processes && d.processes.length > 0 && (
          <div className="agent-proc-list">
            <div className="agent-proc-header">
              <span>PID</span><span>进程</span><span>CPU</span><span>内存</span>
            </div>
            {d.processes.slice(0, 10).map((p, i) => (
              <div key={i} className="agent-proc-row" style={{ animationDelay: `${i * 50}ms` }}>
                <span className="agent-proc-pid">{p.pid}</span>
                <span className="agent-proc-name" title={p.name}>{p.name}</span>
                <span className="agent-proc-cpu">{p.cpu}</span>
                <span className="agent-proc-mem">{p.mem}</span>
              </div>
            ))}
          </div>
        )}
        <div className="agent-card-summary">{result.summary}</div>
      </div>
    </div>
  )
}

// ===========================
// Service Card
// ===========================
function ServiceCard({ result }: { result: AgentResult }) {
  const d = result.data
  return (
    <div className="agent-card service">
      <div className="agent-card-icon">🔌</div>
      <div className="agent-card-content">
        <div className="agent-card-title">{result.title}</div>
        {d?.services?.map((svc, i) => (
          <div key={i} className="agent-service-row" style={{ animationDelay: `${i * 60}ms` }}>
            <span className={`agent-service-dot ${svc.status}`} />
            <span className="agent-service-name">{svc.name}</span>
            <span className={`agent-service-status ${svc.status}`}>
              {svc.status === 'running' ? '运行中' : svc.status === 'stopped' ? '已停止' : '异常'}
            </span>
          </div>
        ))}
        <div className="agent-card-summary">{result.summary}</div>
      </div>
    </div>
  )
}

// ===========================
// Generic Card
// ===========================
function GenericCard({ result }: { result: AgentResult }) {
  const d = result.data
  return (
    <div className="agent-card generic">
      <div className="agent-card-icon">📋</div>
      <div className="agent-card-content">
        <div className="agent-card-title">{result.title}</div>
        {d?.items?.map((item, i) => (
          <div key={i} className="agent-kv-row" style={{ animationDelay: `${i * 50}ms` }}>
            <span className="agent-kv-label">{item.label}</span>
            <span className="agent-kv-value" style={item.color ? { color: item.color } : {}}>{item.value}</span>
          </div>
        ))}
        <div className="agent-card-summary">{result.summary}</div>
      </div>
    </div>
  )
}

// ===========================
// Loading Skeleton
// ===========================
const PLAYFUL_LOADING_PHRASES = [
  'Agent 正在服务器里吃香蕉 🍌...',
  'Agent 正在疯狂敲打键盘 ⌨️...',
  'Agent 正在主板上跑酷 🏃‍♂️...',
  'Agent 遇到了一只 Bug，正在搏斗 🐛...',
  'Agent 正在努力思考，脑袋冒烟了 💨...',
  'Agent 正在偷看系统日志 🔍...',
  'Agent 喝了口咖啡，马上就好 ☕...',
  'Agent 正在跟 CPU 称兄道弟 🤝...',
  'Agent 翻出了祖传的代码手册 📖...',
  'Agent 正在给服务器做马杀鸡 💆‍♂️...'
]

function LoadingSkeleton({ command }: { command: string }) {
  // Use a ref to keep the random phrase stable during re-renders,
  // or use state and cycle it. Let's just pick one randomly on mount.
  const [phrase] = useState(() => PLAYFUL_LOADING_PHRASES[Math.floor(Math.random() * PLAYFUL_LOADING_PHRASES.length)])

  return (
    <div className="agent-card loading">
      <div className="agent-card-icon">
        <div className="agent-spinner" />
      </div>
      <div className="agent-card-content">
        <div className="agent-card-title" style={{ color: 'var(--accent-blue)', fontSize: 13, fontWeight: 600 }}>{phrase}</div>
        <div className="agent-loading-cmd">$ {command}</div>
        <div className="agent-skeleton-lines">
          <div className="agent-skeleton-line" style={{ width: '80%' }} />
          <div className="agent-skeleton-line" style={{ width: '60%', animationDelay: '0.15s' }} />
          <div className="agent-skeleton-line" style={{ width: '70%', animationDelay: '0.3s' }} />
        </div>
      </div>
    </div>
  )
}

// ===========================
// MAIN: AgentResultPanel
// ===========================
export function AgentResultPanel({ results, onClose, onClear }: {
  results: AgentResult[]
  onClose: () => void
  onClear: () => void
}) {
  const [showRaw, setShowRaw] = useState<string | null>(null)

  const renderCard = (result: AgentResult) => {
    if (result.status === 'running') {
      return <LoadingSkeleton key={result.id} command={result.command} />
    }

    switch (result.type) {
      case 'memory': return <MemoryCard key={result.id} result={result} />
      case 'disk': return <DiskCard key={result.id} result={result} />
      case 'process': return <ProcessCard key={result.id} result={result} />
      case 'service': return <ServiceCard key={result.id} result={result} />
      default: return <GenericCard key={result.id} result={result} />
    }
  }

  return (
    <div className="agent-result-panel">
      <div className="agent-result-header">
        <span className="agent-result-title">
          <span className="agent-result-icon">🤖</span>
          执行结果
        </span>
        <div className="agent-result-actions">
          {results.length > 0 && (
            <button className="agent-result-btn" onClick={onClear} title="清除结果">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M2 4h12M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1M6 7v5M10 7v5M3 4l1 9a1 1 0 001 1h6a1 1 0 001-1l1-9" /></svg>
            </button>
          )}
          <button className="agent-result-btn" onClick={onClose} title="关闭面板">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8" /></svg>
          </button>
        </div>
      </div>

      <div className="agent-result-body">
        {results.length === 0 && (
          <div className="agent-result-empty">
            <div className="agent-result-empty-icon">🤖</div>
            <div>宽松模式下提问后</div>
            <div>结果会自动显示在这里</div>
          </div>
        )}
        {results.map((result) => (
          <div key={result.id} className="agent-result-item">
            {renderCard(result)}
            {result.rawOutput && (
              <div className="agent-raw-toggle">
                <button onClick={() => setShowRaw(showRaw === result.id ? null : result.id)}>
                  {showRaw === result.id ? '收起原始输出 ▲' : '查看原始输出 ▼'}
                </button>
                {showRaw === result.id && (
                  <pre className="agent-raw-output">{result.rawOutput}</pre>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
