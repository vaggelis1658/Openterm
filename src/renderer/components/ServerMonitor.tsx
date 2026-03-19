import React, { useState, useEffect, useRef, useCallback } from 'react'

declare const window: Window & { electronAPI: any }

export interface ServerMetrics {
  os: {
    name: string
    hostname: string
    uptime: string
    loadAvg: string[]
    runningProcs: string
    totalProcs: string
  }
  cpu: {
    cores: number
    usagePercent: number
    user: number
    system: number
    io: number
    idle: number
  }
  ram: {
    total: number
    used: number
    cached: number
    available: number
    usagePercent: number
  }
  disks: {
    mount: string
    total: number
    used: number
    available: number
    usagePercent: number
  }[]
  network: {
    iface: string
    rxBytes: number
    txBytes: number
    rxRate: number
    txRate: number
  }[]
  processes: {
    pid: string
    user: string
    cpu: string
    mem: string
    cmd: string
  }[]
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B'
  if (bytes < 1024) return Math.round(bytes) + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  if (bytes < 1073741824) return (bytes / 1048576).toFixed(1) + ' MB'
  return (bytes / 1073741824).toFixed(2) + ' GB'
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const mins = Math.floor((seconds % 3600) / 60)
  if (days > 0) return `${days}天 ${hours}时`
  if (hours > 0) return `${hours}时 ${mins}分`
  return `${mins}分`
}

function UsageBar({ percent, color, label, detail }: { percent: number; color: string; label: string; detail: string }) {
  return (
    <div className="usage-bar-item">
      <div className="usage-bar-header">
        <span className="usage-bar-label">{label}</span>
        <span className="usage-bar-detail">{detail}</span>
      </div>
      <div className="usage-bar-track">
        <div className="usage-bar-fill" style={{ width: `${Math.min(percent, 100)}%`, background: color }} />
      </div>
    </div>
  )
}

function UsageRing({ percent, size = 52, color }: { percent: number; size?: number; color: string }) {
  const p = Math.min(Math.max(percent, 0), 100)
  const radius = (size - 6) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (p / 100) * circumference
  return (
    <svg width={size} height={size} className="usage-ring">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="var(--border-primary)" strokeWidth="4" />
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        fill="none" stroke={color} strokeWidth="4"
        strokeDasharray={circumference} strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.8s ease' }}
      />
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle"
        fill="var(--text-primary)" fontSize="11" fontWeight="600" fontFamily="var(--font-mono)"
      >
        {p}%
      </text>
    </svg>
  )
}

