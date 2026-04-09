'use client'

import { useCallback, useEffect, useRef } from 'react'

type SyncFn = (
  nextEnabled: boolean,
  nextMuted: boolean,
  shouldAttemptPlayback: boolean,
) => void

export function useGaplessAudioLoop(
  src: string,
  volume: number,
): { syncFocusAudio: SyncFn; cleanup: () => void } {
  const audioCtxRef = useRef<AudioContext | null>(null)
  const bufferRef = useRef<AudioBuffer | null>(null)
  const sourceRef = useRef<AudioBufferSourceNode | null>(null)
  const gainRef = useRef<GainNode | null>(null)
  const wantPlayingRef = useRef(false)
  const fetchRef = useRef<Promise<AudioBuffer> | null>(null)

  const ensureContext = useCallback(() => {
    if (audioCtxRef.current) return audioCtxRef.current
    const ctx = new AudioContext()
    const gain = ctx.createGain()
    gain.gain.value = volume
    gain.connect(ctx.destination)
    audioCtxRef.current = ctx
    gainRef.current = gain
    return ctx
  }, [volume])

  const ensureBuffer = useCallback(async (): Promise<AudioBuffer> => {
    if (bufferRef.current) return bufferRef.current
    if (fetchRef.current) return fetchRef.current

    const ctx = ensureContext()
    const promise = fetch(src)
      .then((r) => r.arrayBuffer())
      .then((ab) => ctx.decodeAudioData(ab))
      .then((decoded) => {
        bufferRef.current = decoded
        return decoded
      })
    fetchRef.current = promise
    return promise
  }, [src, ensureContext])

  const stopPlayback = useCallback(() => {
    wantPlayingRef.current = false
    if (!sourceRef.current) return
    try {
      sourceRef.current.stop()
    } catch {
      /* already stopped */
    }
    sourceRef.current.disconnect()
    sourceRef.current = null
  }, [])

  const startPlayback = useCallback(async () => {
    wantPlayingRef.current = true
    if (sourceRef.current) return // already playing

    const ctx = ensureContext()
    await ctx.resume()
    if (!wantPlayingRef.current) return

    const buffer = await ensureBuffer()
    if (!wantPlayingRef.current) return
    if (sourceRef.current) return // guard against double-start

    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    source.connect(gainRef.current!)
    source.start(0)
    sourceRef.current = source

    source.onended = () => {
      if (sourceRef.current === source) {
        sourceRef.current = null
      }
    }
  }, [ensureContext, ensureBuffer])

  const syncFocusAudio: SyncFn = useCallback(
    (nextEnabled, nextMuted, shouldAttemptPlayback) => {
      if (gainRef.current) {
        gainRef.current.gain.value = nextMuted ? 0 : volume
      }

      if (!nextEnabled || nextMuted) {
        stopPlayback()
        return
      }

      if (shouldAttemptPlayback || sourceRef.current) {
        startPlayback().catch(() => {
          // Autoplay blocked or fetch failed; keep UI responsive.
        })
      }
    },
    [volume, stopPlayback, startPlayback],
  )

  const cleanup = useCallback(() => {
    stopPlayback()
    gainRef.current?.disconnect()
    gainRef.current = null
    void audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null
    bufferRef.current = null
    fetchRef.current = null
  }, [stopPlayback])

  useEffect(() => {
    return () => cleanup()
  }, [cleanup])

  return { syncFocusAudio, cleanup }
}
