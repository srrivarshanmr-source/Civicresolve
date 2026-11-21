import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { apiUrl } from './api'

type Summary = {
  trackingReference: string
  title: string
  incident: {
    status: 'REPORTED' | 'IN_PROGRESS' | 'RESOLVED'
    resolutionNote: string | null
    assignment?: { responseDueAt: string; respondedAt: string | null; department: { code: string; jurisdiction: string } } | null
    evidence?: { status: string } | null
    timeline?: { kind: string; createdAt: string }[]
  }
}

async function fetchSummary(reference: string, token: string, signal: AbortSignal): Promise<Summary> {
  const response = await fetch(apiUrl('/api/tracking/' + encodeURIComponent(reference.trim())), {
    headers: { Authorization: 'Bearer ' + token.trim() },
    signal,
  })
  if (!response.ok) throw new Error(response.status === 404 ? 'trackingMissing' : 'trackingUnavailable')
  return response.json()
}

export default function Tracking() {
  const { t, i18n } = useTranslation()
  const [link] = useState(() => new URLSearchParams(window.location.hash.slice(1)))
  const [reference, setReference] = useState(link.get('ref') ?? '')
  const [token, setToken] = useState(link.get('token') ?? '')
  const [lookup, setLookup] = useState(() => reference && token ? { reference, token } : null)
  const [summary, setSummary] = useState<Summary | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(Boolean(lookup))
  const [reason, setReason] = useState('')
  const [appealing, setAppealing] = useState(false)
  const [appealMessage, setAppealMessage] = useState('')

  useEffect(() => {
    if (!lookup) return
    const controller = new AbortController()
    fetchSummary(lookup.reference, lookup.token, controller.signal)
      .then(setSummary)
      .catch(error => {
        if (controller.signal.aborted) return
        setError(error.message === 'trackingMissing' ? 'trackingMissing' : 'trackingUnavailable')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [lookup])

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSummary(null)
    setError('')
    setLoading(true)
    setReason('')
    setAppealMessage('')
    setLookup({ reference, token })
  }

  async function appeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!lookup || !reason.trim() || appealing) return
    setAppealing(true)
    setAppealMessage('')
    try {
      const response = await fetch(apiUrl('/api/tracking/' + encodeURIComponent(lookup.reference.trim()) + '/appeal'), {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + lookup.token.trim(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      })
      if (!response.ok) throw new Error()
      setReason('')
      setAppealMessage('appealSuccess')
      setLookup({ ...lookup })
    } catch {
      setAppealMessage('appealFailed')
    } finally {
      setAppealing(false)
    }
  }

  const date = (value: string) => new Date(value).toLocaleString(i18n.language)
  const current = summary?.incident
  const hasAppealed = current?.timeline?.some(event => event.kind === 'CITIZEN_APPEALED')
  return <section className="panel">
    <h1>{t('track')}</h1>
    <p>{t('trackingInstructions')}</p>
    <form onSubmit={submit}>
      <div className="fields">
        <label>{t('reference')}<input value={reference} onChange={event => setReference(event.target.value)} maxLength={19} required/></label>
        <label>{t('accessCode')}<input type="password" value={token} onChange={event => setToken(event.target.value)} maxLength={43} required/></label>
      </div>
      <div className="actions"><button className="button primary" disabled={loading}>{t('track')}</button></div>
    </form>
    {loading && <p role="status">{t('trackingLoading')}</p>}
    {error && <p className="notice" role="alert">{t(error)}</p>}
    {summary && <article className="notice" aria-live="polite">
      <h2>{summary.title}</h2><p>{summary.trackingReference} · {t(summary.incident.status)}</p>
      {summary.incident.resolutionNote && <p>{summary.incident.resolutionNote}</p>}
      {current?.assignment && <p>
        {t('department')}: {t(current.assignment.department.code)} · {current.assignment.department.jurisdiction}<br/>
        {t('responseDue')}: <time dateTime={current.assignment.responseDueAt}>{date(current.assignment.responseDueAt)}</time>
      </p>}
      <p>{t('evidenceStatus')}: {t(current?.evidence?.status ?? 'UNVERIFIED')}</p>
      {!!current?.timeline?.length && <>
        <h3>{t('timeline')}</h3>
        <ul className="tracking-timeline">{current.timeline.map((entry, index) => <li key={entry.createdAt + entry.kind + index}>
          {t(entry.kind)} · <time dateTime={entry.createdAt}>{date(entry.createdAt)}</time>
        </li>)}</ul>
      </>}
      {current?.assignment && !hasAppealed && (current.status === 'RESOLVED' || current.evidence?.status === 'DISPUTED') && <form onSubmit={appeal}>
        <label>{t('appealReason')}<textarea rows={2} maxLength={800} value={reason} onChange={event => setReason(event.target.value)}/></label>
        <button className="button secondary spaced" disabled={!reason.trim() || appealing}>{t('appealButton')}</button>
      </form>}
      {appealMessage && <p role="status">{t(appealMessage)}</p>}
    </article>}
  </section>
}
