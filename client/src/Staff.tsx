import { useEffect, useState } from 'react'
import { initializeApp } from 'firebase/app'
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import type { User } from 'firebase/auth'
import { useTranslation } from 'react-i18next'
import CaseReview from './CaseReview'
import { apiUrl } from './api'

const { VITE_FIREBASE_API_KEY: apiKey, VITE_FIREBASE_AUTH_DOMAIN: authDomain, VITE_FIREBASE_PROJECT_ID: projectId } = import.meta.env
const auth = apiKey && authDomain && projectId ? getAuth(initializeApp({ apiKey, authDomain, projectId })) : null

type Status = 'REPORTED' | 'IN_PROGRESS' | 'RESOLVED'
type Report = { id: string; title: string; description: string; location: string; photoMime: string | null }
type Incident = { id: string; status: Status; category: string; priority: string; resolutionNote: string | null; createdAt: string; reports: Report[] }

async function request(user: User, path: string, options?: RequestInit) {
  const headers = new Headers(options?.headers)
  headers.set('Authorization', 'Bearer ' + await user.getIdToken())
  const response = await fetch(apiUrl('/api/staff/' + path), { ...options, headers })
  if (!response.ok) throw new Error(response.status === 403 ? 'staffForbidden' : response.status === 409 ? 'staleIncident' : 'staffFailed')
  return response
}

export default function Staff() {
  const { t, i18n } = useTranslation()
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(Boolean(auth))
  const [error, setError] = useState('')
  const [signing, setSigning] = useState(false)

  useEffect(() => {
    if (!auth) return
    auth.languageCode = i18n.language
  }, [i18n.language])

  useEffect(() => {
    if (!auth) return
    return onAuthStateChanged(auth, current => { setUser(current); setAuthLoading(false) })
  }, [])

  async function signIn() {
    if (!auth) return
    setSigning(true)
    setError('')
    try { await signInWithPopup(auth, new GoogleAuthProvider()) }
    catch { setError('signInFailed') }
    finally { setSigning(false) }
  }

  return <section className="panel staff-panel">
    <h1>{t('staff')}</h1>
    {!auth && <p className="notice">{t('staffConfig')}</p>}
    {authLoading && <p role="status">{t('loading')}</p>}
    {auth && !authLoading && !user && <button className="button primary spaced" disabled={signing} onClick={() => void signIn()}>{t('signIn')}</button>}
    {user && auth && <>
      <button className="button secondary spaced" onClick={() => void signOut(auth).catch(() => setError('staffFailed'))}>{t('signOut')}</button>
      <Queue key={user.uid} user={user}/>
    </>}
    {error && <p className="notice" role="alert">{t(error)}</p>}
  </section>
}

function Queue({ user }: { user: User }) {
  const { t } = useTranslation()
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [selected, setSelected] = useState<Incident | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(true)
  const [more, setMore] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    request(user, 'incidents', { signal: controller.signal })
      .then(response => response.json())
      .then((items: Incident[]) => { setIncidents(items); setMore(items.length === 50) })
      .catch(error => { if (!controller.signal.aborted) setError(error.message) })
      .finally(() => { if (!controller.signal.aborted) setBusy(false) })
    return () => controller.abort()
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
    } catch (error) { setError(error instanceof Error ? error.message : 'staffFailed') }
    finally { setBusy(false) }
  }

  async function open(id: string) {
    setBusy(true)
    setError('')
    try { setSelected(await (await request(user, 'incidents/' + id)).json()) }
    catch (error) { setError(error instanceof Error ? error.message : 'staffFailed') }
    finally { setBusy(false) }
  }

  function update(incident: Incident) {
    setSelected(incident)
    setIncidents(previous => previous.map(item => item.id === incident.id ? { ...item, ...incident } : item))
  }

  return <>
    <h2>{t('incidentQueue')}</h2>
    {busy && <p role="status">{t('loading')}</p>}
    {error && <p className="notice" role="alert">{t(['staffForbidden', 'staleIncident'].includes(error) ? error : 'staffFailed')}</p>}
    {!busy && !error && !incidents.length && <p>{t('noIncidents')}</p>}
    <ul className="incident-list">{incidents.map(incident => <li key={incident.id}>
      <button className="incident-row" disabled={busy} onClick={() => void open(incident.id)}>
        <strong>{incident.reports[0]?.title ?? t(incident.category)}</strong><span>{t(incident.status)}</span>
      </button>
    </li>)}</ul>
    {more && <button className="button secondary" disabled={busy} onClick={() => void loadMore()}>{t('loadMore')}</button>}
    {selected && <IncidentDetail key={selected.id + selected.status} incident={selected} user={user} onUpdate={update}/>}
  </>
}

function IncidentDetail({ incident, user, onUpdate }: { incident: Incident; user: User; onUpdate: (incident: Incident) => void }) {
  const { t } = useTranslation()
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const next = incident.status === 'REPORTED' ? 'IN_PROGRESS' : 'RESOLVED'

  async function advance() {
    if (next === 'RESOLVED' && !note.trim()) { setError('resolutionRequired'); return }
    setError('')
    setBusy(true)
    try {
      const response = await request(user, 'incidents/' + incident.id + '/status', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: next, expectedStatus: incident.status, resolutionNote: note }),
      })
      onUpdate(await response.json())
    } catch (error) { setError(error instanceof Error && error.message === 'staleIncident' ? 'staleIncident' : 'staffFailed') }
    finally { setBusy(false) }
  }

  return <article className="incident-detail">
    <h2>{t('incidentDetails')}</h2>
    <p>{t(incident.category)} · {t(incident.status)}</p>
    {incident.reports.map(report => <div key={report.id} className="notice">
      <h3>{report.title}</h3><p>{report.description}</p><p>{t('location')} · {report.location}</p>
      {report.photoMime && <PrivatePhoto user={user} reportId={report.id}/>}
    </div>)}
    <CaseReview user={user} id={incident.id} status={incident.status} initialCategory={incident.category} initialPriority={incident.priority} request={request}/>
    {incident.status === 'IN_PROGRESS' && <label>{t('resolutionNote')}<textarea value={note} onChange={event => setNote(event.target.value)} maxLength={1500} rows={3}/></label>}
    {incident.resolutionNote && <p>{incident.resolutionNote}</p>}
    {error && <p className="notice" role="alert">{t(error)}</p>}
    {incident.status !== 'RESOLVED' && <button className="button primary spaced" disabled={busy} onClick={() => void advance()}>{t(next === 'RESOLVED' ? 'resolveIssue' : 'startWork')}</button>}
  </article>
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
  return error ? <p>{t('photoUnavailable')}</p> : url ? <img className="report-photo" src={url} alt={t('photo')}/> : <p>{t('loading')}</p>
}
