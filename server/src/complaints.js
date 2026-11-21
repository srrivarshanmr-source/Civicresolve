import { z } from 'zod'
import { incidentScope, matchesTrackingToken, trackingTokenHash } from './access.js'

const statuses = ['REPORTED', 'IN_PROGRESS', 'RESOLVED']
const categories = ['UNSURE', 'ROAD_DAMAGE', 'WATER_LEAKAGE', 'WASTE', 'STREETLIGHTING']
const maxPhoto = 2 * 1024 * 1024
const reportSchema = z.object({
  reference: z.string().regex(/^CR-[A-F0-9]{16}$/),
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(3000),
  location: z.string().trim().min(1).max(250),
  category: z.enum(categories),
  language: z.enum(['en', 'ta', 'hi']),
  photo: z.string().max(Math.ceil(maxPhoto / 3) * 4).regex(/^[A-Za-z0-9+/]+={0,2}$/).optional(),
})
const statusSchema = z.object({
  status: z.enum(statuses),
  expectedStatus: z.enum(statuses),
  resolutionNote: z.string().trim().max(1500).optional(),
})
const reportFields = {
  id: true, title: true, description: true, location: true, language: true, createdAt: true, photoMime: true,
}
export const incidentFields = {
  id: true, category: true, status: true, priority: true, updatedAt: true, resolutionNote: true,
  reports: { orderBy: { createdAt: 'asc' }, select: reportFields },
}

function identifyPhoto(bytes) {
  if (bytes.length < 12 || bytes.length > maxPhoto) return null
  if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return 'image/jpeg'
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png'
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return null
}

export function registerComplaintRoutes(app, db, staffOnly, json) {
  app.post('/api/reports', json, async (req, res) => {
    const parsed = reportSchema.safeParse(req.body)
    if (!parsed.success) return res.sendStatus(400)
    const { reference, token, photo, title, description, location, category, language } = parsed.data
    const photoData = photo ? Buffer.from(photo, 'base64') : undefined
    const photoMime = photoData ? identifyPhoto(photoData) : null
    if (photoData && !photoMime) return res.sendStatus(415)
    try {
      await db.incident.create({
        data: {
          category,
          reports: { create: { trackingReference: reference, trackingTokenHash: trackingTokenHash(token), title, description, location, category, language, photoData, photoMime } },
          events: { create: { kind: 'REPORTED', details: {} } },
        },
        select: { id: true },
      })
    } catch (error) {
      if (error.code !== 'P2002') throw error
      const prior = await db.report.findUnique({
        where: { trackingReference: reference }, select: { trackingTokenHash: true },
      })
      if (!prior || !matchesTrackingToken(token, prior.trackingTokenHash)) return res.sendStatus(409)
      return res.json({ reference })
    }
    res.status(201).json({ reference })
  })

  app.get('/api/staff/incidents', staffOnly, async (req, res) => {
    const before = z.string().datetime().safeParse(req.query.before)
    const beforeId = z.string().uuid().safeParse(req.query.beforeId)
    const hasCursor = req.query.before !== undefined || req.query.beforeId !== undefined
    if (hasCursor && (!before.success || !beforeId.success)) return res.sendStatus(400)
    const cursor = before.success && beforeId.success ? {
      OR: [
        { createdAt: { lt: new Date(before.data) } },
        { createdAt: new Date(before.data), id: { lt: beforeId.data } },
      ],
    } : {}
    const incidents = await db.incident.findMany({
      where: { ...incidentScope(req.staff), ...cursor },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 50,
      select: { ...incidentFields, createdAt: true, reports: { ...incidentFields.reports, take: 1 } },
    })
    res.json(incidents)
  })

  app.get('/api/staff/reports/:id/photo', staffOnly, async (req, res) => {
    const report = await db.report.findFirst({
      where: { id: req.params.id, incident: incidentScope(req.staff) },
      select: { photoData: true, photoMime: true },
    })
    if (!report?.photoData || !report.photoMime) return res.sendStatus(404)
    res.set('X-Content-Type-Options', 'nosniff')
    res.type(report.photoMime).send(Buffer.from(report.photoData))
  })

  app.patch('/api/staff/incidents/:id/status', staffOnly, json, async (req, res) => {
    const parsed = statusSchema.safeParse(req.body)
    if (!parsed.success) return res.sendStatus(400)
    const { status, expectedStatus, resolutionNote } = parsed.data
    if (statuses.indexOf(status) !== statuses.indexOf(expectedStatus) + 1) return res.sendStatus(409)
    if (status === 'RESOLVED' && !resolutionNote) return res.sendStatus(400)
    const where = { id: req.params.id, ...incidentScope(req.staff) }
    const result = await db.$transaction(async tx => {
      const updated = await tx.incident.updateMany({
        where: { ...where, status: expectedStatus },
        data: { status, resolutionNote: status === 'RESOLVED' ? resolutionNote : null },
      })
      if (!updated.count) {
        const current = await tx.incident.findFirst({ where, select: incidentFields })
        if (!current) return { code: 404 }
        if (current.status === status && (status !== 'RESOLVED' || current.resolutionNote === resolutionNote)) {
          return { incident: current }
        }
        return { code: 409 }
      }
      await tx.auditEvent.create({
        data: { incidentId: req.params.id, actorUid: req.staff.uid, kind: 'STATUS_CHANGED', details: { from: expectedStatus, to: status } },
      })
      return { incident: await tx.incident.findUnique({ where: { id: req.params.id }, select: incidentFields }) }
    })
    if (result.code) return res.sendStatus(result.code)
    res.json(result.incident)
  })
}
