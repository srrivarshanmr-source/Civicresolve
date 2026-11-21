import { z } from 'zod'
import { bearerToken, incidentScope, matchesTrackingToken } from './access.js'

const assignmentSchema = z.object({
  departmentId: z.string().uuid(),
  expectedVersion: z.number().int().min(0).max(2147483646),
  responseDueAt: z.string().datetime({ offset: true }),
})
const responseSchema = z.object({
  version: z.number().int().positive().max(2147483647),
  nextAction: z.string().trim().min(1).max(1500),
})

const appealSchema = z.object({ reason: z.string().trim().min(1).max(1500) })
const emailAddress = z.string().email()

const queuedEmail = 'ACCOUNTABILITY_EMAIL'
const legacyEscalationId = assignmentId => 'accountability-escalation-' + assignmentId
const deadlineEscalationId = assignmentId => 'accountability-deadline-' + assignmentId
const appealEscalationId = assignmentId => 'accountability-appeal-' + assignmentId

function findEscalations(tx, assignmentId) {
  return tx.auditEvent.findMany({
    where: { id: { in: [legacyEscalationId(assignmentId), deadlineEscalationId(assignmentId), appealEscalationId(assignmentId)] } },
    select: { id: true, kind: true },
  })
}
const active = { endedAt: null }
const overdue = now => ({ ...active, respondedAt: null, responseDueAt: { lte: now } })

async function lockIncident(tx, id) {
  await tx.$queryRaw`SELECT "id" FROM "Incident" WHERE "id" = ${id} FOR UPDATE`
}

function audit(tx, incidentId, actorUid, kind, details, id) {
  return tx.auditEvent.create({ data: { id, incidentId, actorUid, kind, details } })
}

function queueEmail(tx, assignment, to, subject, now, text = `Incident ${assignment.incidentId}, assignment ${assignment.version}. Response deadline: ${assignment.responseDueAt.toISOString()}.`) {
  return audit(tx, assignment.incidentId, null, queuedEmail, {
    to,
    subject,
    text,
    attempts: 0,
    availableAt: now.toISOString(),
    state: 'pending',
  })
}

function registerAppealRoute(app, db, json) {
  async function requireTrackingAccess(req, res, next) {
    const token = bearerToken(req)
    const reference = req.params.reference.toUpperCase()
    if (!token || !/^CR-[A-F0-9]{16}$/.test(reference)) return res.sendStatus(404)
    const report = await db.report.findUnique({
      where: { trackingReference: reference },
      select: { id: true, incidentId: true, trackingTokenHash: true },
    })
    if (!report || !matchesTrackingToken(token, report.trackingTokenHash)) return res.sendStatus(404)
    res.locals.appealReport = { id: report.id, incidentId: report.incidentId }
    next()
  }

  app.post('/api/tracking/:reference/appeal', requireTrackingAccess, json, async (req, res) => {
    const parsed = appealSchema.safeParse(req.body)
    if (!parsed.success) return res.sendStatus(400)
    const { id: reportId, incidentId } = res.locals.appealReport
    const result = await db.$transaction(async tx => {
      await lockIncident(tx, incidentId)
      const incident = await tx.incident.findUnique({
        where: { id: incidentId },
        select: {
          status: true,
          assignments: {
            where: active, orderBy: { version: 'desc' }, take: 1,
            include: { department: { select: { supervisorEmail: true } } },
          },
          events: {
            where: { kind: 'EVIDENCE_REVIEWED' },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1, select: { details: true },
          },
        },
      })
      if (!incident) return { code: 404 }
      const assignment = incident.assignments[0]
      if (incident.status !== 'RESOLVED' && incident.events[0]?.details?.status !== 'DISPUTED') {
        return { code: 409, error: 'APPEAL_NOT_ELIGIBLE' }
      }
      if (!assignment) return { code: 409, error: 'SUPERVISOR_UNAVAILABLE' }

      const escalations = await findEscalations(tx, assignment.id)
      const escalation = escalations.find(event => event.kind === 'CITIZEN_APPEAL_ESCALATED') ?? escalations[0]
      const id = escalation?.id ?? appealEscalationId(assignment.id)
      const details = { reportId, assignmentId: assignment.id, escalationId: id, reason: parsed.data.reason }
      const previous = await tx.auditEvent.findFirst({
        where: { incidentId, kind: 'CITIZEN_APPEALED', details: { equals: details } },
        select: { createdAt: true },
      })
      if (previous) return { code: 200, createdAt: previous.createdAt }

      if (!escalation) {
        const to = assignment.department.supervisorEmail.trim()
        if (!emailAddress.safeParse(to).success) return { code: 409, error: 'SUPERVISOR_UNAVAILABLE' }
        await audit(tx, incidentId, null, 'CITIZEN_APPEAL_ESCALATED', {
          assignmentId: assignment.id, version: assignment.version,
        }, id)
        await queueEmail(tx, assignment, to, 'CivicResolve citizen appeal', new Date(),
          `A citizen appealed incident ${incidentId}, assignment ${assignment.version}. Review the appeal in the incident record.`)
      }
      const event = await audit(tx, incidentId, null, 'CITIZEN_APPEALED', details)
      return { code: 201, createdAt: event.createdAt }
    })
    if (result.error) return res.status(result.code).json({ error: result.error })
    if (!result.createdAt) return res.sendStatus(result.code)
    res.status(result.code).json({ status: 'accepted', createdAt: result.createdAt })
  })
}

