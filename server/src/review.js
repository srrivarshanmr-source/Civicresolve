import { z } from 'zod'
import { incidentScope } from './access.js'

const reviewSchema = z.object({
  status: z.enum(['UNVERIFIED', 'CORROBORATED', 'FIELD_VERIFIED', 'DISPUTED', 'UNABLE_TO_VERIFY']),
  photoOrigin: z.enum(['ORIGIN_UNCONFIRMED', 'AI_INDICATED', 'CAPTURE_CREDENTIALS']),
  reason: z.string().trim().min(1).max(800),
})
const routing = {
  ROAD_DAMAGE: 'ROADS', WATER_LEAKAGE: 'WATER', WASTE: 'WASTE', STREETLIGHTING: 'LIGHTS',
}

export function recommendDepartment(category) {
  return routing[category] ?? null
}

export function registerReviewRoutes(app, db, staffOnly, json) {
  app.get('/api/staff/departments', staffOnly, async (req, res) => {
    if (req.staff.role !== 'ADMIN') return res.sendStatus(403)
    res.json(await db.department.findMany({
      orderBy: [{ jurisdiction: 'asc' }, { code: 'asc' }],
      select: { id: true, jurisdiction: true, code: true },
    }))
  })

  app.get('/api/staff/incidents/:id/follow-up', staffOnly, async (req, res) => {
    const incident = await db.incident.findFirst({
      where: { id: req.params.id, ...incidentScope(req.staff) },
      select: { events: {
        where: { kind: { in: ['ACCOUNTABILITY_EMAIL', 'ASSIGNMENT_ESCALATED', 'CITIZEN_APPEALED'] } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50,
        select: { kind: true, createdAt: true, details: true },
      } },
    })
    if (!incident) return res.sendStatus(404)
    res.json(incident.events.map(event => ({
      kind: event.kind, createdAt: event.createdAt,
      ...(event.kind === 'ACCOUNTABILITY_EMAIL' ? { state: event.details.state } : {}),
      ...(event.kind === 'CITIZEN_APPEALED' ? { reason: event.details.reason } : {}),
    })))
  })

  const classification = z.object({
    category: z.enum(['UNSURE', 'ROAD_DAMAGE', 'WATER_LEAKAGE', 'WASTE', 'STREETLIGHTING']),
    priority: z.enum(['LOW', 'STANDARD', 'HIGH']),
  })
  app.patch('/api/staff/incidents/:id/classification', staffOnly, json, async (req, res) => {
    const parsed = classification.safeParse(req.body)
    if (!parsed.success) return res.sendStatus(400)
    const updated = await db.$transaction(async tx => {
      const result = await tx.incident.updateMany({
        where: { id: req.params.id, ...incidentScope(req.staff), status: { not: 'RESOLVED' } },
        data: parsed.data,
      })
      if (!result.count) return false
      await tx.auditEvent.create({ data: {
        incidentId: req.params.id, actorUid: req.staff.uid, kind: 'CLASSIFICATION_CONFIRMED', details: parsed.data,
      } })
      return true
    })
    if (!updated) return res.sendStatus(404)
    res.json(parsed.data)
  })

  const path = '/api/staff/incidents/:id/evidence'
  const where = req => ({ id: req.params.id, ...incidentScope(req.staff) })
  app.get(path, staffOnly, async (req, res) => {
    const incident = await db.incident.findFirst({
      where: where(req),
      select: { events: { where: { kind: 'EVIDENCE_REVIEWED' }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1, select: { details: true } } },
    })
    if (!incident) return res.sendStatus(404)
    res.json(incident.events[0]?.details ?? null)
  })
  app.post(path, staffOnly, json, async (req, res) => {
    const parsed = reviewSchema.safeParse(req.body)
    if (!parsed.success) return res.sendStatus(400)
    const review = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Incident" WHERE "id" = ${req.params.id} FOR UPDATE`
      const incident = await tx.incident.findFirst({ where: where(req), select: { id: true } })
      if (!incident) return null
      await tx.auditEvent.create({
        data: { incidentId: incident.id, actorUid: req.staff.uid, kind: 'EVIDENCE_REVIEWED', details: parsed.data },
      })
      return parsed.data
    })
    if (!review) return res.sendStatus(404)
    res.status(201).json(review)
  })
}

export function createResendSender(apiKey, from, siteUrl, request = fetch) {
  if (!apiKey || !from) return undefined
  return async ({ to, subject, text, idempotencyKey, signal }) => {
    const response = await request('https://api.resend.com/emails', {
      method: 'POST', signal,
      headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ from, to: [to], subject, text: siteUrl ? text + '\n\nStaff workspace: ' + new URL('/staff', siteUrl) : text }),
    })
    if (!response.ok) throw new Error('Email service returned HTTP ' + response.status)
  }
}
