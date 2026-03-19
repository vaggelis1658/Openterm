/**
 * Token Manager — 移植自 OpenCode 的 Token 管理和上下文溢出检测机制
 *
 * 核心功能：
 * 1. Token 估算（基于字符长度）
 * 2. 模型上下文限制管理
 * 3. 上下文溢出检测
 * 4. 消息裁剪策略
 */

export interface TokenUsage {
  input: number
  output: number
  total: number
}

export interface ModelLimits {
  contextWindow: number   // 模型总上下文窗口
  maxOutput: number       // 最大输出 token
  reservedBuffer: number  // 预留缓冲 token
}

// 常见模型的上下文限制预设
const MODEL_LIMITS: Record<string, ModelLimits> = {
  // OpenAI
  'gpt-4o':           { contextWindow: 128000, maxOutput: 16384, reservedBuffer: 20000 },
  'gpt-4o-mini':      { contextWindow: 128000, maxOutput: 16384, reservedBuffer: 20000 },
  'gpt-4-turbo':      { contextWindow: 128000, maxOutput: 4096,  reservedBuffer: 10000 },
  'gpt-4':            { contextWindow: 8192,   maxOutput: 4096,  reservedBuffer: 2000 },
  'gpt-3.5-turbo':    { contextWindow: 16385,  maxOutput: 4096,  reservedBuffer: 4000 },
  'o1':               { contextWindow: 200000, maxOutput: 100000, reservedBuffer: 20000 },
  'o1-mini':          { contextWindow: 128000, maxOutput: 65536, reservedBuffer: 20000 },
  'o3-mini':          { contextWindow: 200000, maxOutput: 100000, reservedBuffer: 20000 },
  // Codex (codex.hair)
  'gpt-5.3-codex':    { contextWindow: 200000, maxOutput: 16384, reservedBuffer: 20000 },
  'gpt-5.4-pro':      { contextWindow: 200000, maxOutput: 16384, reservedBuffer: 20000 },
  'gpt-5.2-codex':    { contextWindow: 200000, maxOutput: 16384, reservedBuffer: 20000 },
  // Anthropic
  'claude-sonnet-4-20250514': { contextWindow: 200000, maxOutput: 16384, reservedBuffer: 20000 },
  'claude-opus-4-20250514':   { contextWindow: 200000, maxOutput: 16384, reservedBuffer: 20000 },
  'claude-3-5-sonnet':        { contextWindow: 200000, maxOutput: 8192,  reservedBuffer: 20000 },
  'claude-3-haiku':           { contextWindow: 200000, maxOutput: 4096,  reservedBuffer: 20000 },
  // Ollama / Llama
  'llama3':         { contextWindow: 8192,   maxOutput: 4096, reservedBuffer: 2000 },
  'llama3.1':       { contextWindow: 131072, maxOutput: 4096, reservedBuffer: 10000 },
  'llama3.2':       { contextWindow: 131072, maxOutput: 4096, reservedBuffer: 10000 },
  'mistral':        { contextWindow: 32768,  maxOutput: 4096, reservedBuffer: 6000 },
  'deepseek-coder': { contextWindow: 128000, maxOutput: 4096, reservedBuffer: 10000 },
  'qwen2.5':        { contextWindow: 131072, maxOutput: 8192, reservedBuffer: 10000 },
}

// 默认限制（保守估算）
const DEFAULT_LIMITS: ModelLimits = {
  contextWindow: 16384,
  maxOutput: 4096,
  reservedBuffer: 4000
}

export class TokenManager {
  /**
   * 估算文本的 token 数量
   * 英文：~4 chars/token，中文：~2 chars/token
   * 这是粗略估算，不需要精确（OpenCode 也用类似方式）
   */
  static estimateTokens(text: string): number {
    if (!text) return 0
    // 简单的混合语言 token 估算
    let cjkChars = 0
    let otherChars = 0
    for (const char of text) {
      const code = char.codePointAt(0) || 0
      if (
        (code >= 0x4E00 && code <= 0x9FFF) ||   // CJK Unified
        (code >= 0x3400 && code <= 0x4DBF) ||   // CJK Ext A
        (code >= 0x3000 && code <= 0x303F) ||   // CJK Symbols
        (code >= 0xFF00 && code <= 0xFFEF) ||   // Fullwidth
        (code >= 0xAC00 && code <= 0xD7AF)      // Korean
      ) {
        cjkChars++
      } else {
        otherChars++
      }
    }
    return Math.ceil(cjkChars / 1.5 + otherChars / 4)
  }

