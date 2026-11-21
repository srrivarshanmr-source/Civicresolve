import { useEffect, useState, useMemo } from 'react'
import type { FormEvent } from 'react'
import type { User } from 'firebase/auth'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import {
  ArrowLeft, ArrowRight, CheckCircle2, Clock3, Inbox,
  ShieldCheck, Search, Filter, RefreshCw, BarChart3,
  ListFilter, PlusCircle, AlertTriangle, MapPin, Camera,
  FileText, Check, Sparkles, Building2, Eye
} from 'lucide-react'
import CaseReview from './CaseReview'
import PublicDashboard from './PublicDashboard'
import { apiUrl } from './api'
import { useAuth } from './auth'

type Status = 'REPORTED' | 'IN_PROGRESS' | 'RESOLVED'
type Report = { id: string; title: string; description: string; location: string; photoMime: string | null; createdAt?: string }
type Incident = {
  id: string
  status: Status
  category: string
  priority: string
  resolutionNote: string | null
  createdAt: string
  reports: Report[]
}

const categories = ['UNSURE', 'ROAD_DAMAGE', 'WATER_LEAKAGE', 'WASTE', 'STREETLIGHTING']
const priorities = ['LOW', 'STANDARD', 'HIGH']

async function request(user: User, path: string, options?: RequestInit) {
  const headers = new Headers(options?.headers)
  headers.set('Authorization', 'Bearer ' + await user.getIdToken())
  const response = await fetch(apiUrl('/api/staff/' + path), { ...options, headers })
  if (!response.ok) throw new Error(response.status === 403 ? 'staffForbidden' : response.status === 409 ? 'staleIncident' : 'staffFailed')
  return response
}

export default function Staff() {
  const { t } = useTranslation()
  const { user, loading: authLoading, signing, error: authError, signIn } = useAuth()
  const [activeTab, setActiveTab] = useState<'queue' | 'analytics' | 'dispatch'>('queue')

  if (authLoading) {
    return (
      <div className="admin-loading-screen">
        <div className="spinner"></div>
        <p>{t('loading')}</p>
      </div>
    )
  }

  if (!user) {
    return (
      <section className="admin-login-hero">
        <div className="admin-login-card">
          <div className="admin-login-icon">
            <ShieldCheck size={48} strokeWidth={1.5} />
          </div>
          <h1>{t('adminConsole')}</h1>
          <p>{t('staffInfo')}</p>

          <button
            className="button primary admin-signin-btn"
            disabled={signing}
            onClick={() => void signIn()}
          >
            <ShieldCheck size={20} />
            {t(signing ? 'loading' : 'signIn')}
          </button>

          <Link to="/" className="admin-back-link">
            <ArrowLeft size={16} />
            {t('citizenView')}
          </Link>

          {authError && <p className="notice" role="alert">{t(authError)}</p>}
        </div>
      </section>
    )
  }

  return (
    <div className="admin-portal-container">
      {/* Navigation Mode Tabs */}
      <nav className="admin-subnav" aria-label="Admin Navigation">
        <button
          type="button"
          className={`admin-nav-btn ${activeTab === 'queue' ? 'active' : ''}`}
          onClick={() => setActiveTab('queue')}
        >
          <ListFilter size={18} />
          <span>{t('tabQueue')}</span>
        </button>

        <button
          type="button"
          className={`admin-nav-btn ${activeTab === 'analytics' ? 'active' : ''}`}
          onClick={() => setActiveTab('analytics')}
        >
          <BarChart3 size={18} />
          <span>{t('tabAnalytics')}</span>
        </button>

        <button
          type="button"
          className={`admin-nav-btn ${activeTab === 'dispatch' ? 'active' : ''}`}
          onClick={() => setActiveTab('dispatch')}
        >
          <PlusCircle size={18} />
          <span>{t('tabDispatch')}</span>
        </button>
      </nav>

      {/* Main Workspace Body */}
      {activeTab === 'queue' && <Queue user={user} />}
      {activeTab === 'analytics' && (
        <div className="admin-analytics-view">
          <PublicDashboard />
        </div>
      )}
      {activeTab === 'dispatch' && <InternalDispatch user={user} onCreated={() => setActiveTab('queue')} />}
    </div>
  )
}

