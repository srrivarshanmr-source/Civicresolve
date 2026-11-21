import { existsSync } from 'node:fs'
import { loadEnvFile } from 'node:process'

for (const relativePath of ['../../.env.local', '../../.env', '../.env']) {
  const file = new URL(relativePath, import.meta.url)
  if (existsSync(file)) loadEnvFile(file)
}