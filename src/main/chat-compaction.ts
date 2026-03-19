/**
 * Chat Compaction — 移植自 OpenCode 的对话历史压缩机制
 *
 * 核心功能：
 * 1. LLM 驱动的对话摘要压缩
 * 2. 终端输出裁剪
 * 3. 自动触发压缩（上下文溢出时）
 *
 * 对应 OpenCode 源码：session/compaction.ts
 */

import { TokenManager } from './token-manager'
import type { AiMessage, AiSettings } from './ai-service'

export interface CompactionResult {
  /** 压缩后的消息列表（摘要 + 保留的最近消息） */
  messages: AiMessage[]
  /** 是否发生了压缩 */
  compacted: boolean
  /** 压缩前的 token 数 */
  tokensBefore: number
  /** 压缩后的 token 数 */
  tokensAfter: number
}

// 移植自 OpenCode 的压缩提示模板，适配终端运维场景
const COMPACTION_PROMPT = `请根据以上对话历史，生成一份详细的摘要，以便另一个 AI 助手能够继续我们的工作。

请按以下模板组织摘要：
---
## 目标
[用户想要完成什么任务？]

## 重要指令
- [用户给出的重要指令和偏好]
- [使用的服务器信息：IP、操作系统等]

## 已执行的命令
- [列出已执行的关键命令及其结果]
- [标注哪些命令成功、哪些失败]

## 发现与诊断
[对话中发现的重要信息，如系统状态、错误原因、配置问题等]

## 当前进度
- [已完成的工作]
- [正在进行的工作]
- [待完成的工作]

## 系统状态
[服务器当前的关键状态信息]
---`

// 输出裁剪阈值
const TERMINAL_OUTPUT_MAX_LINES = 80    // 单条终端输出最多保留行数
const PRUNE_PROTECT_TOKENS = 8000       // 保护最近 N token 的终端输出不裁剪
const PRUNE_MIN_SAVINGS = 4000          // 至少裁剪 N token 才值得执行

export class ChatCompaction {
  /**
   * 检测并执行压缩
   * 移植自 OpenCode 的 SessionCompaction.process()
   */
  static async compactIfNeeded(
    messages: AiMessage[],
    settings: AiSettings,
    chatFn: (msgs: Array<{ role: string; content: string }>, settings: AiSettings) => Promise<string>
  ): Promise<CompactionResult> {
    const apiMessages = messages.map(m => ({ role: m.role as string, content: m.content }))
    const tokensBefore = TokenManager.estimateMessagesTokens(apiMessages)

    // 检查是否需要压缩
    if (!TokenManager.isOverflow(apiMessages, settings.model)) {
      return { messages, compacted: false, tokensBefore, tokensAfter: tokensBefore }
    }

    // 执行压缩
    return ChatCompaction.compact(messages, settings, chatFn)
  }

  /**
   * 执行 LLM 摘要压缩
   * 核心流程：
   * 1. 先裁剪终端输出（减少发送给 LLM 的内容）
   * 2. 将所有历史发送给 LLM 生成摘要
   * 3. 用摘要替换旧历史，保留最近几轮对话
   */
  static async compact(
    messages: AiMessage[],
    settings: AiSettings,
    chatFn: (msgs: Array<{ role: string; content: string }>, settings: AiSettings) => Promise<string>
  ): Promise<CompactionResult> {
    const tokensBefore = TokenManager.estimateMessagesTokens(
      messages.map(m => ({ role: m.role, content: m.content }))
    )

    // Step 1: 找到保留的最近消息（最后 2 轮对话）
    const keepCount = ChatCompaction.findKeepPoint(messages)
    const toCompact = messages.slice(0, messages.length - keepCount)
    const toKeep = messages.slice(messages.length - keepCount)

    if (toCompact.length < 4) {
      // 太少消息不值得压缩，直接裁剪
      const pruned = ChatCompaction.pruneTerminalOutputs(messages)
      const tokensAfter = TokenManager.estimateMessagesTokens(
        pruned.map(m => ({ role: m.role, content: m.content }))
      )
      return { messages: pruned, compacted: true, tokensBefore, tokensAfter }
    }

    // Step 2: 裁剪终端输出后发送给 LLM
    const prunedForSummary = ChatCompaction.pruneTerminalOutputs(toCompact)
    const summaryMessages = [
      ...prunedForSummary.map(m => ({ role: m.role as string, content: m.content })),
      { role: 'user' as const, content: COMPACTION_PROMPT }
    ]

    try {
      const summary = await chatFn(summaryMessages, settings)

      // Step 3: 构建压缩后的消息列表
      const summaryMsg: AiMessage = {
        role: 'assistant',
        content: `[📋 对话摘要 — 之前的 ${toCompact.length} 条消息已被压缩]\n\n${summary}`,
        timestamp: Date.now()
      }

      const compactedMessages = [summaryMsg, ...toKeep]
      const tokensAfter = TokenManager.estimateMessagesTokens(
        compactedMessages.map(m => ({ role: m.role, content: m.content }))
      )

      return {
        messages: compactedMessages,
        compacted: true,
        tokensBefore,
        tokensAfter
      }
    } catch (err) {
      // LLM 调用失败时回退到简单裁剪
      console.error('Compaction LLM call failed, falling back to truncation:', err)
      const truncated = ChatCompaction.truncateMessages(messages, settings.model)
      const tokensAfter = TokenManager.estimateMessagesTokens(
        truncated.map(m => ({ role: m.role, content: m.content }))
      )
      return { messages: truncated, compacted: true, tokensBefore, tokensAfter }
    }
  }

