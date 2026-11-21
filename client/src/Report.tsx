import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { apiUrl } from './api'
import VoiceInput from './VoiceInput'
import type { VoiceLanguage } from './VoiceInput'

const categories = ['UNSURE', 'ROAD_DAMAGE', 'WATER_LEAKAGE', 'WASTE', 'STREETLIGHTING']
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
  const [reportLanguage, setReportLanguage] = useState<VoiceLanguage>(() => i18n.language === 'ta' ? 'ta' : 'en')
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)
  const [receipt, setReceipt] = useState<{ reference: string; token: string } | null>(null)
  const attempt = useRef<{ reference: string; token: string } | null>(null)
  const active = useRef(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (active.current) return
    const form = new FormData(event.currentTarget)
    const title = String(form.get('title') ?? '').trim()
    const location = String(form.get('location') ?? '').trim()
    const description = String(form.get('description') ?? '').trim()
    if (!title || !location || !description) {
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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...credentials, title, location, description, category: form.get('category'), photo, language: form.get('language') }),
      })
      if (response.status === 413 || response.status === 415) throw new Error('photoInvalid')
      if (!response.ok) throw new Error('reportFailed')
      setReceipt(credentials)
    } catch (failure) {
      setError(failure instanceof Error && failure.message === 'photoInvalid' ? 'photoInvalid' : 'reportFailed')
    } finally {
      active.current = false
      setSending(false)
    }
  }

  if (receipt) return <section className="panel">
    <h1>{t('reportSaved')}</h1>
    <p>{t('saveTracking')}</p>
    <dl><dt>{t('reference')}</dt><dd>{receipt.reference}</dd>
      <dt>{t('accessCode')}</dt><dd><code className="tracking-code">{receipt.token}</code></dd></dl>
    <Link className="button primary" to={'/track#' + new URLSearchParams({ ref: receipt.reference, token: receipt.token })}>{t('track')}</Link>
    <button className="button secondary" onClick={() => { attempt.current = null; setDescription(''); setReportLanguage(i18n.language === 'ta' ? 'ta' : 'en'); setReceipt(null) }}>{t('newReport')}</button>
  </section>

  return <section className="panel">
    <h1>{t('report')}</h1>
    <p>{t('reportInfo')}</p>
    <VoiceInput defaultLanguage={reportLanguage} onApply={(transcript, language) => {
      const previous = description.trimEnd()
      const combined = previous ? previous + '\n\n' + transcript : transcript
      if (combined.length > 3000) return false
      setDescription(combined)
      if (!previous.trim()) setReportLanguage(language)
      return true
    }}/>
    <form onSubmit={submit} noValidate>
      <fieldset disabled={sending} className="fields report-fields">
        <label>{t('title')}<input name="title" maxLength={120} required/></label>
        <label>{t('location')}<input name="location" maxLength={250} required/></label>
        <label>{t('category')}<select name="category">{categories.map(code => <option key={code} value={code}>{t(code)}</option>)}</select></label>
        <label>{t('reportLanguage')}<select name="language" value={reportLanguage} onChange={event => setReportLanguage(event.target.value as VoiceLanguage)}><option value="ta" lang="ta">தமிழ்</option><option value="en" lang="en">English</option><option value="hi">{t('hindi')}</option></select></label>
        <label className="wide">{t('description')}<textarea name="description" value={description} onChange={event => setDescription(event.target.value)} rows={5} maxLength={3000} required/></label>
        <label className="wide">{t('photo')}<input name="photo" type="file" accept="image/jpeg,image/png,image/webp"/><small>{t('photoHint')}</small></label>
      </fieldset>
      {error && <p className="notice" role="alert">{t(error)}</p>}
      <div className="actions"><button className="button primary" disabled={sending}>{t(sending ? 'sending' : 'submitReport')}</button></div>
    </form>
  </section>
}
