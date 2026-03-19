export interface AiMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AiSettings {
  provider: 'openai' | 'ollama'
  apiKey?: string
  apiUrl?: string
  model: string
  ollamaUrl?: string
}

const SYSTEM_PROMPT = `你是 OpenTerm 的 AI 终端助手，一个 Linux 运维专家。你的职责是帮助用户操作远程 Linux 服务器。

规则：
1. 当用户用自然语言描述需求时，生成对应的 Linux 命令
2. 把命令用 \`\`\`bash 代码块包裹，这样前端可以自动识别并渲染为可执行的命令块
3. 给出简短的中文解释说明命令的作用
4. 如果一个任务需要多个步骤，分步骤给出命令
5. 对于危险操作（如删除文件、格式化磁盘等），务必提醒用户注意
6. 如果用户提供了终端输出，分析输出并给出建议
7. 回复简洁明了，不要过于冗长`

export class AiService {
  async chat(messages: AiMessage[], settings: AiSettings): Promise<string> {
    const fullMessages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      ...messages
    ]

    if (settings.provider === 'ollama') {
      return this.chatOllama(fullMessages, settings)
    } else {
      return this.chatOpenAI(fullMessages, settings)
    }
  }

  private async chatOpenAI(messages: AiMessage[], settings: AiSettings): Promise<string> {
    const url = settings.apiUrl || 'https://api.openai.com/v1/chat/completions'

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.apiKey}`
      },
      body: JSON.stringify({
        model: settings.model || 'gpt-4o-mini',
        messages,
        temperature: 0.7,
        max_tokens: 2000
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    return data.choices[0].message.content
  }

  private async chatOllama(messages: AiMessage[], settings: AiSettings): Promise<string> {
    const url = `${settings.ollamaUrl || 'http://localhost:11434'}/api/chat`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: settings.model || 'llama3',
        messages,
        stream: false
      })
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Ollama API error: ${response.status} - ${errorText}`)
    }

    const data = await response.json()
    return data.message.content
  }
}
