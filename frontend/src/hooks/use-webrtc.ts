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
  replaceVideoTrack: (newStream: MediaStream) => void
  handleSignaling: (message: SignalingMessage) => Promise<void>
  connectionState: RTCPeerConnectionState | 'new'
  localAudioTrack: MediaStreamTrack | null
}

export const useWebRTC = ({ role, onRemoteStream, sendSignaling }: UseWebRTCOptions): UseWebRTCReturn => {
  const pcRef = useRef<RTCPeerConnection | null>(null)
  // Store the local stream so the answerer can rebuild the PC on reconnect.
  const localStreamRef = useRef<MediaStream | null>(null)
  // Buffer an incoming offer that arrived before start() was called on the answerer.
  const pendingOfferSdpRef = useRef<string | null>(null)
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState | 'new'>('new')
  const [localAudioTrack, setLocalAudioTrack] = useState<MediaStreamTrack | null>(null)

  // Close the peer connection only — does NOT clear localStreamRef so the
  // answerer can recreate the PC when a new offer arrives.
  const closePc = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }
    pendingOfferSdpRef.current = null
    setConnectionState('new')
    setLocalAudioTrack(null)
  }, [])

  // Full cleanup: close PC AND release the local stream reference.
  const cleanup = useCallback(() => {
    closePc()
    localStreamRef.current = null
  }, [closePc])

  const createPeerConnection = useCallback((): RTCPeerConnection => {
    // Close any existing PC before creating a new one
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }

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
        // Only close the PC, keep localStreamRef so we can reconnect
        closePc()
      }
    }

    pcRef.current = pc
    return pc
  }, [sendSignaling, onRemoteStream, closePc])

  const addLocalTracks = useCallback((pc: RTCPeerConnection, localStream: MediaStream) => {
    for (const track of localStream.getTracks()) {
      pc.addTrack(track, localStream)
      if (track.kind === 'audio' && role === 'caller') {
        // Caller mutes audio by default (push-to-talk)
        track.enabled = false
        setLocalAudioTrack(track)
      }
    }
  }, [role])

  const start = useCallback(async (localStream: MediaStream) => {
    closePc()
    localStreamRef.current = localStream
    const pc = createPeerConnection()

    addLocalTracks(pc, localStream)

    if (role === 'caller') {
      // Add a recvonly video transceiver so the SDP offer includes a video
      // m-line. Without this the answerer's video tracks are never negotiated
      // because the offer only contains audio.
      pc.addTransceiver('video', { direction: 'recvonly' })
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      sendSignaling({ type: 'webrtc_offer', sdp: offer.sdp! })
      return
    }

    // Answerer: if an offer arrived before start() was called, process it now.
    if (pendingOfferSdpRef.current) {
      const sdp = pendingOfferSdpRef.current
      pendingOfferSdpRef.current = null
      await pc.setRemoteDescription({ type: 'offer', sdp })
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      sendSignaling({ type: 'webrtc_answer', sdp: answer.sdp! })
    }
  }, [role, createPeerConnection, addLocalTracks, sendSignaling, closePc])

  const replaceVideoTrack = useCallback((newStream: MediaStream) => {
    const pc = pcRef.current
    if (!pc) return
    const newVideoTrack = newStream.getVideoTracks()[0]
    if (!newVideoTrack) return
    const sender = pc.getSenders().find(s => s.track?.kind === 'video')
    if (sender) {
      void sender.replaceTrack(newVideoTrack)
    }
  }, [])

  const handleSignaling = useCallback(async (message: SignalingMessage) => {
    if (message.type === 'webrtc_reset') {
      closePc()
      return
    }

    if (message.type === 'webrtc_offer' && role === 'answerer') {
      let pc = pcRef.current

      if (!pc && localStreamRef.current) {
        // PC was closed (e.g. caller disconnected and reconnected) but we
        // still have the local camera stream. Rebuild the PC and process
        // the new offer immediately.
        pc = createPeerConnection()
        addLocalTracks(pc, localStreamRef.current)
      }

      if (!pc) {
        // start() hasn't been called yet (e.g. camera permission pending).
        pendingOfferSdpRef.current = message.sdp
        return
      }

      await pc.setRemoteDescription({ type: 'offer', sdp: message.sdp })
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      sendSignaling({ type: 'webrtc_answer', sdp: answer.sdp! })
      return
    }

    const pc = pcRef.current

    if (message.type === 'webrtc_answer' && role === 'caller' && pc) {
      await pc.setRemoteDescription({ type: 'answer', sdp: message.sdp })
      return
    }

    if (message.type === 'webrtc_ice_candidate' && pc) {
      await pc.addIceCandidate(message.candidate)
    }
  }, [role, sendSignaling, closePc, createPeerConnection, addLocalTracks])

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanup()
  }, [cleanup])

  return {
    start,
    stop: cleanup,
    replaceVideoTrack,
    handleSignaling,
    connectionState,
    localAudioTrack,
  }
}
