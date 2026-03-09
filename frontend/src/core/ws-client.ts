// WebSocket manager with auto-reconnect and heartbeat

import type { WsCommand, WsEvent, WsEventType } from '@/types'

import { getApiBaseUrl } from '@/core/api-client'

const getWsUrl = (): string => {
  const apiUrl = getApiBaseUrl();
  const wsProtocol = apiUrl.startsWith('https') ? 'wss' : 'ws';
  return apiUrl.replace(/^https?/, wsProtocol) + '/ws/station';
};
const HEARTBEAT_INTERVAL = 30_000
const MAX_BACKOFF = 30_000

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error'

type CommandHandler = (event: WsEvent) => void

class WsClient {
  private socket: WebSocket | null = null
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private reconnectAttempts = 0
  private handlers = new Map<WsEventType | '*', Set<CommandHandler>>()
  private stateListeners = new Set<(state: ConnectionState) => void>()

  state: ConnectionState = 'disconnected'

  connect(): void {
    if (this.socket?.readyState === WebSocket.OPEN) return
    this.setState('connecting')
    this.socket = new WebSocket(getWsUrl())
    this.socket.onopen = this.handleOpen
    this.socket.onmessage = this.handleMessage
    this.socket.onclose = this.handleClose
    this.socket.onerror = this.handleError
  }

  disconnect(): void {
    this.clearTimers()
    this.socket?.close()
    this.socket = null
    this.setState('disconnected')
  }

  send(command: WsCommand): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(command))
    }
  }

  onCommand(type: WsEventType | '*', handler: CommandHandler): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set())
    }
    this.handlers.get(type)!.add(handler)
    return () => this.handlers.get(type)?.delete(handler)
  }

  onStateChange(listener: (state: ConnectionState) => void): () => void {
    this.stateListeners.add(listener)
    return () => this.stateListeners.delete(listener)
  }

  private setState(state: ConnectionState): void {
    this.state = state
    this.stateListeners.forEach((l) => l(state))
  }

  private handleOpen = (): void => {
    this.reconnectAttempts = 0
    this.setState('connected')
    this.startHeartbeat()
  }

  private handleMessage = (event: MessageEvent): void => {
    let parsed: WsEvent
    try {
      parsed = JSON.parse(event.data as string) as WsEvent
    } catch {
      return
    }

    const specific = this.handlers.get(parsed.type)
    if (specific) specific.forEach((h) => h(parsed))

    const wildcard = this.handlers.get('*')
    if (wildcard) wildcard.forEach((h) => h(parsed))
  }

  private handleClose = (): void => {
    this.clearTimers()
    this.setState('disconnected')
    this.scheduleReconnect()
  }

  private handleError = (): void => {
    this.setState('error')
    this.socket?.close()
  }

  private scheduleReconnect(): void {
    const delay = Math.min(1_000 * 2 ** this.reconnectAttempts, MAX_BACKOFF)
    this.reconnectAttempts++
    this.reconnectTimer = setTimeout(() => this.connect(), delay)
  }

  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ type: 'ping' }))
      }
    }, HEARTBEAT_INTERVAL)
  }

  private clearTimers(): void {
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer)
    if (this.heartbeatTimer !== null) clearInterval(this.heartbeatTimer)
    this.reconnectTimer = null
    this.heartbeatTimer = null
  }
}

// Singleton
export const wsClient = new WsClient()
