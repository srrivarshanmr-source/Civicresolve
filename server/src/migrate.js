import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const cli = fileURLToPath(new URL('../node_modules/prisma/build/index.js', import.meta.url))
const env = { ...process.env }
if (env.DATABASE_URL_UNPOOLED) env.DATABASE_URL = env.DATABASE_URL_UNPOOLED
const result = spawnSync(process.execPath, [cli, 'migrate', 'deploy'], { env, stdio: 'inherit' })
if (result.error) throw result.error
process.exitCode = result.status ?? 1