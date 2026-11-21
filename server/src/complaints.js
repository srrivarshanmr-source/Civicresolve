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
  id: true, category: true, status: true, priority: true, upvotes: true, updatedAt: true, resolutionNote: true,
  reports: { orderBy: { createdAt: 'asc' }, select: reportFields },
}

function identifyPhoto(bytes) {
  if (bytes.length < 12 || bytes.length > maxPhoto) return null
  if (bytes.subarray(0, 3).equals(Buffer.from([255, 216, 255]))) return 'image/jpeg'
  if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png'
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return null
}

const deptCodeMap = {
  'ROAD_DAMAGE': 'ROADS',
  'WATER_LEAKAGE': 'WATER',
  'WASTE': 'WASTE',
  'STREETLIGHTING': 'LIGHTS',
}

export function registerComplaintRoutes(app, db, staffOnly, json, analyze, screenPhoto) {
  // Public Feed of Reports for Citizens
  app.get('/api/public/incidents', async (_req, res) => {
    try {
      const incidents = await db.incident.findMany({
        take: 60,
        orderBy: [{ upvotes: 'desc' }, { createdAt: 'desc' }],
        select: {
          id: true,
          category: true,
          status: true,
          priority: true,
          upvotes: true,
          createdAt: true,
          reports: {
            take: 1,
            orderBy: { createdAt: 'asc' },
            select: { id: true, title: true, description: true, location: true, photoMime: true, createdAt: true }
          },
          events: {
            where: { kind: { in: ['TRIAGE_ANALYZED', 'EVIDENCE_REVIEWED', 'TRIAGE_INITIAL_SUCCEEDED'] } },
            take: 1,
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            select: { kind: true, details: true }
          }
        }
      })

      const sanitized = incidents.map(inc => {
        const report = inc.reports[0]
        const triageEvent = inc.events[0]
        const details = triageEvent?.details ?? {}
        const isAiGenerated = Boolean(details?.isAiGenerated || details?.evidence?.isAiGenerated || details?.photoOrigin === 'AI_INDICATED')
        return {
          id: inc.id,
          category: inc.category,
          status: inc.status,
          priority: inc.priority,
          upvotes: inc.upvotes ?? 1,
          createdAt: inc.createdAt,
          title: report?.title ?? inc.category,
          description: report?.description ?? '',
          location: report?.location ?? 'Municipality',
          hasPhoto: Boolean(report?.photoMime),
          reportId: report?.id,
          isAiGenerated,
        }
      })

      res.json(sanitized)
    } catch (err) {
      console.error('Failed to fetch public incidents:', err)
      res.sendStatus(500)
    }
  })

  // Public Report Photo View
  app.get('/api/public/reports/:id/photo', async (req, res) => {
    try {
      const report = await db.report.findUnique({
        where: { id: req.params.id },
        select: { photoData: true, photoMime: true }
      })
      if (!report?.photoData || !report.photoMime) return res.sendStatus(404)
      res.set('X-Content-Type-Options', 'nosniff')
      res.type(report.photoMime).send(Buffer.from(report.photoData))
    } catch {
      res.sendStatus(404)
    }
  })

  // Community Upvote Endpoint (Priority boosts with votes)
  app.post('/api/public/incidents/:id/upvote', async (req, res) => {
    try {
      const incident = await db.incident.findUnique({
        where: { id: req.params.id },
        select: { id: true, upvotes: true, priority: true }
      })
      if (!incident) return res.sendStatus(404)

      const newVotes = (incident.upvotes ?? 1) + 1
      let newPriority = incident.priority

      // Automatic priority escalation based on community votes
      if (newVotes >= 5 && newPriority !== 'HIGH') {
        newPriority = 'HIGH'
      } else if (newVotes >= 3 && newPriority === 'LOW') {
        newPriority = 'STANDARD'
      }

      const updated = await db.incident.update({
        where: { id: incident.id },
        data: {
          upvotes: newVotes,
          priority: newPriority,
        },
        select: { id: true, upvotes: true, priority: true }
      })

      await db.auditEvent.create({
        data: {
          incidentId: incident.id,
          kind: 'UPVOTED',
          details: { upvotes: newVotes, priority: newPriority }
        }
      })

      res.json(updated)
    } catch (err) {
      console.error('Upvote failed:', err)
      res.sendStatus(500)
    }
  })

  // Submit Complaint / Report
  app.post('/api/reports', json, async (req, res) => {
    const parsed = reportSchema.safeParse(req.body)
    if (!parsed.success) return res.sendStatus(400)
    const { reference, token, photo, title, description, location, category, language } = parsed.data
    const photoData = photo ? Buffer.from(photo, 'base64') : undefined
    const photoMime = photoData ? identifyPhoto(photoData) : null
    if (photoData && !photoMime) return res.sendStatus(415)

    if (photoData && screenPhoto) {
      const prior = await db.report.findUnique({
        where: { trackingReference: reference }, select: { trackingTokenHash: true },
      })
      if (prior) {
        if (!matchesTrackingToken(token, prior.trackingTokenHash)) return res.sendStatus(409)
        return res.json({ reference })
      }

      try {
        const result = await screenPhoto({ bytes: photoData, mimeType: photoMime })
        if (result && (result.aiProbability > 0.5 || result.isAiGenerated)) {
          return res.status(422).json({ code: 'PHOTO_AI_REJECTED' })
        }
      } catch (error) {
        console.warn('Photo screening error:', error.message)
      }
    }

    let createdIncident
    try {
      createdIncident = await db.incident.create({
        data: {
          category,
          upvotes: 1,
          reports: {
            create: {
              trackingReference: reference,
              trackingTokenHash: trackingTokenHash(token),
              title,
              description,
              location,
              category,
              language,
              photoData,
              photoMime
            }
          },
          events: { create: { kind: 'REPORTED', details: {} } },
        },
        select: { id: true, reports: { select: { id: true }, take: 1 } },
      })
    } catch (error) {
      if (error.code !== 'P2002') throw error
      const prior = await db.report.findUnique({
        where: { trackingReference: reference }, select: { trackingTokenHash: true },
      })
      if (!prior || !matchesTrackingToken(token, prior.trackingTokenHash)) return res.sendStatus(409)
      return res.json({ reference })
    }

    // Automatic AI Triage, AI Image Flagging, and Department Dispatch
    if (analyze && createdIncident) {
      const incidentId = createdIncident.id
      const reportId = createdIncident.reports[0]?.id
      await (async () => {
        try {
          const triage = await analyze({
            title,
            description,
            location,
            language,
            category,
            photo: photoData && photoMime ? { mimeType: photoMime, bytes: photoData } : null
          })

          if (triage) {
            const priority = triage.priority
            const triagedCategory = (triage.category && triage.category !== 'UNSURE') ? triage.category : category
            const isAi = Boolean(triage.evidence?.isAiGenerated || triage.evidence?.aiConfidence === 'AI_INDICATED')

            await db.incident.update({
              where: { id: incidentId },
              data: {
                priority: priority ?? undefined,
                category: triagedCategory ?? undefined,
              }
            })

            await db.auditEvent.create({
              data: {
                incidentId,
                kind: 'TRIAGE_ANALYZED',
                details: { ...triage, reportId, isAiGenerated: isAi }
              }
            })

            // Auto-assign to Department and queue accountability notification
            const targetCode = deptCodeMap[triagedCategory]
            if (targetCode) {
              const dept = await db.department.findFirst({ where: { code: targetCode } })
              if (dept) {
                const now = new Date()
                const hours = priority === 'HIGH' ? 24 : priority === 'LOW' ? 72 : 48
                const responseDueAt = new Date(+now + hours * 3600 * 1000)

                const assignment = await db.assignment.create({
                  data: {
                    incidentId,
                    departmentId: dept.id,
                    version: 1,
                    assignedAt: now,
                    responseDueAt
                  }
                })

                await db.auditEvent.create({
                  data: {
                    incidentId,
                    kind: 'ASSIGNED',
                    details: {
                      assignmentId: assignment.id,
                      departmentId: dept.id,
                      version: 1,
                      responseDueAt: responseDueAt.toISOString(),
                      autoAssigned: true
                    }
                  }
                })

                // Queue automated email to department head
                await db.auditEvent.create({
                  data: {
                    incidentId,
                    kind: 'ACCOUNTABILITY_EMAIL',
                    details: {
                      to: dept.headEmail,
                      subject: `[${priority}] CivicResolve Incident: ${title}`,
                      text: `A new municipal issue has been reported and assigned to your department.\n\nTitle: ${title}\nLocation: ${location}\nCategory: ${triagedCategory}\nPriority: ${priority}\nAI Summary: ${triage.summary}\nResponse Deadline: ${responseDueAt.toISOString()}\n\nPlease review and take action. If no response is recorded before the deadline, this case will automatically escalate to the supervisor.`,
                      attempts: 0,
                      availableAt: now.toISOString(),
                      state: 'pending'
                    }
                  }
                })
              }
            }
          }
        } catch (autoErr) {
          console.warn('Auto-triage background execution warning:', autoErr.message)
        }
      })()
    }

    res.status(201).json({ reference })
  })

  // Staff Incidents List
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

  // Staff Report Photo
  app.get('/api/staff/reports/:id/photo', staffOnly, async (req, res) => {
    const report = await db.report.findFirst({
      where: { id: req.params.id, incident: incidentScope(req.staff) },
      select: { photoData: true, photoMime: true },
    })
    if (!report?.photoData || !report.photoMime) return res.sendStatus(404)
    res.set('X-Content-Type-Options', 'nosniff')
    res.type(report.photoMime).send(Buffer.from(report.photoData))
  })

  // Update Incident Status
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
