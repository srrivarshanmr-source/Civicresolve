import { PrismaClient } from '@prisma/client'
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { createApp } from '../src/app.js'
import { createGroqTranscriber } from '../src/speech.js'
import { createAnalyzer } from '../src/triage.js'
import { createResendSender } from '../src/review.js'
import { startAccountabilityWorker } from '../src/accountability.js'
import { startTriageWorker } from '../src/triage.js'

// Prisma client - reused across warm invocations
let db
function getDb() {
  if (!db) {
    db = new PrismaClient()
  }
  return db
}

// Firebase Admin - only initialize once
function getFirebaseAuth() {
  if (getApps().length > 0) return getAuth(getApps()[0])
  return getAuth(initializeApp({
    projectId: process.env.FIREBASE_PROJECT_ID,
    credential: applicationDefault(),
  }))
}

const transcribe = process.env.GROQ_API_KEY
  ? createGroqTranscriber(process.env.GROQ_API_KEY)
  : undefined

const analyze = process.env.GEMINI_API_KEY
  ? createAnalyzer(process.env.GEMINI_API_KEY, process.env.GEMINI_MODEL)
  : undefined

const prisma = getDb()
const auth = getFirebaseAuth()

startTriageWorker({ db: prisma, analyze })
startAccountabilityWorker({
  db: prisma,
  sendEmail: createResendSender(process.env.RESEND_API_KEY, process.env.RESEND_FROM, process.env.PUBLIC_SITE_URL),
  onError: error => console.error('Accountability worker failed', error.code ?? error.name),
})

const app = createApp({
  db: prisma,
  verifyIdentity: token => auth.verifyIdToken(token),
  transcribe,
  analyze,
})

export default app
