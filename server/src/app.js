import express from 'express'
import { registerAccountabilityRoutes } from './accountability.js'
import { registerTriageRoutes } from './triage.js'
import { registerTransparencyRoutes } from './transparency.js'
import { registerReviewRoutes } from './review.js'
import { registerVoiceRoute } from './speech.js'
import { incidentFields, registerComplaintRoutes } from './complaints.js'
import { bearerToken, incidentScope, matchesTrackingToken } from './access.js'

function requireStaff(db, verifyIdentity) {
  return async (req, res, next) => {
    const token = bearerToken(req)
    if (!token) return res.sendStatus(401)
    let identity
    try {
      identity = await verifyIdentity(token)
    } catch {
      return res.sendStatus(401)
    }
    const staff = await db.staff.findUnique({
      where: { uid: identity.uid },
      include: { scopes: { select: { departmentId: true } } },
    })
    if (!staff) return res.sendStatus(403)
    req.staff = staff
    next()
  }
}

export function createApp({ db, verifyIdentity, transcribe, analyze }) {
  const app = express()
  app.disable('x-powered-by')
  const staffOnly = requireStaff(db, verifyIdentity)

  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store')
    res.set('Access-Control-Allow-Origin', '*')
    res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
    res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
    if (req.method === 'OPTIONS') return res.sendStatus(204)
    next()
  })
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }))

  app.get('/api/tracking/:reference', async (req, res) => {
    const token = bearerToken(req)
    const reference = req.params.reference.toUpperCase()
    if (!token || !/^CR-[A-F0-9]{16}$/.test(reference)) return res.sendStatus(404)
    const report = await db.report.findUnique({
      where: { trackingReference: reference },
      select: {
        trackingReference: true, trackingTokenHash: true, title: true, createdAt: true,
        incident: { select: {
          status: true, category: true, resolutionNote: true, updatedAt: true,
          assignments: { where: { endedAt: null }, take: 1, select: {
            responseDueAt: true, respondedAt: true, department: { select: { code: true, jurisdiction: true } },
          } },
          events: {
            where: { kind: { in: ['ASSIGNED', 'ASSIGNMENT_RESPONDED', 'ASSIGNMENT_ESCALATED', 'STATUS_CHANGED', 'EVIDENCE_REVIEWED', 'CITIZEN_APPEALED'] } },
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 30,
            select: { kind: true, createdAt: true, details: true },
          },
        } },
      },
    })
    if (!report || !matchesTrackingToken(token, report.trackingTokenHash)) return res.sendStatus(404)
    const { trackingTokenHash, ...summary } = report
    const { events = [], assignments = [], ...incident } = summary.incident
    const evidence = events.find(event => event.kind === 'EVIDENCE_REVIEWED')?.details ?? null
    res.json({ ...summary, incident: {
      ...incident, assignment: assignments[0] ?? null, evidence: evidence ? { status: evidence.status } : null,
      timeline: events.map(({ kind, createdAt }) => ({ kind, createdAt })),
    } })
  })

  registerVoiceRoute(app, transcribe, express.raw)
  const json = express.json({ limit: '16kb' })
  registerComplaintRoutes(app, db, staffOnly, express.json({ limit: '3mb' }), analyze)
  registerTriageRoutes(app, db, staffOnly, json, analyze)
  registerAccountabilityRoutes(app, db, staffOnly, json)
  registerTransparencyRoutes(app, db)
  registerReviewRoutes(app, db, staffOnly, json)

  app.get('/api/staff/session', staffOnly, (req, res) => {
    res.json(req.staff)
  })
  app.get('/api/staff/incidents/:id', staffOnly, async (req, res) => {
    const incident = await db.incident.findFirst({
      where: { id: req.params.id, ...incidentScope(req.staff) },
      select: incidentFields,
    })
    if (!incident) return res.sendStatus(404)
    res.json(incident)
  })
  app.use((error, _req, res, _next) => {
    if (error.type === 'entity.parse.failed') return res.sendStatus(400)
    if (error.type === 'entity.too.large') return res.sendStatus(413)
    if (error.type === 'encoding.unsupported') return res.sendStatus(415)
    console.error('API request failed', error.code ?? error.name)
    res.sendStatus(500)
  })
  return app
}
