import { useState, useRef } from 'react'
import { AgentSkill } from '../types'

interface SkillManagerModalProps {
  isOpen: boolean
  skills: AgentSkill[]
  onClose: () => void
  onEdit: (skill: AgentSkill) => void
  onDelete: (id: string) => void
  onImport: (skills: AgentSkill[]) => void
  onExport: () => void
}

export function SkillManagerModal({
  isOpen, skills, onClose, onEdit, onDelete, onImport, onExport
}: SkillManagerModalProps) {
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(skills[0]?.id || null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!isOpen) return null

  const selectedSkill = skills.find(s => s.id === selectedSkillId) || skills[0]

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string)
        const importedSkills = Array.isArray(json) ? json : [json]
        onImport(importedSkills)
      } catch (err) {
        alert('导入失败，文件格式不正确')
      }
    }
    reader.readAsText(file)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 10000 }}>
      <div className="modal-content skill-manager-modal" onClick={e => e.stopPropagation()} style={{ width: '900px', maxWidth: '95vw', display: 'flex', flexDirection: 'column', height: '80vh' }}>
        <div className="modal-header">
          <h3 className="modal-title">📦 Agent 技能库 (Archival Memory)</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        
        <div className="modal-body" style={{ display: 'flex', flex: 1, padding: 0, overflow: 'hidden' }}>
          {/* 左侧技能列表 */}
          <div className="skill-list-sidebar" style={{ width: '280px', borderRight: '1px solid rgba(255,255,255,0.05)', display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.1)' }}>
            <div style={{ padding: '12px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" style={{ flex: 1, fontSize: 12 }} onClick={() => fileInputRef.current?.click()}>
                导入 JSON
              </button>
              <input type="file" accept=".json" style={{ display: 'none' }} ref={fileInputRef} onChange={handleFileChange} />
              <button className="btn btn-secondary" style={{ flex: 1, fontSize: 12 }} disabled={skills.length === 0} onClick={onExport}>
                导出全部
              </button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
              {skills.length === 0 ? (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: 40, fontSize: 13 }}>暂无技能记忆<br/><br/>在对话中利用 "✨ 提取核心技能" 来创建。</div>
              ) : (
                skills.map(s => (
                  <div 
                    key={s.id} 
                    className={`skill-list-item ${selectedSkillId === s.id ? 'active' : ''}`}
                    onClick={() => setSelectedSkillId(s.id)}
                    style={{
                      padding: '10px 12px', borderRadius: 6, cursor: 'pointer', marginBottom: 4,
                      background: selectedSkillId === s.id ? 'rgba(88, 166, 255, 0.15)' : 'transparent',
                      borderLeft: selectedSkillId === s.id ? '3px solid var(--accent-blue)' : '3px solid transparent'
                    }}
                  >
                    <div style={{ fontWeight: 500, fontSize: 14, color: selectedSkillId === s.id ? 'var(--accent-blue)' : 'var(--text-primary)', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {s.title}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {s.description}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          
          {/* 右侧技能详情 */}
          <div className="skill-detail-panel" style={{ flex: 1, padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {selectedSkill ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div>
                    <h2 style={{ margin: '0 0 8px 0', fontSize: 20 }}>{selectedSkill.title}</h2>
                    <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{selectedSkill.description}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary" onClick={() => onEdit(selectedSkill)}>编辑</button>
                    <button className="btn btn-danger" onClick={() => {
                        if (confirm('确定要删除这个技能吗？')) {
                          onDelete(selectedSkill.id)
                          setSelectedSkillId(null)
                        }
                      }} style={{ background: 'rgba(248, 81, 73, 0.1)', color: '#f85149', border: '1px solid rgba(248, 81, 73, 0.2)' }}>
                      删除
                    </button>
                  </div>
                </div>
                
                {selectedSkill.tags && selectedSkill.tags.length > 0 && (
                  <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
                    {selectedSkill.tags.map(t => (
                      <span key={t} style={{ background: 'rgba(255,255,255,0.08)', padding: '2px 8px', borderRadius: 12, fontSize: 11, color: '#e0e0e0' }}>#{t}</span>
                    ))}
                  </div>
                )}
                
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>结构化记忆串接 (System Prompt)</div>
                  <div style={{ 
                    flex: 1, background: 'rgba(0,0,0,0.2)', borderRadius: 8, padding: 16, 
                    fontFamily: 'monospace', fontSize: 13, color: '#e0e0e0', whiteSpace: 'pre-wrap', overflowY: 'auto',
                    border: '1px solid rgba(255,255,255,0.05)'
                  }}>
                    {selectedSkill.compressedContext}
                  </div>
                </div>
              </>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)' }}>
                请在左侧选择一个技能查看详情
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
