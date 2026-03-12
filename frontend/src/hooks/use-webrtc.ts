// frontend/src/hooks/use-webrtc.ts
import { useCallback, useEffect, useRef, useState } from 'react'
import type { SignalingMessage } from '@/types'

const RTC_CONFIG: RTCConfiguration = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
}

interface UseWebRTCOptions {
  role: 'caller' | 'answerer'
  onRemoteStream: (stream: MediaStream) => void
  sendSignaling: (message: SignalingMessage) => void
}

interface UseWebRTCReturn {
  start: (localStream: MediaStream) => Promise<void>
  stop: () => void
  handleSignaling: (message: SignalingMessage) => Promise<void>
  connectionState: RTCPeerConnectionState | 'new'
  localAudioTrack: MediaStreamTrack | null
}

export const useWebRTC = ({ role, onRemoteStream, sendSignaling }: UseWebRTCOptions): UseWebRTCReturn => {
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState | 'new'>('new')
  const [localAudioTrack, setLocalAudioTrack] = useState<MediaStreamTrack | null>(null)

  const cleanup = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }
    setConnectionState('new')
    setLocalAudioTrack(null)
  }, [])

  const createPeerConnection = useCallback((): RTCPeerConnection => {
    const pc = new RTCPeerConnection(RTC_CONFIG)

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignaling({
          type: 'webrtc_ice_candidate',
          candidate: event.candidate.toJSON(),
        })
      }
    }

    pc.ontrack = (event) => {
      if (event.streams[0]) {
        onRemoteStream(event.streams[0])
      }
    }

    pc.onconnectionstatechange = () => {
      setConnectionState(pc.connectionState)
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        cleanup()
      }
    }

    pcRef.current = pc
    return pc
  }, [sendSignaling, onRemoteStream, cleanup])

  const start = useCallback(async (localStream: MediaStream) => {
    cleanup()
    const pc = createPeerConnection()

    // Add local tracks
    for (const track of localStream.getTracks()) {
      pc.addTrack(track, localStream)
      if (track.kind === 'audio' && role === 'caller') {
        // Caller mutes audio by default (push-to-talk)
        track.enabled = false
        setLocalAudioTrack(track)
      }
    }

    if (role === 'caller') {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      sendSignaling({ type: 'webrtc_offer', sdp: offer.sdp! })
    }
    // Answerer waits for offer via handleSignaling
  }, [role, createPeerConnection, sendSignaling, cleanup])

  const handleSignaling = useCallback(async (message: SignalingMessage) => {
    if (message.type === 'webrtc_reset') {
      cleanup()
      return
    }

    const pc = pcRef.current

    if (message.type === 'webrtc_offer' && role === 'answerer') {
      if (!pc) {
        return
      }
      await pc.setRemoteDescription({ type: 'offer', sdp: message.sdp })
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      sendSignaling({ type: 'webrtc_answer', sdp: answer.sdp! })
      return
    }

    if (message.type === 'webrtc_answer' && role === 'caller' && pc) {
      await pc.setRemoteDescription({ type: 'answer', sdp: message.sdp })
      return
    }

    if (message.type === 'webrtc_ice_candidate' && pc) {
      await pc.addIceCandidate(message.candidate)
    }
  }, [role, sendSignaling, cleanup])

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanup()
  }, [cleanup])

  return {
    start,
    stop: cleanup,
    handleSignaling,
    connectionState,
    localAudioTrack,
  }
}
