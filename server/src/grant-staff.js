import { PrismaClient } from '@prisma/client'
import { z } from 'zod'

const [uid, role, ...departmentIds] = process.argv.slice(2)
const input = z.object({
  uid: z.string().min(1).max(128),
  role: z.enum(['ADMIN', 'OFFICER', 'SUPERVISOR']),
  departmentIds: z.array(z.string().uuid()),
}).parse({ uid, role, departmentIds: [...new Set(departmentIds)] })
if (input.role !== 'ADMIN' && input.departmentIds.length === 0) {
  throw new Error('Provide at least one department ID for an officer or supervisor.')
}
const db = new PrismaClient()
try {
  await db.$transaction(async tx => {
    await tx.staff.upsert({
      where: { uid: input.uid },
      create: { uid: input.uid, role: input.role },
      update: { role: input.role },
    })
    await tx.staffScope.deleteMany({ where: { staffUid: input.uid } })
    await tx.staffScope.createMany({
      data: input.departmentIds.map(departmentId => ({ staffUid: input.uid, departmentId })),
    })
  })
  console.log('Staff access updated.')
} finally {
  await db.$disconnect()
}