  /**
   * 找到应该保留的最近消息数量（至少保留最后 2 轮对话）
   */
  private static findKeepPoint(messages: AiMessage[]): number {
    let turns = 0
    let keepCount = 0
    for (let i = messages.length - 1; i >= 0; i--) {
      keepCount++
      if (messages[i].role === 'user') turns++
      if (turns >= 2) break
    }
    return Math.min(keepCount, messages.length)
  }

  /**
   * 裁剪终端输出内容
   * 移植自 OpenCode 的 SessionCompaction.prune()
   *
   * 策略：从后往前扫描，保护最近 PRUNE_PROTECT_TOKENS 的输出，
   * 之前的终端输出截断为首尾各 N 行
   */
  static pruneTerminalOutputs(messages: AiMessage[]): AiMessage[] {
    const result = messages.map(m => ({ ...m }))
    let protectedTokens = 0

    // 从后往前扫描
    for (let i = result.length - 1; i >= 0; i--) {
      const msg = result[i]
      const tokens = TokenManager.estimateTokens(msg.content)
      protectedTokens += tokens

      if (protectedTokens <= PRUNE_PROTECT_TOKENS) continue

      // 超出保护区的消息，裁剪终端输出
      if (msg.role === 'user' && msg.content.includes('[当前终端最近输出]')) {
        result[i] = {
          ...msg,
          content: TokenManager.truncateTerminalOutput(msg.content, TERMINAL_OUTPUT_MAX_LINES)
        }
      } else if (msg.role === 'assistant' && msg.content.includes('```')) {
        // 裁剪长代码块输出
        result[i] = {
          ...msg,
          content: ChatCompaction.truncateCodeBlocks(msg.content)
        }
      }
    }

    return result
  }

  /**
   * 裁剪消息中的代码块（保留首尾各 15 行）
   */
  private static truncateCodeBlocks(text: string): string {
    return text.replace(
      /```(\w*)\n([\s\S]*?)```/g,
      (match, lang, code) => {
        const lines = code.split('\n')
        if (lines.length <= 30) return match
        const head = lines.slice(0, 15).join('\n')
        const tail = lines.slice(-15).join('\n')
        return `\`\`\`${lang}\n${head}\n\n... [省略 ${lines.length - 30} 行] ...\n\n${tail}\`\`\``
      }
    )
  }

  /**
   * 简单截断策略（LLM 不可用时的回退方案）
   */
  static truncateMessages(
    messages: AiMessage[],
    modelName: string
  ): AiMessage[] {
    const limits = TokenManager.getModelLimits(modelName)
    const usable = limits.contextWindow - limits.maxOutput - limits.reservedBuffer

    // 从最后开始累加消息
    const selected: AiMessage[] = []
    let currentTokens = 0

    for (let i = messages.length - 1; i >= 0; i--) {
      const msgTokens = TokenManager.estimateTokens(messages[i].content) + 4
      if (currentTokens + msgTokens > usable && selected.length > 2) break
      currentTokens += msgTokens
      selected.unshift(messages[i])
    }

    // 如果截断了太多消息，添加提示
    if (selected.length < messages.length) {
      const omitted = messages.length - selected.length
      selected.unshift({
        role: 'assistant',
        content: `[⚠️ 由于上下文限制，已省略之前的 ${omitted} 条消息]`,
        timestamp: Date.now()
      })
    }

    return selected
  }
}
