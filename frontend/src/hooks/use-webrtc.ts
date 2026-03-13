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
  // Store the local stream so the answerer can add tracks when the offer is processed.
  const localStreamRef = useRef<MediaStream | null>(null)
  // Buffer an incoming offer that arrived before start() was called on the answerer.
  const pendingOfferSdpRef = useRef<string | null>(null)
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState | 'new'>('new')
  const [localAudioTrack, setLocalAudioTrack] = useState<MediaStreamTrack | null>(null)

  const cleanup = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close()
      pcRef.current = null
    }
    localStreamRef.current = null
    pendingOfferSdpRef.current = null
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

    // ontrack fires once per incoming track. event.streams[0] is the same live
    // MediaStream object for all tracks in the same stream, so calling
    // onRemoteStream on every track event ensures the video element gets
    // srcObject assigned at the point the video track is added to the stream.
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
    cleanup()
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

    // Answerer: if an offer arrived before start() was called, process it now
    // that we have the local stream and the peer connection ready.
    if (pendingOfferSdpRef.current) {
      const sdp = pendingOfferSdpRef.current
      pendingOfferSdpRef.current = null
      await pc.setRemoteDescription({ type: 'offer', sdp })
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      sendSignaling({ type: 'webrtc_answer', sdp: answer.sdp! })
    }
  }, [role, createPeerConnection, addLocalTracks, sendSignaling, cleanup])

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
      cleanup()
      return
    }

    if (message.type === 'webrtc_offer' && role === 'answerer') {
      const pc = pcRef.current

      if (!pc) {
        // start() hasn't been called yet (e.g. camera permission still pending).
        // Buffer the offer so start() can process it once the local stream is ready.
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
  }, [role, sendSignaling, cleanup])

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