function Queue({ user }: { user: User }) {
  const { t, i18n } = useTranslation()
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [selected, setSelected] = useState<Incident | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)
  const [more, setMore] = useState(false)

  // Filters & Search
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'REPORTED' | 'IN_PROGRESS' | 'RESOLVED'>('ALL')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [priorityFilter, setPriorityFilter] = useState('ALL')
  const [searchQuery, setSearchQuery] = useState('')

  const fetchIncidents = async () => {
    setBusy(true)
    setError('')
    try {
      const response = await request(user, 'incidents')
      const items: Incident[] = await response.json()
      setIncidents(items)
      setMore(items.length === 50)
      if (items.length && !selected) {
        setSelected(items[0])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'staffFailed')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    void fetchIncidents()
  }, [user])

  async function loadMore() {
    setBusy(true)
    setError('')
    try {
      const last = incidents.at(-1)!
      const cursor = new URLSearchParams({ before: last.createdAt, beforeId: last.id })
      const response = await request(user, 'incidents?' + cursor)
      const items: Incident[] = await response.json()
      setIncidents(previous => [...previous, ...items])
      setMore(items.length === 50)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'staffFailed')
    } finally {
      setBusy(false)
    }
  }

  async function open(id: string) {
    setBusy(true)
    setError('')
    try {
      setSelected(await (await request(user, 'incidents/' + id)).json())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'staffFailed')
    } finally {
      setBusy(false)
    }
  }

  function update(incident: Incident) {
    setSelected(incident)
    setIncidents(previous => previous.map(item => item.id === incident.id ? { ...item, ...incident } : item))
  }

  // Stats Counters
  const reportedCount = useMemo(() => incidents.filter(i => i.status === 'REPORTED').length, [incidents])
  const inProgressCount = useMemo(() => incidents.filter(i => i.status === 'IN_PROGRESS').length, [incidents])
  const resolvedCount = useMemo(() => incidents.filter(i => i.status === 'RESOLVED').length, [incidents])
  const resolutionRate = useMemo(() => {
    if (!incidents.length) return 0
    return Math.round((resolvedCount / incidents.length) * 100)
  }, [incidents, resolvedCount])

  // Filtered Items
  const filteredIncidents = useMemo(() => {
    return incidents.filter(incident => {
      if (statusFilter !== 'ALL' && incident.status !== statusFilter) return false
      if (categoryFilter !== 'ALL' && incident.category !== categoryFilter) return false
      if (priorityFilter !== 'ALL' && incident.priority !== priorityFilter) return false
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim()
        const title = incident.reports[0]?.title?.toLowerCase() ?? ''
        const desc = incident.reports[0]?.description?.toLowerCase() ?? ''
        const loc = incident.reports[0]?.location?.toLowerCase() ?? ''
        const id = incident.id.toLowerCase()
        if (!title.includes(query) && !desc.includes(query) && !loc.includes(query) && !id.includes(query)) {
          return false
        }
      }
      return true
    })
  }, [incidents, statusFilter, categoryFilter, priorityFilter, searchQuery])

  return (
    <section className="admin-queue-view">
      {/* Executive Stat Cards */}
      <div className="admin-stats-grid">
        <div className="admin-stat-card stat-total">
          <div className="stat-icon-wrapper">
            <FileText size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-label">{t('statsTotal')}</span>
            <span className="stat-number">{incidents.length}</span>
          </div>
        </div>

        <div
          className={`admin-stat-card stat-pending clickable ${statusFilter === 'REPORTED' ? 'active-filter' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'REPORTED' ? 'ALL' : 'REPORTED')}
        >
          <div className="stat-icon-wrapper">
            <Inbox size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-label">{t('statsPending')}</span>
            <span className="stat-number">{reportedCount}</span>
          </div>
          {reportedCount > 0 && <span className="stat-badge-pulse">{reportedCount} new</span>}
        </div>

        <div
          className={`admin-stat-card stat-progress clickable ${statusFilter === 'IN_PROGRESS' ? 'active-filter' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'IN_PROGRESS' ? 'ALL' : 'IN_PROGRESS')}
        >
          <div className="stat-icon-wrapper">
            <Clock3 size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-label">{t('statsInProgress')}</span>
            <span className="stat-number">{inProgressCount}</span>
          </div>
        </div>

        <div
          className={`admin-stat-card stat-resolved clickable ${statusFilter === 'RESOLVED' ? 'active-filter' : ''}`}
          onClick={() => setStatusFilter(statusFilter === 'RESOLVED' ? 'ALL' : 'RESOLVED')}
        >
          <div className="stat-icon-wrapper">
            <CheckCircle2 size={22} />
          </div>
          <div className="stat-content">
            <span className="stat-label">{t('statsResolved')}</span>
            <span className="stat-number">{resolvedCount} ({resolutionRate}%)</span>
          </div>
        </div>
      </div>

      {/* Main Workspace: Left Queue + Right Inspector */}
      <div className="admin-workspace-card">
        {/* Filter and Search Bar */}
        <div className="admin-toolbar">
          <div className="status-tab-group">
            <button
              type="button"
              className={`status-tab ${statusFilter === 'ALL' ? 'active' : ''}`}
              onClick={() => setStatusFilter('ALL')}
            >
              {t('allIssues')} <span className="tab-pill">{incidents.length}</span>
            </button>
            <button
              type="button"
              className={`status-tab ${statusFilter === 'REPORTED' ? 'active' : ''}`}
              onClick={() => setStatusFilter('REPORTED')}
            >
              <Inbox size={15} />
              {t('tabReceived')} <span className="tab-pill">{reportedCount}</span>
            </button>
            <button
              type="button"
              className={`status-tab ${statusFilter === 'IN_PROGRESS' ? 'active' : ''}`}
              onClick={() => setStatusFilter('IN_PROGRESS')}
            >
              <Clock3 size={15} />
              {t('tabInProgress')} <span className="tab-pill">{inProgressCount}</span>
            </button>
            <button
              type="button"
              className={`status-tab ${statusFilter === 'RESOLVED' ? 'active' : ''}`}
              onClick={() => setStatusFilter('RESOLVED')}
            >
              <CheckCircle2 size={15} />
              {t('tabResolved')} <span className="tab-pill">{resolvedCount}</span>
            </button>
          </div>

          <div className="admin-filter-controls">
            <div className="search-box">
              <Search size={16} className="search-icon" />
              <input
                type="text"
                placeholder={t('searchPlaceholder')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

            <select
              className="admin-select"
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
            >
              <option value="ALL">{t('allCategories')}</option>
              {categories.map(c => (
                <option key={c} value={c}>{t(c)}</option>
              ))}
            </select>

            <select
              className="admin-select"
              value={priorityFilter}
              onChange={e => setPriorityFilter(e.target.value)}
            >
              <option value="ALL">{t('allPriorities')}</option>
              {priorities.map(p => (
                <option key={p} value={p}>{t(p)}</option>
              ))}
            </select>

            <button
              type="button"
              className="button secondary icon-btn"
              title={t('refresh')}
              onClick={() => void fetchIncidents()}
              disabled={busy}
            >
              <RefreshCw size={16} className={busy ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {error && (
          <p className="notice" role="alert">
            {t(['staffForbidden', 'staleIncident'].includes(error) ? error : 'staffFailed')}
          </p>
        )}

        {/* Dual Pane Layout */}
        <div className="admin-split-layout">
          {/* Incident Queue List */}
          <div className="admin-queue-list-pane">
            {busy && !incidents.length && (
              <div className="admin-loading-row">
                <div className="spinner"></div>
                <span>{t('loading')}</span>
              </div>
            )}

            {!busy && !filteredIncidents.length && (
              <div className="admin-empty-queue">
                <Inbox size={42} strokeWidth={1.2} />
                <p>{t('noFilteredIncidents')}</p>
              </div>
            )}

            <ul className="admin-incident-items">
              {filteredIncidents.map(incident => {
                const report = incident.reports[0]
                const Icon = incident.status === 'RESOLVED' ? CheckCircle2 : incident.status === 'IN_PROGRESS' ? Clock3 : Inbox
                const isHigh = incident.priority === 'HIGH'
                const isSelected = selected?.id === incident.id

                return (
                  <li key={incident.id}>
                    <button
                      type="button"
                      className={`admin-incident-card priority-border-${incident.priority.toLowerCase()} ${isSelected ? 'selected' : ''}`}
                      onClick={() => void open(incident.id)}
                    >
                      <div className="incident-card-top">
                        <span className={`status-pill status-${incident.status.toLowerCase()}`}>
                          <Icon size={14} />
                          {t(incident.status)}
                        </span>
                        <span className={`priority-tag tag-${incident.priority.toLowerCase()}`}>
                          {isHigh && <AlertTriangle size={12} />}
                          {t(incident.priority)}
                        </span>
                        {report?.photoMime && (
                          <span className="photo-indicator" title="Has attached photo">
                            <Camera size={13} />
                          </span>
                        )}
                        <span className="incident-date">
                          {new Date(incident.createdAt).toLocaleDateString(i18n.language, { month: 'short', day: 'numeric' })}
                        </span>
                      </div>

                      <h3 className="incident-card-title">
                        {report?.title ?? t(incident.category)}
                      </h3>

                      {report?.location && (
                        <div className="incident-card-loc">
                          <MapPin size={13} />
                          <span>{report.location}</span>
                        </div>
                      )}
                    </button>
                  </li>
                )
              })}
            </ul>

            {more && (
              <button
                className="button secondary spaced load-more-btn"
                disabled={busy}
                onClick={() => void loadMore()}
              >
                {t('loadMore')}
              </button>
            )}
          </div>

          {/* Incident Inspection Pane */}
          <div className="admin-detail-pane">
            {selected ? (
              <IncidentDetail
                key={selected.id + selected.status}
                incident={selected}
                user={user}
                onUpdate={update}
              />
            ) : (
              <div className="admin-detail-empty">
                <Eye size={48} strokeWidth={1.2} />
                <p>Select an incident from the queue to review and manage.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

function IncidentDetail({
  incident,
  user,
  onUpdate
}: {
  incident: Incident
  user: User
  onUpdate: (incident: Incident) => void
}) {
  const { t, i18n } = useTranslation()
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const next = incident.status === 'REPORTED' ? 'IN_PROGRESS' : 'RESOLVED'

  async function advance() {
    if (next === 'RESOLVED' && !note.trim()) {
      setError('resolutionRequired')
      return
    }
    setError('')
    setBusy(true)
    try {
      const response = await request(user, 'incidents/' + incident.id + '/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next, expectedStatus: incident.status, resolutionNote: note }),
      })
      onUpdate(await response.json())
    } catch (err) {
      setError(err instanceof Error && err.message === 'staleIncident' ? 'staleIncident' : 'staffFailed')
    } finally {
      setBusy(false)
    }
  }

  const primaryReport = incident.reports[0]

  return (
    <article className="incident-detail-workspace">
      {/* Workspace Header */}
      <div className="workspace-header">
        <div>
          <div className="workspace-badges">
            <span className={`status-pill status-${incident.status.toLowerCase()}`}>
              {t(incident.status)}
            </span>
            <span className={`priority-tag tag-${incident.priority.toLowerCase()}`}>
              {t(incident.priority)}
            </span>
            <span className="category-pill">{t(incident.category)}</span>
          </div>
          <h2>{primaryReport?.title ?? t(incident.category)}</h2>
        </div>
      </div>

      {/* Citizen Report Information Card */}
      {incident.reports.map(report => (
        <div key={report.id} className="citizen-report-box">
          <div className="citizen-report-header">
            <div className="loc-badge">
              <MapPin size={15} />
              <span>{report.location}</span>
            </div>
            <span className="report-time">
              {new Date(report.createdAt ?? incident.createdAt).toLocaleString(i18n.language)}
            </span>
          </div>
          <p className="citizen-report-desc">{report.description}</p>
          {report.photoMime && <PrivatePhoto user={user} reportId={report.id} />}
        </div>
      ))}

      {/* AI Triage & Case Review Component */}
      <CaseReview
        user={user}
        id={incident.id}
        status={incident.status}
        initialCategory={incident.category}
        initialPriority={incident.priority}
        request={request}
      />

      {/* Status Transition Action Bar */}
      <div className="status-action-box">
        <h3>Operational Action</h3>

        {incident.status === 'REPORTED' && (
          <div className="action-row">
            <p>This issue is currently in <strong>{t('REPORTED')}</strong> status awaiting response.</p>
            <button
              className="button primary advance-btn"
              disabled={busy}
              onClick={() => void advance()}
            >
              <Clock3 size={17} />
              {t('startWork')}
            </button>
          </div>
        )}

        {incident.status === 'IN_PROGRESS' && (
          <div className="action-resolution-container">
            <label>
              <strong>{t('resolutionNote')}</strong>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                maxLength={1500}
                rows={3}
                placeholder="Detail what actions were taken to fix this issue..."
              />
            </label>
            <button
              className="button primary resolve-btn spaced"
              disabled={busy}
              onClick={() => void advance()}
            >
              <CheckCircle2 size={17} />
              {t('resolveIssue')}
            </button>
          </div>
        )}

        {incident.status === 'RESOLVED' && (
          <div className="resolved-banner">
            <CheckCircle2 size={22} className="resolved-icon" />
            <div>
              <strong>{t('RESOLVED')}</strong>
              {incident.resolutionNote && <p>{incident.resolutionNote}</p>}
            </div>
          </div>
        )}

        {error && <p className="notice" role="alert">{t(error)}</p>}
      </div>
    </article>
  )
}

function PrivatePhoto({ user, reportId }: { user: User; reportId: string }) {
  const { t } = useTranslation()
  const [url, setUrl] = useState('')
  const [error, setError] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    let objectUrl: string | undefined
    request(user, 'reports/' + reportId + '/photo', { signal: controller.signal })
      .then(response => response.blob())
      .then(blob => {
        if (!controller.signal.aborted) {
          objectUrl = URL.createObjectURL(blob)
          setUrl(objectUrl)
        }
      })
      .catch(() => { if (!controller.signal.aborted) setError(true) })
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [user, reportId])

  return error ? (
    <p className="photo-unavailable-text">{t('photoUnavailable')}</p>
  ) : url ? (
    <div className="report-photo-wrapper">
      <img className="report-photo-img" src={url} alt={t('photo')} />
    </div>
  ) : (
    <p>{t('loading')}</p>
  )
}

function InternalDispatch({ user, onCreated }: { user: User; onCreated: () => void }) {
  const { t, i18n } = useTranslation()
  const [title, setTitle] = useState('')
  const [location, setLocation] = useState('')
  const [category, setCategory] = useState(categories[1])
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState('')
  const [error, setError] = useState('')

  async function submitDispatch(e: FormEvent) {
    e.preventDefault()
    if (!title.trim() || !location.trim() || !description.trim()) {
      setError('requiredFields')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const reference = 'CR-' + Array.from(crypto.getRandomValues(new Uint8Array(8)), byte => byte.toString(16).padStart(2, '0')).join('').toUpperCase()
      const token = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')

      const response = await fetch(apiUrl('/api/reports'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference,
          token,
          title: title.trim(),
          location: location.trim(),
          category,
          description: description.trim(),
          language: i18n.language === 'ta' ? 'ta' : 'en'
        }),
      })

      if (!response.ok) throw new Error('reportFailed')
      setSuccess('dispatchSuccess')
      setTimeout(() => {
        onCreated()
      }, 1200)
    } catch {
      setError('reportFailed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="admin-dispatch-card">
      <div className="dispatch-header">
        <PlusCircle size={24} />
        <div>
          <h2>{t('tabDispatch')}</h2>
          <p>{t('dispatchDesc')}</p>
        </div>
      </div>

      {success && <p className="notice success-notice">{t(success)}</p>}
      {error && <p className="notice" role="alert">{t(error)}</p>}

      <form onSubmit={submitDispatch} className="dispatch-form">
        <div className="fields">
          <label>
            {t('title')} *
            <input
              type="text"
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Major water leak on Cross Cut Road"
            />
          </label>

          <label>
            {t('location')} *
            <input
              type="text"
              required
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="e.g. Near Bus Stand, Ward 12"
            />
          </label>
        </div>

        <div className="fields">
          <label>
            {t('category')}
            <select value={category} onChange={e => setCategory(e.target.value)}>
              {categories.map(c => (
                <option key={c} value={c}>{t(c)}</option>
              ))}
            </select>
          </label>
        </div>

        <label>
          {t('description')} *
          <textarea
            required
            rows={4}
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Detailed description of the issue observed..."
          />
        </label>

        <div className="dispatch-actions">
          <button type="submit" className="button primary" disabled={submitting}>
            {t(submitting ? 'sending' : 'submitReport')}
          </button>
        </div>
      </form>
    </section>
  )
}
