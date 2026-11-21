import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

function tokenHash(token) {
  return createHash('sha256').update(token).digest()
}

export function createTrackingCredentials() {
  const token = randomBytes(32).toString('base64url')
  return {
    reference: 'CR-' + randomBytes(8).toString('hex').toUpperCase(),
    token,
    tokenHash: tokenHash(token).toString('hex'),
  }
}

export function trackingTokenHash(token) {
  return tokenHash(token).toString('hex')
}

export function matchesTrackingToken(token, storedHash) {
  return /^[A-Za-z0-9_-]{43}$/.test(token)
    && /^[a-f0-9]{64}$/.test(storedHash)
    && timingSafeEqual(tokenHash(token), Buffer.from(storedHash, 'hex'))
}

export function bearerToken(req) {
  return /^Bearer ([^\s]+)$/i.exec(req.get('authorization') ?? '')?.[1]
}

export function incidentScope(staff) {
  if (staff.role === 'ADMIN') return {}
  return {
    assignments: {
      some: {
        endedAt: null,
        departmentId: { in: staff.scopes.map(scope => scope.departmentId) },
      },
    },
  }
}
