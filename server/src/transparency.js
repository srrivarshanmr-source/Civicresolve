const minimumCount = 5

function hasSmallCell(counts) {
  return counts.some(count => count > 0 && count < minimumCount)
}

export function registerTransparencyRoutes(app, db) {
  app.get('/api/public/transparency', async (_req, res) => {
    // Use one active assignment per incident, even if multiple assignments are open.
    const rows = await db.$queryRaw`
      WITH attributed AS (
        SELECT i.status, NULLIF(BTRIM(d.jurisdiction), '') AS ward,
               NULLIF(BTRIM(d.code), '') AS department,
               active.id IS NOT NULL AS assigned,
               active."respondedAt" <= active."responseDueAt" AS on_time,
               active."respondedAt" IS NOT NULL OR active."responseDueAt" <= ${new Date()} AS eligible,
               EXISTS (
                 SELECT 1 FROM "AuditEvent" e
                 WHERE e."incidentId" = i.id AND e.kind = 'ASSIGNMENT_ESCALATED'
                   AND e.details->>'assignmentId' = active.id
               ) AS escalated
        FROM "Incident" i
        LEFT JOIN LATERAL (
          SELECT a.id, a."departmentId", a."respondedAt", a."responseDueAt"
          FROM "Assignment" a
          WHERE a."incidentId" = i.id AND a."endedAt" IS NULL
          ORDER BY a.version DESC
          LIMIT 1
        ) active ON TRUE
        LEFT JOIN "Department" d ON d.id = active."departmentId"
      )
      SELECT GROUPING(department) = 1 AS "wardOnly", ward, department,
             COUNT(*) AS total,
             COUNT(*) FILTER (WHERE status = 'REPORTED') AS reported,
             COUNT(*) FILTER (WHERE status = 'IN_PROGRESS') AS "inProgress",
             COUNT(*) FILTER (WHERE status = 'RESOLVED') AS resolved,
             COUNT(*) FILTER (WHERE assigned) AS assigned,
             COUNT(*) FILTER (WHERE eligible) AS eligible,
             COUNT(*) FILTER (WHERE on_time) AS "onTime",
             COUNT(*) FILTER (WHERE escalated) AS escalations,
             COUNT(*) FILTER (WHERE escalated AND on_time) AS "escalatedOnTime",
             COUNT(*) FILTER (WHERE escalated AND eligible AND on_time IS NOT TRUE) AS "escalatedMissed"
      FROM attributed
      GROUP BY GROUPING SETS ((ward), (ward, department))
      HAVING COUNT(*) >= ${minimumCount}
      ORDER BY "wardOnly" DESC, ward NULLS LAST, department NULLS LAST
    `

    const wards = []
    const departments = []
    for (const row of rows) {
      const reported = Number(row.reported)
      const inProgress = Number(row.inProgress)
      const resolved = Number(row.resolved)
      const assigned = Number(row.assigned)
      const eligible = Number(row.eligible)
      const onTime = Number(row.onTime)
      const missed = eligible - onTime
      const pending = assigned - eligible
      const escalations = Number(row.escalations)
      const escalatedOnTime = Number(row.escalatedOnTime)
      const escalatedMissed = Number(row.escalatedMissed)
      const escalatedPending = escalations - escalatedOnTime - escalatedMissed
      const canPublishRate = eligible >= minimumCount && !hasSmallCell([onTime, missed, pending, Number(row.total) - assigned])
      // If publishing both metrics, check the overlapping outcome cells as well.
      const escalationCells = canPublishRate
        ? [escalatedOnTime, onTime - escalatedOnTime, escalatedMissed, missed - escalatedMissed,
           escalatedPending, pending - escalatedPending]
        : [escalations, assigned - escalations]
      const canPublishEscalations = assigned >= minimumCount && !hasSmallCell(escalationCells)
      const metrics = {
        ward: row.ward,
        total: Number(row.total),
        statuses: hasSmallCell([reported, inProgress, resolved]) ? null : { reported, inProgress, resolved },
        onTimeFirstResponseRate: canPublishRate ? onTime / eligible : null,
        escalations: canPublishEscalations ? escalations : null,
      }
      if (row.wardOnly) wards.push(metrics)
      else departments.push({ ...metrics, department: row.department })
    }

    // A ward total or breakdown could reveal suppressed figures by subtraction.
    for (const ward of wards) {
      const visibleDepartments = departments.filter(row => row.ward === ward.ward)
      const visibleTotal = visibleDepartments.reduce((sum, row) => sum + row.total, 0)
      if (visibleTotal > 0 && visibleTotal < ward.total) {
        ward.total = null
      }
      if (visibleTotal > 0 && (ward.total === null || visibleDepartments.some(row => row.statuses === null))) {
        ward.statuses = null
      }
      if (ward.total === null || visibleDepartments.some(row => row.onTimeFirstResponseRate === null || row.escalations === null)) {
        ward.onTimeFirstResponseRate = null
        ward.escalations = null
      }
    }

    res.json({ minimumCount, wards, departments })
  })
}