export function registerAccountabilityRoutes(app, db, staffOnly, json) {
  registerAppealRoute(app, db, json)
  const base = '/api/staff/incidents/:id/assignment'
  const scopedIncident = req => ({ id: req.params.id, ...incidentScope(req.staff) })

  app.get(base, staffOnly, async (req, res) => {
    const incident = await db.incident.findFirst({
      where: scopedIncident(req),
      select: { assignments: { where: active, orderBy: { version: 'desc' }, take: 1 } },
    })
    if (!incident) return res.sendStatus(404)
    res.json({ assignment: incident.assignments[0] ?? null })
  })

  app.post(base, staffOnly, json, async (req, res) => {
    if (req.staff.role !== 'ADMIN') return res.sendStatus(403)
    const parsed = assignmentSchema.safeParse(req.body)
    if (!parsed.success) return res.sendStatus(400)
    const { departmentId, expectedVersion } = parsed.data
    const responseDueAt = new Date(parsed.data.responseDueAt)
    const incidentId = req.params.id
    const result = await db.$transaction(async tx => {
      await lockIncident(tx, incidentId)
      const incident = await tx.incident.findUnique({ where: { id: incidentId }, select: { status: true } })
      if (!incident) return { code: 404 }
      const latest = await tx.assignment.findFirst({ where: { incidentId }, orderBy: { version: 'desc' } })
      if (latest?.version === expectedVersion + 1 && !latest.endedAt
        && latest.departmentId === departmentId && +latest.responseDueAt === +responseDueAt) {
        return { code: 200, assignment: latest }
      }
      if (incident.status === 'RESOLVED' || (latest?.version ?? 0) !== expectedVersion) return { code: 409 }
      const now = new Date()
      if (responseDueAt <= now) return { code: 400 }
      const department = await tx.department.findUnique({ where: { id: departmentId }, select: { headEmail: true } })
      if (!department) return { code: 404 }
      await tx.assignment.updateMany({ where: { incidentId, ...active }, data: { endedAt: now } })
      const assignment = await tx.assignment.create({
        data: { incidentId, departmentId, version: expectedVersion + 1, assignedAt: now, responseDueAt },
      })
      await audit(tx, incidentId, req.staff.uid, 'ASSIGNED', {
        assignmentId: assignment.id, departmentId, version: assignment.version, responseDueAt: responseDueAt.toISOString(),
      })
      await queueEmail(tx, assignment, department.headEmail, 'CivicResolve incident assignment', now)
      return { code: 201, assignment }
    })
    if (!result.assignment) return res.sendStatus(result.code)
    res.status(result.code).json({ assignment: result.assignment })
  })

  app.patch(base + '/response', staffOnly, json, async (req, res) => {
    const parsed = responseSchema.safeParse(req.body)
    if (!parsed.success) return res.sendStatus(400)
    const { version, nextAction } = parsed.data
    const where = scopedIncident(req)
    const result = await db.$transaction(async tx => {
      await lockIncident(tx, where.id)
      const incident = await tx.incident.findFirst({ where, select: { status: true } })
      if (!incident) return { code: 404 }
      const current = await tx.assignment.findFirst({
        where: { incidentId: where.id, ...active }, orderBy: { version: 'desc' },
      })
      if (!current || current.version !== version) return { code: 409 }
      if (current.respondedAt) {
        return current.nextAction === nextAction ? { assignment: current } : { code: 409 }
      }
      if (incident.status === 'RESOLVED') return { code: 409 }
      const assignment = await tx.assignment.update({
        where: { id: current.id }, data: { respondedAt: new Date(), nextAction },
      })
      await audit(tx, where.id, req.staff.uid, 'ASSIGNMENT_RESPONDED', { assignmentId: assignment.id, version })
      return { assignment }
    })
    if (result.code) return res.sendStatus(result.code)
    res.json({ assignment: result.assignment })
  })
}

