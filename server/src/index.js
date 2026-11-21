import { PrismaClient } from '@prisma/client'
import { applicationDefault, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { z } from 'zod'
import { createApp } from './app.js'
import { createGroqTranscriber, createTranscriber } from './speech.js'
import express from 'express'
import { createAnalyzer, startTriageWorker } from './triage.js'
import { startAccountabilityWorker } from './accountability.js'
import { createResendSender } from './review.js'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'

const env = z.object({
  DATABASE_URL: z.string().url(),
  FIREBASE_PROJECT_ID: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  RESEND_FROM: z.string().min(1).optional(),
  PUBLIC_SITE_URL: z.string().url().optional(),
  GROQ_API_KEY: z.string().min(1).optional(),
  HOST: z.string().default('127.0.0.1'),
  SPEECH_PROJECT_ID: z.string().min(1).optional(),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
}).parse(process.env)
const db = new PrismaClient()
await db.$connect()
const auth = getAuth(initializeApp({ projectId: env.FIREBASE_PROJECT_ID, credential: applicationDefault() }))
const transcribe = env.GROQ_API_KEY ? createGroqTranscriber(env.GROQ_API_KEY)
  : env.SPEECH_PROJECT_ID ? createTranscriber(env.SPEECH_PROJECT_ID) : undefined
const analyze = createAnalyzer(env.GEMINI_API_KEY, env.GEMINI_MODEL, env.GROQ_API_KEY)
startTriageWorker({ db, analyze })
const app = createApp({
  db, verifyIdentity: token => auth.verifyIdToken(token, true), transcribe,
  analyze,
})
startAccountabilityWorker({
  db, sendEmail: createResendSender(env.RESEND_API_KEY, env.RESEND_FROM, env.PUBLIC_SITE_URL),
  onError: error => console.error('Accountability worker failed', error.code ?? error.name),
})
const webRoot = fileURLToPath(new URL('../../client/dist/', import.meta.url))
const index = fileURLToPath(new URL('../../client/dist/index.html', import.meta.url))
app.use('/api', (_req, res) => res.sendStatus(404))
if (existsSync(index)) {
  app.use(express.static(webRoot))
  app.get('/{*path}', (_req, res) => res.sendFile(index))
}
app.listen(env.PORT, env.HOST, () => console.log('CivicResolve listening on ' + env.HOST + ':' + env.PORT))
