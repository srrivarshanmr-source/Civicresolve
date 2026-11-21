# CivicResolve API

1. Create a PostgreSQL database. Copy .env.example to .env and set DATABASE_URL and FIREBASE_PROJECT_ID.
2. Enable the chosen sign-in provider in Firebase Authentication. Set GOOGLE_APPLICATION_CREDENTIALS to a local service account key path, or use Application Default Credentials in the deployment environment.
3. Run npm.cmd install, npm.cmd run db:generate, then npm.cmd run db:deploy.
4. After creating the staff account in Firebase, run npm.cmd run staff:grant -- FIREBASE_UID ADMIN. Officers and supervisors also need department IDs after the department records have been created. Rerunning this command replaces that staff member's existing scopes.
5. Run npm.cmd run dev. The API binds to 127.0.0.1:3001.

Send Firebase ID tokens as bearer credentials to the staff endpoints. Staff membership and department scopes live in PostgreSQL.

## Run the complaint workflow

Enable Google as a sign-in provider in Firebase Authentication and authorize localhost for local development. Copy client/.env.example to client/.env.local and set the three web configuration values from the same Firebase project. Run the API on port 3001 and the Vite client in a separate terminal. Apply both migrations using npm.cmd run db:deploy before submitting reports.

Submit a report at /report. Save the private access code and reference, or open the receipt's tracking link. The link puts the secret in its URL fragment, and the client sends it as a bearer credential. Keep the link private.

Sign in at /staff with a Firebase account granted ADMIN access. Open the incident and use Mark in progress, then enter a resolution note and use Mark resolved. Look up the original report at /track to see the updated status and note.

Photo uploads currently use private PostgreSQL storage and accept JPEG, PNG, and WebP up to 2 MB. Staff photo reads use the same department scope as incident reads.
## Voice reporting

Enable billing and the Speech-to-Text API in a Google Cloud project and set SPEECH_PROJECT_ID in server/.env. Give the Application Default Credentials identity Speech-to-Text recognition access in that project (for example, Cloud Speech Client). Use Google Cloud quota controls for a public demo endpoint.

Open the app on localhost or HTTPS and allow microphone access. Record up to 30 seconds in Tamil, Indian English, or Hindi, then edit the returned transcription and select Use transcript to put it in the description. The prototype uses Chirp 2 in asia-southeast1. Audio is sent to Google for transcription and is not stored by CivicResolve. The title and location can be entered manually. Typing remains available with an unconfigured provider or denied microphone permission.
## Deploy the website with hosted voice

Build the client with npm run build and keep client/dist in the deployed project alongside server. Install server dependencies, generate Prisma Client, and apply database migrations before starting the Node service. Set HOST=0.0.0.0 and expose the platform-provided PORT over HTTPS. Node serves the client and API from the same origin. Configure Firebase web variables at frontend build time and authorize the deployed domain in Firebase Authentication.

Set GROQ_API_KEY as a backend secret to use hosted multilingual Whisper. This takes precedence over SPEECH_PROJECT_ID, so Google Cloud Speech-to-Text setup is optional. Residents can record without an account and can type if transcription is unavailable or throttled. The selected speech provider receives the recording. CivicResolve does not save the recording.
## Triage, evidence, email, and public metrics

Set GEMINI_API_KEY to enable AI triage. In Staff dashboard, open an issue to review its category, urgency, department suggestion, and photo consistency. Staff can record a separate evidence decision and provenance finding with a source. Gemini photo consistency is not an image provenance detector.

Use Prisma Studio from server (npm exec -- prisma studio) to add Department rows. Set jurisdiction to the ward label, code to ROADS, WATER, WASTE, or LIGHTS, and enter the configured head and supervisor inboxes. The admin assigns a department and response deadline in the staff dashboard. A department response requires a next action. Unanswered cases escalate automatically after the deadline.

Set RESEND_API_KEY and RESEND_FROM to enable real emails and PUBLIC_SITE_URL for the staff workspace link. Use a sender configured in Resend. With no email adapter, assignments and escalation events are recorded and emails stay queued. Run one continuously available Node service for the demo so deadline checks can run.

The citizen tracking page shows private case events and supports requesting supervisor review for a disputed or resolved case. Public metrics group incidents by the active department's jurisdiction and omit small groups for privacy.
## Neon PostgreSQL

The root .neon file selects the Neon project and branch. Run neon deploy at the repository root to provision the declared Postgres service and pull its variables. The Node backend uses the root .env.local or .env generated by Neon, with server/.env as a fallback for local settings. Existing process environment variables take precedence. Keep all these files private.

Run npm run db:deploy from the repository root to apply Prisma migrations using DATABASE_URL_UNPOOLED when available. The long-running Node server uses Prisma Client with DATABASE_URL for application traffic. Run npm run build followed by npm start from the root to serve the built app and API together.