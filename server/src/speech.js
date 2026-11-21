import { GoogleAuth } from 'google-auth-library'

const location = 'asia-southeast1'
const maxAudioBytes = 1024 * 1024
const languages = { ta: 'ta-IN', en: 'en-IN', hi: 'hi-IN' }

export function createTranscriber(projectId, auth = new GoogleAuth({
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
})) {
  const url = 'https://' + location + '-speech.googleapis.com/v2/projects/'
    + encodeURIComponent(projectId) + '/locations/' + location + '/recognizers/_:recognize'
  return async (audio, language) => {
    const client = await auth.getClient()
    const { data } = await client.request({
      url,
      method: 'POST',
      timeout: 25_000,
      data: {
        config: { autoDecodingConfig: {}, languageCodes: [languages[language]], model: 'chirp_2', features: { enableAutomaticPunctuation: true } },
        content: audio.toString('base64'),
      },
    })
    return (data.results ?? []).map(result => result.alternatives?.[0]?.transcript ?? '').join(' ').trim()
  }
}

const extensions = { 'audio/webm': 'webm', 'audio/mp4': 'mp4', 'audio/ogg': 'ogg' }

export function createGroqTranscriber(apiKey, request = fetch) {
  return async (audio, language, type) => {
    const form = new FormData()
    form.set('file', new Blob([audio], { type }), 'recording.' + extensions[type])
    form.set('model', 'whisper-large-v3-turbo')
    form.set('language', language)
    form.set('response_format', 'json')
    form.set('temperature', '0')
    const response = await request('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST', body: form,
      headers: { Authorization: 'Bearer ' + apiKey },
      signal: AbortSignal.timeout(25_000),
    })
    if (!response.ok) throw Object.assign(new Error('Transcription request failed'), { status: response.status })
    const data = await response.json()
    return typeof data.text === 'string' ? data.text.trim() : ''
  }
}

function supportedAudio(audio, type) {
  if (audio.length < 12) return false
  if (type === 'audio/webm') return audio.readUInt32BE(0) === 0x1a45dfa3
  if (type === 'audio/mp4') return audio.toString('ascii', 4, 8) === 'ftyp'
  if (type === 'audio/ogg') return audio.toString('ascii', 0, 4) === 'OggS'
  return false
}

export function registerVoiceRoute(app, transcribe, raw) {
  let activeRequests = 0
  app.post('/api/voice/transcribe/:language', (req, res, next) => {
    if (!transcribe) return res.sendStatus(503)
    if (!Object.hasOwn(languages, req.params.language)) return res.sendStatus(400)
    if (!req.is(['audio/webm', 'audio/mp4', 'audio/ogg'])) return res.sendStatus(415)
    next()
  }, raw({ type: ['audio/webm', 'audio/mp4', 'audio/ogg'], limit: maxAudioBytes, inflate: false }), async (req, res) => {
    const type = req.is(['audio/webm', 'audio/mp4', 'audio/ogg'])
    if (!Buffer.isBuffer(req.body) || !supportedAudio(req.body, type)) return res.sendStatus(415)
    if (activeRequests >= 4) return res.sendStatus(429)
    activeRequests++
    try {
      const transcript = await transcribe(req.body, req.params.language, type)
      if (!transcript) return res.sendStatus(422)
      res.json({ transcript })
    } catch (error) {
      const status = error.status ?? error.response?.status
      if (status === 429) return res.sendStatus(429)
      console.error('Speech transcription failed', status ?? error.code ?? error.name)
      res.sendStatus(502)
    } finally {
      activeRequests--
    }
  })
}
