import { useEffect, useRef, useState } from 'react'
import { Mic, Square } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { apiUrl } from './api'

export type VoiceLanguage = 'ta' | 'en' | 'hi'
type Phase = 'idle' | 'permission' | 'recording' | 'processing'
type Session = {
  controller: AbortController
  stream?: MediaStream
  recorder?: MediaRecorder
  timer?: number
}
const formats = ['audio/webm;codecs=opus', 'audio/mp4;codecs=mp4a.40.2', 'audio/mp4', 'audio/ogg;codecs=opus']
const maxDuration = 30_000
const maxAudioBytes = 1024 * 1024

function release(session: Session) {
  window.clearTimeout(session.timer)
  session.stream?.getTracks().forEach(track => track.stop())
}

export default function VoiceInput({ defaultLanguage, onApply }: {
  defaultLanguage: VoiceLanguage
  onApply: (transcript: string, language: VoiceLanguage) => boolean
}) {
  const { t } = useTranslation()
  const session = useRef<Session | null>(null)
  const [language, setLanguage] = useState(defaultLanguage)
  const [phase, setPhase] = useState<Phase>('idle')
  const [transcript, setTranscript] = useState<string | null>(null)
  const [transcriptLanguage, setTranscriptLanguage] = useState(defaultLanguage)
  const [error, setError] = useState('')
  const [applied, setApplied] = useState(false)

  useEffect(() => () => {
    if (!session.current) return
    session.current.controller.abort()
    release(session.current)
    session.current = null
  }, [])

  function finish(current: Session) {
    release(current)
    if (session.current === current) {
      session.current = null
      setPhase('idle')
    }
  }

  function cancel() {
    const current = session.current
    if (!current) return
    current.controller.abort()
    finish(current)
  }

  async function upload(current: Session, audio: Blob, spokenLanguage: VoiceLanguage) {
    if (current.controller.signal.aborted) return
    release(current)
    setPhase('processing')
    try {
      if (!audio.size) throw new Error('voiceNoSpeech')
      if (audio.size > maxAudioBytes) throw new Error('voiceTooLarge')
      const response = await fetch(apiUrl('/api/voice/transcribe/' + spokenLanguage), {
        method: 'POST',
        body: audio,
        signal: current.controller.signal,
      })
      if (response.status === 422) throw new Error('voiceNoSpeech')
      if (response.status === 413) throw new Error('voiceTooLarge')
      if (response.status === 429) throw new Error('voiceBusy')
      if (response.status === 503) throw new Error('voiceUnavailable')
      if (!response.ok) throw new Error('voiceFailed')
      const result: { transcript: string } = await response.json()
      if (!current.controller.signal.aborted) {
        setTranscript(result.transcript)
        setTranscriptLanguage(spokenLanguage)
      }
    } catch (failure) {
      if (!current.controller.signal.aborted) {
        const reason = failure instanceof Error ? failure.message : ''
        setError(['voiceNoSpeech', 'voiceTooLarge', 'voiceUnavailable', 'voiceBusy'].includes(reason) ? reason : 'voiceFailed')
      }
    } finally {
      finish(current)
    }
  }

  async function record() {
    if (session.current) return
    setError('')
    setApplied(false)
    const format = typeof MediaRecorder !== 'undefined' && formats.find(type => MediaRecorder.isTypeSupported(type))
    if (!navigator.mediaDevices?.getUserMedia || !format) {
      setError('voiceUnsupported')
      return
    }
    const current: Session = { controller: new AbortController() }
    session.current = current
    setPhase('permission')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      current.stream = stream
      if (current.controller.signal.aborted) { release(current); return }
      const recorder = new MediaRecorder(stream, { mimeType: format, audioBitsPerSecond: 48_000 })
      current.recorder = recorder
      const chunks: Blob[] = []
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data) }
      recorder.onstop = () => void upload(current, new Blob(chunks, { type: format.split(';')[0] }), language)
      recorder.onerror = () => {
        if (current.controller.signal.aborted) return
        current.controller.abort()
        setError('voiceFailed')
        finish(current)
      }
      recorder.start()
      current.timer = window.setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop()
      }, maxDuration)
      setPhase('recording')
    } catch (failure) {
      if (current.controller.signal.aborted) return
      setError(failure instanceof DOMException && failure.name === 'NotAllowedError' ? 'voiceDenied' : 'voiceFailed')
      finish(current)
    }
  }

  function apply() {
    if (!transcript?.trim()) return
    if (!onApply(transcript.trim(), transcriptLanguage)) {
      setError('voiceDescriptionFull')
      return
    }
    setTranscript(null)
    setError('')
    setApplied(true)
  }

  return <section className="voice-section" aria-labelledby="voice-heading">
    <h2 id="voice-heading">{t('voiceHeading')}</h2>
    <p>{t('voiceIntro')}</p>
    <label>{t('spokenLanguage')}<select value={language} disabled={phase !== 'idle'} onChange={event => setLanguage(event.target.value as VoiceLanguage)}>
      <option value="ta" lang="ta">தமிழ்</option>
      <option value="en">{t('indianEnglish')}</option>
      <option value="hi">{t('hindi')}</option>
    </select></label>
    <div className="actions">
      {phase === 'idle' && <button type="button" className="button primary" onClick={() => void record()}><Mic size={18} aria-hidden="true"/>{t('startRecording')}</button>}
      {phase === 'recording' && <button type="button" className="button primary" onClick={() => {
        const recorder = session.current?.recorder
        if (recorder?.state === 'recording') recorder.stop()
      }}><Square size={17} aria-hidden="true"/>{t('stopRecording')}</button>}
      {phase !== 'idle' && <button type="button" className="button secondary" onClick={cancel}>{t('cancelRecording')}</button>}
    </div>
    {phase !== 'idle' && <p role="status">{t({ permission: 'voicePermission', recording: 'voiceRecording', processing: 'voiceProcessing' }[phase])}</p>}
    {error && <p className="notice" role="alert">{t(error)}</p>}
    {applied && <p role="status">{t('voiceApplied')}</p>}
    {transcript !== null && phase === 'idle' && <>
      <label className="spaced">{t('editTranscript')}<textarea value={transcript} onChange={event => setTranscript(event.target.value)} rows={4}/></label>
      <div className="actions">
        <button type="button" className="button secondary" disabled={!transcript.trim()} onClick={apply}>{t('useTranscript')}</button>
        <button type="button" className="button secondary" onClick={() => { setTranscript(null); setError('') }}>{t('discardTranscript')}</button>
      </div>
    </>}
  </section>
}