  /**
   * 估算消息数组的总 token 数
   */
  static estimateMessagesTokens(messages: Array<{ role: string; content: string }>): number {
    let total = 0
    for (const msg of messages) {
      // 每条消息有 ~4 token 的结构开销（role、formatting）
      total += 4
      total += TokenManager.estimateTokens(msg.content)
    }
    return total
  }

  /**
   * 获取模型的上下文限制
   * 支持模糊匹配（模型名包含关键字即匹配）
   */
  static getModelLimits(modelName: string): ModelLimits {
    // 精确匹配
    if (MODEL_LIMITS[modelName]) {
      return MODEL_LIMITS[modelName]
    }
    // 模糊匹配
    const lower = modelName.toLowerCase()
    for (const [key, limits] of Object.entries(MODEL_LIMITS)) {
      if (lower.includes(key.toLowerCase()) || key.toLowerCase().includes(lower)) {
        return limits
      }
    }
    // 根据名称猜测常见前缀
    if (lower.includes('gpt-4')) return MODEL_LIMITS['gpt-4o']
    if (lower.includes('gpt-3')) return MODEL_LIMITS['gpt-3.5-turbo']
    if (lower.includes('claude')) return MODEL_LIMITS['claude-sonnet-4-20250514']
    if (lower.includes('llama')) return MODEL_LIMITS['llama3']
    if (lower.includes('qwen')) return MODEL_LIMITS['qwen2.5']
    if (lower.includes('deepseek')) return MODEL_LIMITS['deepseek-coder']

    return DEFAULT_LIMITS
  }

  /**
   * 检测上下文是否溢出
   * 移植自 OpenCode 的 SessionCompaction.isOverflow()
   */
  static isOverflow(
    messages: Array<{ role: string; content: string }>,
    modelName: string
  ): boolean {
    const limits = TokenManager.getModelLimits(modelName)
    const currentTokens = TokenManager.estimateMessagesTokens(messages)
    const usable = limits.contextWindow - limits.maxOutput - limits.reservedBuffer
    return currentTokens >= usable
  }

  /**
   * 获取当前 token 使用率 (0-1)
   */
  static getUsageRatio(
    messages: Array<{ role: string; content: string }>,
    modelName: string
  ): number {
    const limits = TokenManager.getModelLimits(modelName)
    const currentTokens = TokenManager.estimateMessagesTokens(messages)
    const usable = limits.contextWindow - limits.maxOutput
    return Math.min(1, currentTokens / usable)
  }

  /**
   * 裁剪过长的终端输出
   * 保留头部和尾部各 N 行，中间用省略标记替代
   */
  static truncateTerminalOutput(text: string, maxLines: number = 50): string {
    const lines = text.split('\n')
    if (lines.length <= maxLines) return text

    const keepHead = Math.floor(maxLines * 0.3)
    const keepTail = maxLines - keepHead
    const omitted = lines.length - keepHead - keepTail

    return [
      ...lines.slice(0, keepHead),
      `\n... [省略 ${omitted} 行] ...\n`,
      ...lines.slice(-keepTail)
    ].join('\n')
  }

  /**
   * 智能裁剪消息列表以适应上下文窗口
   * 策略：保留 system 消息 + 最近 N 条消息，直到 token 在限制内
   */
  static fitToContext(
    messages: Array<{ role: string; content: string }>,
    modelName: string
  ): Array<{ role: string; content: string }> {
    const limits = TokenManager.getModelLimits(modelName)
    const usable = limits.contextWindow - limits.maxOutput - limits.reservedBuffer

    // 分离 system 消息和对话消息
    const systemMsgs = messages.filter(m => m.role === 'system')
    const chatMsgs = messages.filter(m => m.role !== 'system')

    const systemTokens = TokenManager.estimateMessagesTokens(systemMsgs)
    let remainingTokens = usable - systemTokens

    // 从最新消息开始累加，直到超出限制
    const selected: Array<{ role: string; content: string }> = []
    for (let i = chatMsgs.length - 1; i >= 0; i--) {
      const msgTokens = TokenManager.estimateTokens(chatMsgs[i].content) + 4
      if (remainingTokens - msgTokens < 0 && selected.length > 0) break
      remainingTokens -= msgTokens
      selected.unshift(chatMsgs[i])
    }

    return [...systemMsgs, ...selected]
  }
}
