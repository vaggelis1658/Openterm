import { useState, useEffect } from 'react'
import { AgentSkill } from '../types'

interface SkillEditorModalProps {
  isOpen: boolean
  draftSkill?: Partial<AgentSkill>
  onClose: () => void
  onSave: (skill: AgentSkill) => void
}

export function SkillEditorModal({ isOpen, draftSkill, onClose, onSave }: SkillEditorModalProps) {
  const [title, setTitle] = useState(draftSkill?.title || '')
  const [description, setDescription] = useState(draftSkill?.description || '')
  const [tagsInput, setTagsInput] = useState(draftSkill?.tags?.join(', ') || '')
  const [compressedContext, setCompressedContext] = useState(draftSkill?.compressedContext || '')

  useEffect(() => {
    if (isOpen) {
      setTitle(draftSkill?.title || '')
      setDescription(draftSkill?.description || '')
      setTagsInput(draftSkill?.tags?.join(', ') || '')
      setCompressedContext(draftSkill?.compressedContext || '')
    }
  }, [isOpen, draftSkill])

  if (!isOpen) return null

  const handleSave = () => {
    if (!title.trim() || !compressedContext.trim()) return
    const newSkill: AgentSkill = {
      id: draftSkill?.id || crypto.randomUUID(),
      title: title.trim(),
      description: description.trim(),
      tags: tagsInput.split(',').map(t => t.trim()).filter(Boolean),
      compressedContext: compressedContext.trim(),
      createdAt: draftSkill?.createdAt || Date.now()
    }
    onSave(newSkill)
  }

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 10000 }}>
      <div className="modal-content skill-modal" onClick={e => e.stopPropagation()} style={{ width: '800px', maxWidth: '90vw' }}>
        <div className="modal-header">
          <h3 className="modal-title">{draftSkill?.id ? '编辑技能' : '保存提取的技能'}</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
            请核对 AI 提取的核心技能信息。你可以随时修改。这个技能将作为高密度上下文被复用到未来的对话中。
          </p>
          
          <div className="form-group">
            <label className="form-label">技能标题</label>
            <input 
              className="form-input" 
              value={title} 
              onChange={e => setTitle(e.target.value)} 
              placeholder="e.g. Nginx 自动搭建脚本"
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">简述</label>
            <input 
              className="form-input" 
              value={description} 
              onChange={e => setDescription(e.target.value)} 
              placeholder="一句话描述它解决的问题"
            />
          </div>
          
          <div className="form-group">
            <label className="form-label">标签集 (用逗号分隔)</label>
            <input 
              className="form-input" 
              value={tagsInput} 
              onChange={e => setTagsInput(e.target.value)} 
              placeholder="linux, nginx, ssl"
            />
          </div>
          
          <div className="form-group" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <label className="form-label">核心技能记忆 (System Prompt) <span style={{ color: 'var(--accent-yellow)', marginLeft: 8 }}>极为重要</span></label>
            <textarea 
              className="form-input" 
              value={compressedContext} 
              onChange={e => setCompressedContext(e.target.value)} 
              style={{ minHeight: '250px', fontFamily: 'monospace', lineHeight: 1.5, resize: 'vertical' }}
              placeholder="此处是经过Token压缩的核心经验和操作命令..."
            />
          </div>
        </div>
        <div className="modal-footer" style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 16, marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button className="btn btn-secondary" onClick={onClose}>取消</button>
          <button className="btn btn-primary" onClick={handleSave} disabled={!title.trim() || !compressedContext.trim()}>保存入库</button>
        </div>
      </div>
    </div>
  )
}
