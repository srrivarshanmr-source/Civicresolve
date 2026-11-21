import { z } from 'zod'

const prediction = z.object({
  aiProbability: z.number().finite().min(0).max(1),
  modelVersion: z.string().trim().min(1).max(100),
})

export function createPhotoScreening(url, token) {
  if (!url || !token) return undefined
  return async ({ bytes, mimeType }) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': mimeType },
      body: bytes,
      redirect: 'error',
      signal: AbortSignal.timeout(5_000),
    })
    if (!response.ok) throw new Error('Photo screening failed: ' + response.status)
    return prediction.parse(await response.json())
  }
}