// ========== SINGLE shared hook — collect once, used by App.tsx ==========
export function useServerMetrics(sessionId: string | null) {
  const [metrics, setMetrics] = useState<ServerMetrics | null>(null)
  const [error, setError] = useState<string | null>(null)
  const prevNetRef = useRef<Map<string, { rx: number; tx: number; time: number }>>(new Map())

  useEffect(() => {
    if (!sessionId) {
      setMetrics(null)
      setError(null)
      return
    }

    let mounted = true
    let timer: ReturnType<typeof setInterval> | null = null

    const collect = async () => {
      if (!window.electronAPI || !sessionId || !mounted) return

      try {
        // Single batch of 6 commands
        const results = await Promise.all([
          window.electronAPI.ssh.exec(sessionId, `cat /etc/os-release 2>/dev/null | grep -E '^(PRETTY_NAME|ID)=' | head -2; echo '---SEP---'; hostname; echo '---SEP---'; cat /proc/uptime; echo '---SEP---'; cat /proc/loadavg`),
          window.electronAPI.ssh.exec(sessionId, `nproc; echo '---SEP---'; top -bn1 | grep '%Cpu'`),
          window.electronAPI.ssh.exec(sessionId, `free -b | grep -E 'Mem:'`),
          window.electronAPI.ssh.exec(sessionId, `df -B1 2>/dev/null | tail -n +2 | grep -vE 'tmpfs|devtmpfs|udev|overlay|shm' | head -8`),
          window.electronAPI.ssh.exec(sessionId, `cat /proc/net/dev 2>/dev/null | tail -n +3`),
          window.electronAPI.ssh.exec(sessionId, `ps aux --sort=-%cpu 2>/dev/null | head -8 | tail -7`)
        ])

        if (!mounted) return

        const osOut = results[0]?.output || ''
        const cpuOut = results[1]?.output || ''
        const ramOut = results[2]?.output || ''
        const diskOut = results[3]?.output || ''
        const netOut = results[4]?.output || ''
        const procOut = results[5]?.output || ''

        // Parse OS
        const prettyName = osOut.match(/PRETTY_NAME="?([^"\n]+)"?/)?.[1] || 'Linux'
        const sepParts = osOut.split('---SEP---')
        const hostname = (sepParts[1] || '').trim()
        const uptimeStr = (sepParts[2] || '').trim()
        const uptimeMatch = uptimeStr.match(/^(\d+\.?\d*)/)
        const uptimeSeconds = uptimeMatch ? parseFloat(uptimeMatch[1]) : 0
        const loadStr = (sepParts[3] || '').trim()
        const loadParts = loadStr.split(/\s+/)
        const procInfo = loadStr.match(/(\d+)\/(\d+)/)

        // Parse CPU
        const cpuParts = cpuOut.split('---SEP---')
        const cores = parseInt((cpuParts[0] || cpuOut.split('\n')[0] || '').trim()) || 1
        const cpuLine = cpuOut
        const cpuMatch = cpuLine.match(/(\d+\.?\d*)\s*us.*?(\d+\.?\d*)\s*sy.*?(\d+\.?\d*)\s*ni.*?(\d+\.?\d*)\s*id.*?(\d+\.?\d*)\s*wa/)
        const cpuUser = cpuMatch ? parseFloat(cpuMatch[1]) : 0
        const cpuSys = cpuMatch ? parseFloat(cpuMatch[2]) : 0
        const cpuIo = cpuMatch ? parseFloat(cpuMatch[5]) : 0
        const cpuIdle = cpuMatch ? parseFloat(cpuMatch[4]) : 0

        // Parse RAM
        const ramParts = ramOut.trim().split(/\s+/)
        const ramTotal = parseInt(ramParts[1]) || 1
        const ramUsed = parseInt(ramParts[2]) || 0
        const ramCached = parseInt(ramParts[5]) || 0
        const ramAvailable = parseInt(ramParts[6]) || ramTotal - ramUsed

        // Parse Disks — use standard df output: fs size used avail use% mount
        const disks = diskOut.trim().split('\n').filter(Boolean).map((line: string) => {
          const parts = line.trim().split(/\s+/)
          // standard df -B1: filesystem 1B-blocks used available use% mountpoint
          const total = parseInt(parts[1]) || 0
          const used = parseInt(parts[2]) || 0
          const available = parseInt(parts[3]) || 0
          const usagePercent = parseInt(parts[4]) || 0
          const mount = parts[5] || parts[0] || '/'
          return { mount, total, used, available, usagePercent }
        }).filter((d) => d.total > 0)

        // Parse Network
        const now = Date.now()
        const prevNet = prevNetRef.current
        const network = netOut.trim().split('\n').filter(Boolean).map((line: string) => {
          const m = line.trim().match(/^(\S+?):\s*(\d+)\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+\d+\s+(\d+)/)
          if (!m) return null
          const iface = m[1]
          const rxBytes = parseInt(m[2]) || 0
          const txBytes = parseInt(m[3]) || 0
          const prev = prevNet.get(iface)
          const dt = prev ? Math.max((now - prev.time) / 1000, 0.5) : 3
          const rxRate = prev ? Math.max(0, (rxBytes - prev.rx) / dt) : 0
          const txRate = prev ? Math.max(0, (txBytes - prev.tx) / dt) : 0
          prevNet.set(iface, { rx: rxBytes, tx: txBytes, time: now })
          return { iface, rxBytes, txBytes, rxRate, txRate }
        }).filter((n): n is NonNullable<typeof n> => n !== null && n.iface !== 'lo' && (n.rxBytes > 0 || n.txBytes > 0))

        // Parse Processes
        const processes = procOut.trim().split('\n').filter(Boolean).map((line: string) => {
          const parts = line.trim().split(/\s+/)
          return {
            pid: parts[1] || '',
            user: parts[0] || '',
            cpu: parts[2] || '0',
            mem: parts[3] || '0',
            cmd: parts.slice(10).join(' ').substring(0, 30) || parts[parts.length - 1] || ''
          }
        })

        if (mounted) {
          setMetrics({
            os: {
              name: prettyName,
              hostname,
              uptime: formatUptime(uptimeSeconds),
              loadAvg: [loadParts[0] || '0', loadParts[1] || '0', loadParts[2] || '0'],
              runningProcs: procInfo ? procInfo[1] : '0',
              totalProcs: procInfo ? procInfo[2] : '0'
            },
            cpu: { cores, usagePercent: Math.round(100 - cpuIdle), user: cpuUser, system: cpuSys, io: cpuIo, idle: cpuIdle },
            ram: { total: ramTotal, used: ramUsed, cached: ramCached, available: ramAvailable, usagePercent: Math.round((ramUsed / ramTotal) * 100) },
            disks,
            network,
            processes
          })
          setError(null)
        }
      } catch (e: any) {
        if (mounted) setError(e.message)
      }
    }

    collect()
    timer = setInterval(collect, 3000)
    return () => {
      mounted = false
      if (timer) clearInterval(timer)
    }
  }, [sessionId])

  return { metrics, error }
}