async function escalateOverdue(db, now, batchSize) {
  const candidates = await db.$queryRaw`
    SELECT a."id", a."incidentId"
    FROM "Assignment" a JOIN "Incident" i ON i."id" = a."incidentId"
    WHERE a."endedAt" IS NULL AND a."respondedAt" IS NULL
      AND a."responseDueAt" <= ${now} AND i."status" <> 'RESOLVED'
      AND NOT EXISTS (
        SELECT 1 FROM "AuditEvent" e
        WHERE e."kind" = 'ASSIGNMENT_ESCALATED'
          AND e."id" IN ('accountability-escalation-' || a."id", 'accountability-deadline-' || a."id")
      )
    ORDER BY a."responseDueAt", a."id"
    LIMIT ${batchSize}
  `
  let escalated = 0
  for (const candidate of candidates) {
    const created = await db.$transaction(async tx => {
      await lockIncident(tx, candidate.incidentId)
      const assignment = await tx.assignment.findFirst({
        where: { id: candidate.id, ...overdue(now), incident: { status: { not: 'RESOLVED' } } },
        include: { department: { select: { supervisorEmail: true } } },
      })
      if (!assignment) return false
      const escalations = await findEscalations(tx, assignment.id)
      if (escalations.some(event => event.kind === 'ASSIGNMENT_ESCALATED')) return false
      await audit(tx, assignment.incidentId, null, 'ASSIGNMENT_ESCALATED', {
        assignmentId: assignment.id, version: assignment.version,
      }, deadlineEscalationId(assignment.id))
      if (!escalations.some(event => event.kind === 'CITIZEN_APPEAL_ESCALATED')) {
        await queueEmail(tx, assignment, assignment.department.supervisorEmail, 'CivicResolve overdue assignment', now)
      }
      return true
    })
    if (created) escalated += 1
  }
  return escalated
}

const leaseMs = 120_000
const sendTimeoutMs = 30_000

async function deliverQueuedEmail(db, email, sendEmail, clock) {
  const pending = email.details
  const now = clock()
  if (pending.state !== 'pending' || pending.availableAt > now.toISOString()) return 'skipped'
  const claimed = {
    ...pending,
    attempts: pending.attempts + 1,
    availableAt: new Date(+now + leaseMs).toISOString(),
  }
  const acquired = await db.auditEvent.updateMany({
    where: { id: email.id, details: { equals: pending } }, data: { details: claimed },
  })
  if (!acquired.count) return 'skipped'

  const { to, subject, text } = claimed
  const controller = new AbortController()
  let timer
  let next
  let outcome
  try {
    await Promise.race([
      Promise.resolve().then(() => sendEmail({ to, subject, text, idempotencyKey: email.id, signal: controller.signal })),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort()
          reject(new Error('Email attempt timed out'))
        }, sendTimeoutMs)
      }),
    ])
    next = { ...claimed, state: 'sent', sentAt: clock().toISOString() }
    outcome = 'sent'
  } catch {
    const retryMs = Math.min(3_600_000, 30_000 * 2 ** Math.min(claimed.attempts - 1, 7))
    next = { ...claimed, availableAt: new Date(+clock() + retryMs).toISOString() }
    outcome = 'retried'
  } finally {
    clearTimeout(timer)
  }
  const recorded = await db.auditEvent.updateMany({
    where: { id: email.id, details: { equals: claimed } }, data: { details: next },
  })
  return recorded.count ? outcome : 'skipped'
}

// Supply a fake adapter in tests. With no adapter, the worker only queues escalations.
export async function runAccountabilityWorker({ db, sendEmail, clock = () => new Date(), batchSize = 25 }) {
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100) throw new RangeError('Invalid batch size')
  const now = clock()
  const counts = { escalated: await escalateOverdue(db, now, batchSize), sent: 0, retried: 0, skipped: 0 }
  if (!sendEmail) return counts
  const emails = await db.$queryRaw`
    SELECT "id", "details" FROM "AuditEvent"
    WHERE "kind" = ${queuedEmail} AND "details"->>'state' = 'pending'
      AND "details"->>'availableAt' <= ${now.toISOString()}
    ORDER BY "details"->>'availableAt', "id"
    LIMIT ${batchSize}
  `
  for (const email of emails) {
    const outcome = await deliverQueuedEmail(db, email, sendEmail, clock)
    counts[outcome] += 1
  }
  return counts
}

// Start once per process. Each tick waits for the previous tick to finish.
export function startAccountabilityWorker({ intervalMs = 30_000, onError = console.error, ...options }) {
  let stopped = false
  let timer
  const tick = async () => {
    try {
      await runAccountabilityWorker(options)
    } catch (error) {
      onError(error)
    } finally {
      if (!stopped) timer = setTimeout(tick, intervalMs)
    }
  }
  void tick()
  return () => {
    stopped = true
    clearTimeout(timer)
  }
}
