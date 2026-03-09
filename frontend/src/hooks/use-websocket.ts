import { useCallback, useEffect, useRef, useState } from 'react'
import { wsClient, type ConnectionState } from '@/core/ws-client'
import type { WsCommand, WsEvent, WsEventType } from '@/types'

export function useWebSocket(autoConnect = false) {
  const [connectionState, setConnectionState] = useState<ConnectionState>(wsClient.state)

  useEffect(() => {
    const unsub = wsClient.onStateChange(setConnectionState)
    if (autoConnect) wsClient.connect()
    return unsub
  }, [autoConnect])

  const connect = useCallback(() => wsClient.connect(), [])
  const disconnect = useCallback(() => wsClient.disconnect(), [])
  const send = useCallback((cmd: WsCommand) => wsClient.send(cmd), [])

  const onCommand = useCallback(
    (type: WsEventType | '*', handler: (event: WsEvent) => void) => {
      return wsClient.onCommand(type, handler)
    },
    [],
  )

  return { connectionState, connect, disconnect, send, onCommand }
}

export function useWsCommand(
  type: WsEventType | '*',
  handler: (event: WsEvent) => void,
) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    return wsClient.onCommand(type, (event) => handlerRef.current(event))
  }, [type])
}