// ========== LEFT PANEL: OS, CPU, RAM ==========
export function MonitorLeft({ metrics, error }: { metrics: ServerMetrics | null; error: string | null }) {
  if (error) return <div className="monitor-panel"><div className="monitor-error"><span>⚠️</span><span>采集失败</span></div></div>
  if (!metrics) return <div className="monitor-panel"><div className="monitor-loading"><div className="connecting-spinner" /><span>加载中...</span></div></div>

  const cpuColor = metrics.cpu.usagePercent > 80 ? 'var(--accent-red)' : metrics.cpu.usagePercent > 50 ? 'var(--accent-orange)' : 'var(--accent-green)'
  const ramColor = metrics.ram.usagePercent > 80 ? 'var(--accent-red)' : metrics.ram.usagePercent > 50 ? 'var(--accent-orange)' : 'var(--accent-blue)'

  return (
    <div className="monitor-panel">
      {/* OS */}
      <div className="monitor-card">
        <div className="monitor-card-header">
          <span className="monitor-card-icon"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="12" height="9" rx="1.5"/><path d="M5 14h6M8 11v3"/></svg></span>
          <span className="monitor-card-title">系统</span>
          <span className="monitor-card-badge">{metrics.os.hostname}</span>
        </div>
        <div className="monitor-card-body">
          <div className="monitor-kv"><span className="monitor-key">系统</span><span className="monitor-value">{metrics.os.name}</span></div>
          <div className="monitor-kv"><span className="monitor-key">运行</span><span className="monitor-value">{metrics.os.uptime}</span></div>
          <div className="monitor-kv"><span className="monitor-key">进程</span><span className="monitor-value">{metrics.os.runningProcs}/{metrics.os.totalProcs}</span></div>
          <div className="monitor-kv"><span className="monitor-key">负载</span><span className="monitor-value mono">{metrics.os.loadAvg.join(' / ')}</span></div>
        </div>
      </div>

      {/* CPU */}
      <div className="monitor-card">
        <div className="monitor-card-header">
          <span className="monitor-card-icon"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="3" width="12" height="10" rx="2"/><circle cx="6" cy="8" r="1.5"/><circle cx="10" cy="8" r="1.5"/><path d="M4 6h8"/></svg></span>
          <span className="monitor-card-title">CPU</span>
          <span className="monitor-card-badge">{metrics.cpu.cores} 核</span>
        </div>
        <div className="monitor-card-body">
          <div className="monitor-cpu-ring-row">
            <UsageRing percent={metrics.cpu.usagePercent} color={cpuColor} />
            <div className="cpu-detail-grid">
              <div className="cpu-detail"><span className="cpu-label">USER</span><span className="cpu-val">{metrics.cpu.user.toFixed(1)}%</span></div>
              <div className="cpu-detail"><span className="cpu-label">SYS</span><span className="cpu-val">{metrics.cpu.system.toFixed(1)}%</span></div>
              <div className="cpu-detail"><span className="cpu-label" style={{ color: 'var(--accent-red)' }}>IO</span><span className="cpu-val">{metrics.cpu.io.toFixed(1)}%</span></div>
              <div className="cpu-detail"><span className="cpu-label">IDLE</span><span className="cpu-val">{metrics.cpu.idle.toFixed(1)}%</span></div>
            </div>
          </div>
        </div>
      </div>

      {/* RAM */}
      <div className="monitor-card">
        <div className="monitor-card-header">
          <span className="monitor-card-icon"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="2" width="12" height="12" rx="2"/><path d="M2 6h12M2 10h12"/><circle cx="12" cy="8" r="0.8" fill="currentColor"/></svg></span>
          <span className="monitor-card-title">内存</span>
          <span className="monitor-card-badge">{formatBytes(metrics.ram.total)}</span>
        </div>
        <div className="monitor-card-body">
          <UsageBar
            percent={metrics.ram.usagePercent}
            color={ramColor}
            label={`${metrics.ram.usagePercent}%`}
            detail={`${formatBytes(metrics.ram.used)} / ${formatBytes(metrics.ram.total)}`}
          />
          <div className="ram-detail-row">
            <div className="ram-detail"><span className="ram-dot" style={{ background: ramColor }} /><span>已用 {formatBytes(metrics.ram.used)}</span></div>
            <div className="ram-detail"><span className="ram-dot" style={{ background: 'var(--accent-purple)' }} /><span>缓存 {formatBytes(metrics.ram.cached)}</span></div>
            <div className="ram-detail"><span className="ram-dot" style={{ background: 'var(--accent-green)' }} /><span>可用 {formatBytes(metrics.ram.available)}</span></div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ========== RIGHT PANEL: DISK, NET, PROC ==========
export function MonitorRight({ metrics, error }: { metrics: ServerMetrics | null; error: string | null }) {
  if (error) return <div className="monitor-panel"><div className="monitor-error"><span>⚠️</span><span>采集失败</span></div></div>
  if (!metrics) return <div className="monitor-panel"><div className="monitor-loading"><div className="connecting-spinner" /><span>加载中...</span></div></div>

  return (
    <div className="monitor-panel">
      {/* Disks */}
      <div className="monitor-card">
        <div className="monitor-card-header">
          <span className="monitor-card-icon"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="2"/><path d="M8 2v4M8 10v4"/></svg></span>
          <span className="monitor-card-title">磁盘</span>
        </div>
        <div className="monitor-card-body">
          {metrics.disks.length === 0 ? (
            <div className="monitor-empty">暂无数据</div>
          ) : metrics.disks.map((d) => {
            const c = d.usagePercent > 90 ? 'var(--accent-red)' : d.usagePercent > 70 ? 'var(--accent-orange)' : 'var(--accent-green)'
            return (
              <div key={d.mount} className="disk-item">
                <UsageBar
                  percent={d.usagePercent}
                  color={c}
                  label={d.mount}
                  detail={`${formatBytes(d.used)} / ${formatBytes(d.total)}`}
                />
              </div>
            )
          })}
        </div>
      </div>

      {/* Network */}
      <div className="monitor-card">
        <div className="monitor-card-header">
          <span className="monitor-card-icon"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="6"/><ellipse cx="8" cy="8" rx="3" ry="6"/><path d="M2 8h12M3 4.5h10M3 11.5h10"/></svg></span>
          <span className="monitor-card-title">网络</span>
        </div>
        <div className="monitor-card-body">
          {metrics.network.length === 0 ? (
            <div className="monitor-empty">暂无数据</div>
          ) : metrics.network.map((n) => (
            <div key={n.iface} className="net-item">
              <span className="net-iface">{n.iface}</span>
              <div className="net-rates">
                <span className="net-rate rx">↓ {formatBytes(n.rxRate)}/s</span>
                <span className="net-rate tx">↑ {formatBytes(n.txRate)}/s</span>
              </div>
              <div className="net-total">
                总计 ↓ {formatBytes(n.rxBytes)} ↑ {formatBytes(n.txBytes)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Processes */}
      <div className="monitor-card">
        <div className="monitor-card-header">
          <span className="monitor-card-icon"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 14V9M6 14V6M10 14V4M14 14V2"/></svg></span>
          <span className="monitor-card-title">进程 TOP</span>
        </div>
        <div className="monitor-card-body monitor-proc-table">
          <div className="proc-header">
            <span>PID</span><span>CMD</span><span>CPU</span><span>MEM</span>
          </div>
          {metrics.processes.length === 0 ? (
            <div className="proc-row"><span className="monitor-empty" style={{ gridColumn: '1 / -1' }}>暂无数据</span></div>
          ) : metrics.processes.map((p, i) => (
            <div key={i} className="proc-row">
              <span className="proc-pid">{p.pid}</span>
              <span className="proc-cmd">{p.cmd}</span>
              <span className="proc-cpu">{p.cpu}</span>
              <span className="proc-mem">{p.mem}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
