import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { MapPin, Navigation, CheckCircle2, ArrowRight } from 'lucide-react'
import { apiUrl } from './api'
import VoiceInput from './VoiceInput'
import type { VoiceLanguage } from './VoiceInput'

const categories = ['UNSURE', 'ROAD_DAMAGE', 'WATER_LEAKAGE', 'WASTE', 'STREETLIGHTING']

export type StoredReport = {
  reference: string
  token: string
  title: string
  location: string
  category: string
  createdAt: string
  status: string
}

export function saveReportToLocal(report: StoredReport) {
  try {
    const list: StoredReport[] = JSON.parse(localStorage.getItem('civic_my_reports') || '[]')
    const updated = [report, ...list.filter(r => r.reference !== report.reference)]
    localStorage.setItem('civic_my_reports', JSON.stringify(updated.slice(0, 30)))
  } catch (e) {
    console.warn('Failed to save report to local storage:', e)
  }
}

export function getLocalReports(): StoredReport[] {
  try {
    return JSON.parse(localStorage.getItem('civic_my_reports') || '[]')
  } catch {
    return []
  }
}

function trackingCredentials() {
  const reference = 'CR-' + Array.from(crypto.getRandomValues(new Uint8Array(8)), byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
  const token = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
  return { reference, token }
}

async function encodePhoto(file: File) {
  if (file.size > 2 * 1024 * 1024) throw new Error('photoInvalid')
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(new Error('photoInvalid'))
    reader.readAsDataURL(file)
  })
}

export default function Report() {
  const { t, i18n } = useTranslation()
  const [description, setDescription] = useState('')
  const [location, setLocation] = useState('')
  const [locating, setLocating] = useState(false)
  const [reportLanguage, setReportLanguage] = useState<VoiceLanguage>(() => i18n.language === 'ta' ? 'ta' : 'en')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [receipt, setReceipt] = useState<{ reference: string; token: string } | null>(null)
  const attempt = useRef<{ reference: string; token: string } | null>(null)
  const active = useRef(false)

  function fetchGpsLocation() {
    if (!navigator.geolocation) return
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        const coords = `Lat: ${pos.coords.latitude.toFixed(4)}, Long: ${pos.coords.longitude.toFixed(4)}`
        setLocation(coords)
        setLocating(false)
      },
      () => {
        setLocating(false)
      },
      { timeout: 10000 }
    )
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (active.current) return
    const form = new FormData(event.currentTarget)
    const title = String(form.get('title') ?? '').trim()
    const loc = location.trim() || String(form.get('location') ?? '').trim()
    const desc = String(form.get('description') ?? '').trim()
    const cat = String(form.get('category') ?? 'UNSURE')

    if (!title || !loc || !desc) {
      setError('requiredFields')
      return
    }
    active.current = true
    setSending(true)
    setError('')
    try {
      const file = form.get('photo')
      const photo = file instanceof File && file.size ? await encodePhoto(file) : undefined
      const credentials = attempt.current ??= trackingCredentials()
      const response = await fetch(apiUrl('/api/reports'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...credentials,
          title,
          location: loc,
          description: desc,
          category: cat,
          photo,
          language: form.get('language')
        }),
      })

      if (response.status === 413 || response.status === 415) throw new Error('photoInvalid')
      if (response.status === 422 && (await response.json()).code === 'PHOTO_AI_REJECTED') throw new Error('photoAiRejected')
      if (!response.ok) throw new Error('reportFailed')

      // Save to localStorage so switching tabs or leaving the site preserves tracking!
      saveReportToLocal({
        reference: credentials.reference,
        token: credentials.token,
        title,
        location: loc,
        category: cat,
        createdAt: new Date().toISOString(),
        status: 'REPORTED',
      })

      setReceipt(credentials)
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : ''
      setError(message === 'photoInvalid' || message === 'photoAiRejected' ? message : 'reportFailed')
    } finally {
      active.current = false
      setSending(false)
    }
  }

  if (receipt) {
    return (
      <section className="panel report-success-panel">
        <div className="report-success-badge">
          <CheckCircle2 size={44} />
        </div>
        <h1>{t('reportSaved')}</h1>
        <p className="success-tagline">{t('saveTracking')}</p>

        <div className="receipt-box">
          <dl>
            <dt>{t('reference')}</dt>
            <dd className="highlight-ref">{receipt.reference}</dd>
            <dt>{t('accessCode')}</dt>
            <dd><code className="tracking-code">{receipt.token}</code></dd>
          </dl>
          <p className="saved-note">
            ✓ <em>This complaint has been automatically saved to <strong>My Reports</strong> on this device so you can track it anytime without losing your code.</em>
          </p>
        </div>

        <div className="actions">
          <Link
            className="button primary"
            to={'/track#' + new URLSearchParams({ ref: receipt.reference, token: receipt.token })}
          >
            {t('track')} <ArrowRight size={16} />
          </Link>
          <button
            className="button secondary"
            onClick={() => {
              attempt.current = null
              setDescription('')
              setLocation('')
              setReportLanguage(i18n.language === 'ta' ? 'ta' : 'en')
              setReceipt(null)
            }}
          >
            {t('newReport')}
          </button>
        </div>
      </section>
    )
  }

  return (
    <section className="panel">
      <h1>{t('report')}</h1>
      <p>{t('reportInfo')}</p>

      <VoiceInput
        defaultLanguage={reportLanguage}
        onApply={(transcript, language) => {
          const previous = description.trimEnd()
          const combined = previous ? previous + '\n\n' + transcript : transcript
          if (combined.length > 3000) return false
          setDescription(combined)
          if (!previous.trim()) setReportLanguage(language)
          return true
        }}
      />

      <form onSubmit={submit} noValidate>
        <fieldset disabled={sending} className="fields report-fields">
          <label>
            {t('title')} *
            <input name="title" maxLength={120} placeholder="e.g. Broken water pipe" required />
          </label>

          <label>
            {t('location')} *
            <div className="loc-input-group">
              <input
                name="location"
                value={location}
                onChange={e => setLocation(e.target.value)}
                maxLength={250}
                placeholder="Landmark, street name or area"
                required
              />
              <button
                type="button"
                className="gps-btn"
                title={t('useGps')}
                onClick={fetchGpsLocation}
                disabled={locating}
              >
                <Navigation size={16} className={locating ? 'animate-spin' : ''} />
              </button>
            </div>
          </label>

          <label>
            {t('category')}
            <select name="category">
              {categories.map(code => (
                <option key={code} value={code}>{t(code)}</option>
              ))}
            </select>
          </label>

          <label>
            {t('reportLanguage')}
            <select
              name="language"
              value={reportLanguage}
              onChange={event => setReportLanguage(event.target.value as VoiceLanguage)}
            >
              <option value="ta" lang="ta">தமிழ்</option>
              <option value="en" lang="en">English</option>
              <option value="hi">{t('hindi')}</option>
            </select>
          </label>

          <label className="wide">
            {t('description')} *
            <textarea
              name="description"
              value={description}
              onChange={event => setDescription(event.target.value)}
              rows={5}
              maxLength={3000}
              placeholder="Describe what happened and any hazards present..."
              required
            />
          </label>

          <label className="wide">
            {t('photo')}
            <input name="photo" type="file" accept="image/jpeg,image/png,image/webp" />
            <small>{t('photoHint')}</small>
          </label>
        </fieldset>

        {error && <p className="notice" role="alert">{t(error)}</p>}

        <div className="actions">
          <button className="button primary" disabled={sending}>
            {t(sending ? 'sending' : 'submitReport')}
          </button>
        </div>
      </form>
    </section>
  )
}
