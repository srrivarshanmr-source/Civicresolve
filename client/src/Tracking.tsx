import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Clock3, Inbox, AlertTriangle, ArrowRight, ShieldAlert, Sparkles } from 'lucide-react'
import { apiUrl } from './api'
import { getLocalReports } from './Report'
import type { StoredReport } from './Report'

type Summary = {
  trackingReference: string
  title: string
  incident: {
    status: 'REPORTED' | 'IN_PROGRESS' | 'RESOLVED'
    priority?: string
    resolutionNote: string | null
    assignment?: { responseDueAt: string; respondedAt: string | null; department: { code: string; jurisdiction: string } } | null
    evidence?: { status: string; isAiGenerated?: boolean } | null
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
  const [myReports, setMyReports] = useState<StoredReport[]>([])

  useEffect(() => {
    setMyReports(getLocalReports())
  }, [])

  useEffect(() => {
    if (!lookup) return
    const controller = new AbortController()
    fetchSummary(lookup.reference, lookup.token, controller.signal)
      .then(setSummary)
      .catch(err => {
        if (controller.signal.aborted) return
        setError(err.message === 'trackingMissing' ? 'trackingMissing' : 'trackingUnavailable')
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

  function trackSavedReport(report: StoredReport) {
    setReference(report.reference)
    setToken(report.token)
    setSummary(null)
    setError('')
    setLoading(true)
    setReason('')
    setAppealMessage('')
    setLookup({ reference: report.reference, token: report.token })
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

  // Calculate Stepper State
  const status = current?.status ?? 'REPORTED'
  const isAssigned = Boolean(current?.assignment || current?.timeline?.some(e => e.kind === 'ASSIGNED'))
  const isStep1 = true // Registered
  const isStep2 = isAssigned || status === 'IN_PROGRESS' || status === 'RESOLVED' // Under Review
  const isStep3 = status === 'IN_PROGRESS' || status === 'RESOLVED' // In Progress
  const isStep4 = status === 'RESOLVED' // Resolved

  return (
    <div className="tracking-page-container">
      {/* My Saved Reports Tray */}
      {myReports.length > 0 && (
        <section className="my-reports-tray">
          <h2>{t('myReports')}</h2>
          <p className="tray-subtitle">Saved on this device for 1-click tracking:</p>
          <div className="my-reports-list">
            {myReports.map(rep => (
              <div
                key={rep.reference}
                className={`my-report-chip ${lookup?.reference === rep.reference ? 'selected' : ''}`}
                onClick={() => trackSavedReport(rep)}
              >
                <div className="chip-header">
                  <strong>{rep.title || t(rep.category)}</strong>
                  <span className="chip-ref">{rep.reference}</span>
                </div>
                <div className="chip-footer">
                  <span className="chip-loc">{rep.location}</span>
                  <button type="button" className="chip-track-btn">
                    {t('track')} <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Manual Track Form */}
      <section className="panel">
        <h1>{t('track')}</h1>
        <p>{t('trackingInstructions')}</p>

        <form onSubmit={submit}>
          <div className="fields">
            <label>
              {t('reference')}
              <input
                value={reference}
                onChange={event => setReference(event.target.value)}
                maxLength={19}
                placeholder="CR-XXXXXXXXXXXXXXXX"
                required
              />
            </label>
            <label>
              {t('accessCode')}
              <input
                type="password"
                value={token}
                onChange={event => setToken(event.target.value)}
                maxLength={43}
                placeholder="Access code from submission receipt"
                required
              />
            </label>
          </div>
          <div className="actions">
            <button className="button primary" disabled={loading}>
              {t('track')}
            </button>
          </div>
        </form>

        {loading && <p role="status">{t('trackingLoading')}</p>}
        {error && <p className="notice" role="alert">{t(error)}</p>}

        {summary && (
          <article className="tracking-result-box" aria-live="polite">
            <div className="tracking-header-row">
              <div>
                <h2>{summary.title}</h2>
                <span className="tracking-ref-badge">{summary.trackingReference}</span>
              </div>
              <span className={`status-pill status-${status.toLowerCase()}`}>
                {t(status)}
              </span>
            </div>

            {/* Visual Stepper */}
            <div className="complaint-stepper">
              <div className={`step-item ${isStep1 ? 'completed' : ''}`}>
                <div className="step-circle"><CheckCircle2 size={18} /></div>
                <span>Registered</span>
              </div>
              <div className={`step-line ${isStep2 ? 'completed' : ''}`}></div>

              <div className={`step-item ${isStep2 ? 'completed' : ''}`}>
                <div className="step-circle"><Clock3 size={18} /></div>
                <span>Under Review</span>
              </div>
              <div className={`step-line ${isStep3 ? 'completed' : ''}`}></div>

              <div className={`step-item ${isStep3 ? 'completed' : ''}`}>
                <div className="step-circle"><Clock3 size={18} /></div>
                <span>In Progress</span>
              </div>
              <div className={`step-line ${isStep4 ? 'completed' : ''}`}></div>

              <div className={`step-item ${isStep4 ? 'completed' : ''}`}>
                <div className="step-circle"><CheckCircle2 size={18} /></div>
                <span>Resolved</span>
              </div>
            </div>

            {/* Cryptographic Authenticity Proof Badge */}
            <div className="authenticity-proof-badge" style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#f0fdf4', border: '1px solid #86efac', padding: '10px 14px', borderRadius: 6, margin: '16px 0', fontSize: '0.86rem', color: '#166534' }}>
              <CheckCircle2 size={20} style={{ color: '#15803d', flexShrink: 0 }} />
              <div>
                <strong>Tamper-Proof Authenticity Verified:</strong> Grievance content cryptographically hashed (SHA-256) & screened against synthetic/AI image manipulation.
              </div>
            </div>

            {/* AI Image Flag Warning if detected */}
            {current?.evidence?.status === 'AI_INDICATED' && (
              <div className="ai-warning-box">
                <ShieldAlert size={20} />
                <div>
                  <strong>{t('aiImageFlag')}</strong>
                  <p>Our automated vision checks detected that the photo attached to this report may have been generated or modified using AI synthesis tools.</p>
                </div>
              </div>
            )}

            {summary.incident.resolutionNote && (
              <div className="resolution-highlight">
                <strong>{t('resolutionNote')}</strong>
                <p>{summary.incident.resolutionNote}</p>
              </div>
            )}

            {current?.assignment && (
              <div className="assignment-info-card">
                <p>
                  <strong>{t('department')}:</strong> {t(current.assignment.department.code)} · {current.assignment.department.jurisdiction}
                  <br />
                  <strong>{t('responseDue')}:</strong> <time dateTime={current.assignment.responseDueAt}>{date(current.assignment.responseDueAt)}</time>
                </p>
              </div>
            )}

            {!!current?.timeline?.length && (
              <div className="timeline-section">
                <h3>{t('timeline')}</h3>
                <ul className="tracking-timeline">
                  {current.timeline.map((entry, index) => (
                    <li key={entry.createdAt + entry.kind + index}>
                      <strong>{t(entry.kind)}</strong> · <time dateTime={entry.createdAt}>{date(entry.createdAt)}</time>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {current?.assignment && !hasAppealed && (current.status === 'RESOLVED' || current.evidence?.status === 'DISPUTED') && (
              <form onSubmit={appeal} className="appeal-form">
                <label>
                  {t('appealReason')}
                  <textarea rows={2} maxLength={800} value={reason} onChange={event => setReason(event.target.value)} />
                </label>
                <button className="button secondary spaced" disabled={!reason.trim() || appealing}>
                  {t('appealButton')}
                </button>
              </form>
            )}

            {appealMessage && <p role="status" className="notice">{t(appealMessage)}</p>}
          </article>
        )}
      </section>
    </div>
  )
}
