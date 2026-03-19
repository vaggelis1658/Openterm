import { useRef, useEffect, useState } from 'react'
import type { Workflow, WorkflowNode } from '../types'

// ===========================
// SVG Flowing Connector
// ===========================
function FlowConnector({ done, active }: { done?: boolean; active?: boolean }) {
  return (
    <div className="wf-svg-connector-wrap">
      <svg width="2" height="32" viewBox="0 0 2 32" className={`wf-svg-connector ${done ? 'done' : ''} ${active ? 'active' : ''}`}>
        <line x1="1" y1="0" x2="1" y2="32" className="wf-line-bg" />
        <line x1="1" y1="0" x2="1" y2="32" className="wf-line-flow" />
      </svg>
    </div>
  )
}

// ===========================
// SVG Branch Visualization
// ===========================
function BranchPaths({
  branches,
  nodeId,
  onSelect
}: {
  branches: { label: string; description: string }[]
  nodeId: string
  onSelect: (nodeId: string, idx: number) => void
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)
  const count = branches.length
  // Spread branches evenly. Width = 320, center = 160
  const cardW = 120
  const totalW = 320
  const spacing = totalW / (count + 1)

  return (
    <div className="wf-branch-visual">
      {/* SVG curved paths */}
      <svg width={totalW} height="80" viewBox={`0 0 ${totalW} 80`} className="wf-branch-svg">
        {branches.map((_, i) => {
          const endX = spacing * (i + 1)
          const startX = totalW / 2
          const isHovered = hoveredIdx === i
          // Bezier curve from top-center down to branch position
          const path = `M ${startX} 0 C ${startX} 30, ${endX} 30, ${endX} 60`
          return (
            <g key={i}>
              {/* Shadow path */}
              <path
                d={path}
                fill="none"
                stroke={isHovered ? 'rgba(88,166,255,0.3)' : 'rgba(255,255,255,0.06)'}
                strokeWidth="2"
                strokeLinecap="round"
                className="wf-branch-path-bg"
              />
              {/* Animated flow path */}
              <path
                d={path}
                fill="none"
                stroke={isHovered ? '#58a6ff' : 'rgba(255,255,255,0.12)'}
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="6 8"
                className={`wf-branch-path-flow ${isHovered ? 'active' : ''}`}
              />
              {/* Clickable invisible wide path */}
              <path
                d={path}
                fill="none"
                stroke="transparent"
                strokeWidth="20"
                style={{ cursor: 'pointer' }}
                onClick={() => onSelect(nodeId, i)}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              />
              {/* End dot */}
              <circle
                cx={endX} cy={60} r={isHovered ? 5 : 3}
                fill={isHovered ? '#58a6ff' : 'rgba(255,255,255,0.15)'}
                className="wf-branch-dot"
              />
            </g>
          )
        })}
      </svg>

      {/* Branch option cards */}
      <div className="wf-branch-cards" style={{ width: totalW }}>
        {branches.map((branch, i) => {
          const left = spacing * (i + 1) - cardW / 2
          return (
            <div
              key={i}
              className={`wf-branch-card ${hoveredIdx === i ? 'hovered' : ''}`}
              style={{ left, width: cardW }}
              onClick={() => onSelect(nodeId, i)}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              <div className="wf-branch-card-title">{branch.label}</div>
              <div className="wf-branch-card-desc">{branch.description}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ===========================
// Start / End Circle
// ===========================
function FlowCircle({ type, label }: { type: 'start' | 'end'; label: string }) {
  return (
    <div className={`wf-flow-circle ${type}`}>
      <div className="wf-flow-circle-dot">{type === 'start' ? '▶' : '■'}</div>
      <span className="wf-flow-circle-label">{label}</span>
    </div>
  )
}

// ===========================
// Node Card
// ===========================
function FlowNodeCard({
  node,
  index,
  isPlanning,
  onToggle,
  onSelectBranch
}: {
  node: WorkflowNode
  index: number
  isPlanning: boolean
  onToggle?: (nodeId: string) => void
  onSelectBranch?: (nodeId: string, branchIdx: number) => void
}) {
  const nodeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (node.status === 'running' && nodeRef.current) {
      nodeRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [node.status])

  const statusColor = {
    pending: '#6e7681',
    running: '#58a6ff',
    done: '#3fb950',
    error: '#f85149',
    skipped: '#484f58'
  }[node.status]

  return (
    <div ref={nodeRef} className="wf-flow-step" style={{ animationDelay: `${index * 60}ms` }}>
      <div className={`wf-flow-card ${node.status} ${isPlanning && !node.selected ? 'dimmed' : ''}`}>
        {/* Color bar */}
        <div className="wf-flow-card-bar" style={{ background: statusColor }}>
          {isPlanning ? (
            <label className="wf-flow-check" onClick={e => { e.stopPropagation(); onToggle?.(node.id) }}>
              <div className={`wf-flow-checkbox ${node.selected ? 'on' : ''}`}>{node.selected && '✓'}</div>
            </label>
          ) : (
            <span className="wf-flow-status-icon">
              {node.status === 'done' ? '✓' :
               node.status === 'error' ? '✕' :
               node.status === 'running' ? <span className="wf-flow-spinner" /> :
               node.status === 'skipped' ? '⊘' : `${index + 1}`}
            </span>
          )}
          <span className="wf-flow-card-title">{node.title}</span>
        </div>

        {/* Body */}
        <div className="wf-flow-card-body">
          <div className="wf-flow-card-desc">{node.description}</div>
          {node.command && <div className="wf-flow-card-cmd">$ {node.command}</div>}
          {node.status === 'done' && node.output && (
            <div className="wf-flow-card-output">
              <pre>{node.output.length > 150 ? node.output.slice(0, 150) + '...' : node.output}</pre>
            </div>
          )}
          {node.summary && (
            <div className="wf-flow-card-summary">💬 {node.summary}</div>
          )}
          {node.status === 'error' && node.error && (
            <div className="wf-flow-card-error">❌ {node.error}</div>
          )}
        </div>
      </div>

      {/* Branch paths (SVG curves) on error */}
      {node.status === 'error' && node.branches && node.branches.length > 0 && (
        <BranchPaths
          branches={node.branches}
          nodeId={node.id}
          onSelect={onSelectBranch!}
        />
      )}
    </div>
  )
}

// ===========================
// MAIN: WorkflowPanel
// ===========================
export function WorkflowPanel({
  workflow,
  onConfirm,
  onCancel,
  onToggleNode,
  onSelectBranch,
  onClose
}: {
  workflow: Workflow
  onConfirm: () => void
  onCancel: () => void
  onToggleNode: (nodeId: string) => void
  onSelectBranch: (nodeId: string, branchIdx: number) => void
  onClose: () => void
}) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const isPlanning = workflow.status === 'planning'

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' })
    }
  }, [workflow.nodes, workflow.currentNodeIndex])

  const selectedCount = workflow.nodes.filter(n => n.selected).length
  const doneCount = workflow.nodes.filter(n => n.status === 'done').length
  const totalSelected = workflow.nodes.filter(n => n.selected).length
  const progress = totalSelected > 0 ? (doneCount / totalSelected) * 100 : 0

  return (
    <div className="wf-panel">
      {/* Header */}
      <div className="wf-header">
        <div className="wf-header-left">
          <span className="wf-header-icon">
            {workflow.status === 'planning' ? '📋' : workflow.status === 'done' ? '🎉' : workflow.status === 'error' ? '⚠️' : '⚡'}
          </span>
          <div>
            <div className="wf-header-title">{workflow.title}</div>
            <div className="wf-header-desc">{workflow.description}</div>
          </div>
        </div>
        <button className="wf-close-btn" onClick={onClose} title="关闭">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>
        </button>
      </div>

      {(workflow.status === 'running' || workflow.status === 'done') && (
        <div className="wf-progress">
          <div className="wf-progress-bar" style={{ width: `${progress}%` }} />
          <span className="wf-progress-text">{doneCount}/{totalSelected} 步完成</span>
        </div>
      )}

      {isPlanning && (
        <div className="wf-planning-hint">点击勾选框选择要执行的步骤（已选 {selectedCount}/{workflow.nodes.length}）</div>
      )}

      {/* Flowchart */}
      <div className="wf-flow-body" ref={bodyRef}>
        <FlowCircle type="start" label="开始" />

        {workflow.nodes.map((node, i) => (
          <div key={node.id} className="wf-flow-node-group">
            <FlowConnector
              done={i === 0 ? (node.status !== 'pending') : (workflow.nodes[i-1]?.status === 'done' || workflow.nodes[i-1]?.status === 'skipped')}
              active={node.status === 'running'}
            />
            <FlowNodeCard
              node={node}
              index={i}
              isPlanning={isPlanning}
              onToggle={onToggleNode}
              onSelectBranch={onSelectBranch}
            />
          </div>
        ))}

        <FlowConnector done={workflow.status === 'done'} />
        <FlowCircle type="end" label={workflow.status === 'done' ? '完成 🎉' : '结束'} />
      </div>

      {/* Footer */}
      <div className="wf-footer">
        {workflow.status === 'planning' && (
          <>
            <button className="wf-btn secondary" onClick={onCancel}>取消</button>
            <button className="wf-btn primary" onClick={onConfirm} disabled={selectedCount === 0}>
              <span>▶</span> 开始执行 ({selectedCount}步)
            </button>
          </>
        )}
        {workflow.status === 'running' && (
          <div className="wf-running-hint"><span className="wf-pulse-dot" /> 正在执行第 {workflow.currentNodeIndex + 1} 步...</div>
        )}
        {workflow.status === 'done' && (
          <button className="wf-btn primary" onClick={onClose}>完成</button>
        )}
        {workflow.status === 'paused' && (
          <div className="wf-paused-hint">⏸️ 点击上方分支曲线选择处理方案</div>
        )}
      </div>
    </div>
  )
}
