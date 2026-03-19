import { EventEmitter } from 'events'
import { Client, type ConnectConfig, type ClientChannel } from 'ssh2'
import { v4 as uuidv4 } from 'uuid'

export interface SSHConnectionConfig {
  id: string
  name: string
  host: string
  port: number
  username: string
  authType: 'password' | 'privateKey'
  password?: string
  privateKey?: string
  passphrase?: string
  group?: string
}

interface SSHSession {
  client: Client
  stream: ClientChannel | null
  config: SSHConnectionConfig
}

export class SSHManager extends EventEmitter {
  private sessions: Map<string, SSHSession> = new Map()

  async connect(config: SSHConnectionConfig): Promise<string> {
    const sessionId = uuidv4()
    const client = new Client()

    return new Promise((resolve, reject) => {
      client.on('ready', () => {
        client.shell(
          {
            term: 'xterm-256color',
            cols: 80,
            rows: 24
          },
          (err, stream) => {
            if (err) {
              reject(err)
              return
            }

            const session: SSHSession = { client, stream, config }
            this.sessions.set(sessionId, session)

            stream.on('data', (data: Buffer) => {
              this.emit('data', sessionId, data.toString('utf-8'))
            })

            stream.on('close', () => {
              this.sessions.delete(sessionId)
              this.emit('close', sessionId)
            })

            stream.stderr.on('data', (data: Buffer) => {
              this.emit('data', sessionId, data.toString('utf-8'))
            })

            resolve(sessionId)
          }
        )
      })

      client.on('error', (err) => {
        this.sessions.delete(sessionId)
        this.emit('error', sessionId, err.message)
        reject(err)
      })

      const connectConfig: ConnectConfig = {
        host: config.host,
        port: config.port || 22,
        username: config.username,
        readyTimeout: 10000
      }

      if (config.authType === 'password') {
        connectConfig.password = config.password
      } else if (config.authType === 'privateKey') {
        connectConfig.privateKey = config.privateKey
        if (config.passphrase) {
          connectConfig.passphrase = config.passphrase
        }
      }

      client.connect(connectConfig)
    })
  }

  write(sessionId: string, data: string): void {
    const session = this.sessions.get(sessionId)
    if (session?.stream) {
      session.stream.write(data)
    }
  }

  resize(sessionId: string, cols: number, rows: number): void {
    const session = this.sessions.get(sessionId)
    if (session?.stream) {
      session.stream.setWindow(rows, cols, 0, 0)
    }
  }

  disconnect(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.stream?.close()
      session.client.end()
      this.sessions.delete(sessionId)
    }
  }

  disconnectAll(): void {
    for (const [id] of this.sessions) {
      this.disconnect(id)
    }
  }

  async exec(sessionId: string, command: string): Promise<string> {
    const session = this.sessions.get(sessionId)
    if (!session) throw new Error('Session not found')

    return new Promise((resolve, reject) => {
      session.client.exec(command, (err, stream) => {
        if (err) {
          reject(err)
          return
        }
        let output = ''
        stream.on('data', (data: Buffer) => {
          output += data.toString('utf-8')
        })
        stream.stderr.on('data', (data: Buffer) => {
          output += data.toString('utf-8')
        })
        stream.on('close', () => {
          resolve(output)
        })
      })
    })
  }

  getActiveSessions(): string[] {
    return Array.from(this.sessions.keys())
  }
}
