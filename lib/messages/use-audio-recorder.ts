'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { selectSupportedAudioMimeType } from './sequence'

type RecordedAudioHandler = (stepId: string, file: File) => void

export function useAudioRecorder(onRecorded: RecordedAudioHandler) {
  const [activeStepId, setActiveStepId] = useState<string | null>(null)
  const activeStepRef = useRef<string | null>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const mimeRef = useRef<string | null>(null)
  const cancelledRef = useRef(false)
  const mountedRef = useRef(true)
  const handlerRef = useRef(onRecorded)
  useEffect(() => { handlerRef.current = onRecorded }, [onRecorded])

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
  }, [])

  const cancel = useCallback(() => {
    cancelledRef.current = true
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    else {
      releaseStream()
      recorderRef.current = null
      activeStepRef.current = null
      if (mountedRef.current) setActiveStepId(null)
    }
  }, [releaseStream])

  const stop = useCallback(() => {
    cancelledRef.current = false
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
  }, [])

  const start = useCallback(async (stepId: string) => {
    if (activeStepRef.current) throw new Error('RECORDING_IN_PROGRESS')
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') throw new Error('UNSUPPORTED_AUDIO')
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => { throw new Error('MICROPHONE_ACCESS') })
    const mime = selectSupportedAudioMimeType(MediaRecorder)
    if (!mime) {
      stream.getTracks().forEach((track) => track.stop())
      throw new Error('UNSUPPORTED_AUDIO')
    }
    activeStepRef.current = stepId
    setActiveStepId(stepId)
    cancelledRef.current = false
    streamRef.current = stream
    chunksRef.current = []
    mimeRef.current = mime
    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(stream, { mimeType: mime })
    } catch {
      releaseStream()
      activeStepRef.current = null
      setActiveStepId(null)
      throw new Error('UNSUPPORTED_AUDIO')
    }
    recorderRef.current = recorder
    recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data) }
    recorder.onstop = () => {
      const recordedStepId = activeStepRef.current
      const recordedMime = mimeRef.current
      const wasCancelled = cancelledRef.current
      const blob = recordedMime ? new Blob(chunksRef.current, { type: recordedMime }) : null
      releaseStream()
      recorderRef.current = null
      activeStepRef.current = null
      chunksRef.current = []
      mimeRef.current = null
      if (mountedRef.current) setActiveStepId(null)
      if (!wasCancelled && recordedStepId && blob?.size && recordedMime) handlerRef.current(recordedStepId, new File([blob], `nota.${recordedMime.split('/')[1]?.split(';')[0] ?? 'audio'}`, { type: recordedMime }))
    }
    try { recorder.start() } catch (error) {
      releaseStream()
      recorderRef.current = null
      activeStepRef.current = null
      setActiveStepId(null)
      throw error
    }
  }, [releaseStream])

  useEffect(() => () => {
    mountedRef.current = false
    cancelledRef.current = true
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') recorder.stop()
    else releaseStream()
  }, [releaseStream])

  return { activeStepId, start, stop, cancel }
}
