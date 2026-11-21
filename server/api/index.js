import { PrismaClient } from '@prisma/client'
import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { createApp } from '../src/app.js'
import { createGroqTranscriber } from '../src/speech.js'
import { createAnalyzer } from '../src/triage.js'
import { createResendSender } from '../src/review.js'
import { startAccountabilityWorker } from '../src/accountability.js'
import { createPhotoScreening } from '../src/photo-screening.js'

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

const analyze = createAnalyzer(process.env.GEMINI_API_KEY, process.env.GEMINI_MODEL, process.env.GROQ_API_KEY)

const prisma = getDb()
const auth = getFirebaseAuth()

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
  screenPhoto: createPhotoScreening(process.env.PHOTO_SCREEN_URL, process.env.PHOTO_SCREEN_TOKEN, process.env.GROQ_API_KEY),
})

export default app
