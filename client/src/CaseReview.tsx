import { useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import { useTranslation } from 'react-i18next'

type Request = (user: User, path: string, options?: RequestInit) => Promise<Response>
type Department = { id: string; jurisdiction: string; code: string }
type Assignment = { departmentId: string; version: number; responseDueAt: string; respondedAt: string | null; nextAction: string | null }
type Triage = { category: string; priority: string; recommendedDepartment: string | null; summary: string; rationale: string; evidence: { consistency: string; observations: string } | null }
type FollowUp = { kind: string; createdAt: string; state?: string; reason?: string }
type Evidence = { status: string; photoOrigin: string; reason: string }
const categories = ['UNSURE', 'ROAD_DAMAGE', 'WATER_LEAKAGE', 'WASTE', 'STREETLIGHTING']
const priorities = ['LOW', 'STANDARD', 'HIGH']
const evidenceStatuses = ['UNVERIFIED', 'CORROBORATED', 'FIELD_VERIFIED', 'DISPUTED', 'UNABLE_TO_VERIFY']
const photoStatuses = ['ORIGIN_UNCONFIRMED', 'AI_INDICATED', 'CAPTURE_CREDENTIALS']

const formatDepartment = (department: Department, label: string) => department.jurisdiction + ' · ' + label

export default function CaseReview({ user, id, status, initialCategory, initialPriority, request }: { user: User; id: string; status: string; initialCategory: string; initialPriority: string; request: Request }) {
  const { t, i18n } = useTranslation()
  const base = 'incidents/' + id + '/'
  const [triage, setTriage] = useState<Triage | null>(null)
  const [assignment, setAssignment] = useState<Assignment | null>(null)
  const [evidence, setEvidence] = useState<Evidence>({ status: 'UNVERIFIED', photoOrigin: 'ORIGIN_UNCONFIRMED', reason: '' })
  const [followUp, setFollowUp] = useState<FollowUp[]>([])
  const [departments, setDepartments] = useState<Department[] | null>(null)
  const [departmentId, setDepartment] = useState('')
  const [deadline, setDeadline] = useState('')
  const [category, setCategory] = useState(initialCategory)
  const [priority, setPriority] = useState(initialPriority)
  const [nextAction, setNextAction] = useState('')
  const [busy, setBusy] = useState(true)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    const controller = new AbortController()
    const options = { signal: controller.signal }
    Promise.all([
      request(user, base + 'triage', options).then(response => response.json()),
      request(user, base + 'assignment', options).then(response => response.json()),
      request(user, base + 'evidence', options).then(response => response.json()),
      request(user, 'session', options).then(response => response.json()),
      request(user, base + 'follow-up', options).then(response => response.json()),
    ]).then(async ([triageResult, assignmentResult, savedEvidence, session, events]) => {
      setFollowUp(events)
      setTriage(triageResult.triage)
      setAssignment(assignmentResult.assignment)
      setDepartment(assignmentResult.assignment?.departmentId ?? '')
      if (savedEvidence) setEvidence(savedEvidence)
      if (session.role === 'ADMIN') {
        const items = await (await request(user, 'departments', options)).json()
        setDepartments(items)
      }
    }).catch(() => { if (!controller.signal.aborted) setError('staffFailed') })
      .finally(() => { if (!controller.signal.aborted) setBusy(false) })
    return () => controller.abort()
  }, [base, request, user])

  async function save(path: string, payload: object, onSuccess: (data: any) => void, method = 'POST') {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const response = await request(user, base + path, {
        method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      onSuccess(await response.json())
      setMessage('changesSaved')
      if (path.startsWith('assignment')) {
        void request(user, base + 'follow-up').then(response => response.json()).then(setFollowUp).catch(() => {})
      }
    } catch (failure) {
      setError(path === 'triage' ? 'triageUnavailable' : failure instanceof Error && failure.message === 'staleIncident' ? 'staleIncident' : 'staffFailed')
    } finally { setBusy(false) }
  }

  const suggested = triage?.recommendedDepartment
  const activeDepartment = departments?.find(item => item.id === assignment?.departmentId)
  const date = (value: string) => new Date(value).toLocaleString(i18n.language)
  return <section className="case-review" aria-busy={busy}>

    {error && <p className="notice" role="alert">{t(error)}</p>}
    {message && <p role="status">{t(message)}</p>}
    <fieldset disabled={busy} className="review-fields">
      <legend>{t('aiTriage')}</legend>
      <button type="button" className="button secondary" onClick={() => void save('triage', {}, data => setTriage(data.triage))}>{t('analyzeIssue')}</button>
      {triage && <div className="notice">
        <strong>{t(triage.category)} · {t(triage.priority)}</strong>
        {suggested && <p>{t('departmentSuggestion')} · {t(suggested)}</p>}
        <p lang="en">{triage.summary}</p><p lang="en">{triage.rationale}</p>
        {triage.evidence && <p><strong>{t(triage.evidence.consistency)}</strong> <span lang="en">{triage.evidence.observations}</span></p>}
      </div>}
      {status !== 'RESOLVED' && <>
        <div className="fields spaced">
          <label>{t('category')}<select value={category} onChange={event => setCategory(event.target.value)}>{categories.map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label>
          <label>{t('priorityLabel')}<select value={priority} onChange={event => setPriority(event.target.value)}>{priorities.map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label>
        </div>
        <div className="actions">
          {triage && <button type="button" className="button secondary" onClick={() => {
            setCategory(triage.category)
            setPriority(triage.priority)
            const matching = departments?.filter(item => item.code === suggested)
            if (matching?.length === 1) setDepartment(matching[0].id)
          }}>{t('useRecommendation')}</button>}
          <button type="button" className="button secondary" onClick={() => void save('classification', { category, priority }, data => { setCategory(data.category); setPriority(data.priority) }, 'PATCH')}>{t('confirmClassification')}</button>
        </div>
      </>}
    </fieldset>
    <fieldset disabled={busy} className="review-fields">
      <legend>{t('evidenceReview')}</legend>
      <p>{t('evidenceHelp')}</p>
      <div className="fields">
        <label>{t('evidenceStatus')}<select value={evidence.status} onChange={event => setEvidence({ ...evidence, status: event.target.value })}>{evidenceStatuses.map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label>
        <label>{t('photoOrigin')}<select value={evidence.photoOrigin} onChange={event => setEvidence({ ...evidence, photoOrigin: event.target.value })}>{photoStatuses.map(value => <option key={value} value={value}>{t(value)}</option>)}</select></label>
        <label className="wide">{t('reviewReason')}<textarea rows={2} maxLength={800} value={evidence.reason} onChange={event => setEvidence({ ...evidence, reason: event.target.value })}/></label>
      </div>
      <button className="button secondary spaced" type="button" disabled={!evidence.reason.trim()} onClick={() => void save('evidence', evidence, setEvidence)}>{t('saveReview')}</button>
    </fieldset>
    <fieldset disabled={busy} className="review-fields">
      <legend>{t('assignment')}</legend>
      {!!followUp.length && <ul className="tracking-timeline">{followUp.map((event, index) => <li key={event.createdAt + index}>
        {t(event.kind)} · {date(event.createdAt)}
        {event.state && <> · {t('mail_' + event.state)}</>}
        {event.reason && <p>{event.reason}</p>}
      </li>)}</ul>}
      {assignment ? <p>{activeDepartment && <>{formatDepartment(activeDepartment, t(activeDepartment.code))}<br/></>}{t('responseDue')} · {date(assignment.responseDueAt)}
        {assignment.nextAction && <><br/>{t('nextAction')} · {assignment.nextAction}</>}</p> : <p>{t('unassigned')}</p>}
      {departments && status !== 'RESOLVED' && <>
        <div className="fields">
          <label>{t('department')}<select value={departmentId} onChange={event => setDepartment(event.target.value)}>
            <option value="">{t('chooseDepartment')}</option>
            {departments.map(item => <option value={item.id} key={item.id}>{formatDepartment(item, t(item.code))}</option>)}
          </select></label>
          <label>{t('responseDue')}<input type="datetime-local" value={deadline} onChange={event => setDeadline(event.target.value)}/></label>
        </div>
        {!departments.length && <p>{t('noDepartments')}</p>}
        <button className="button secondary spaced" type="button" disabled={!departmentId || !deadline} onClick={() => {
          const date = new Date(deadline)
          if (!Number.isFinite(+date) || date <= new Date()) { setError('deadlineFuture'); return }
          void save('assignment', { departmentId, expectedVersion: assignment?.version ?? 0, responseDueAt: date.toISOString() }, data => setAssignment(data.assignment))
        }}>{t('assignAndNotify')}</button>
      </>}
      {assignment && !assignment.respondedAt && status !== 'RESOLVED' && <>
        <label className="spaced">{t('nextAction')}<textarea rows={2} maxLength={1500} value={nextAction} onChange={event => setNextAction(event.target.value)}/></label>
        <button className="button secondary spaced" type="button" disabled={!nextAction.trim()} onClick={() => void save('assignment/response', { version: assignment.version, nextAction }, data => setAssignment(data.assignment), 'PATCH')}>{t('acknowledge')}</button>
      </>}
    </fieldset>
  </section>
}
