import { z } from 'zod'

const prediction = z.object({
  aiProbability: z.number().finite().min(0).max(1),
  modelVersion: z.string().trim().min(1).max(100),
  isAiGenerated: z.boolean().optional(),
})

async function screenWithVisionAI(bytes, mimeType, groqApiKey) {
  const prompt = [
    'You are a strict forensic AI vs real camera photo detector for a government civic portal.',
    'Carefully inspect the image for AI generation artifacts: synthetic textures, unnatural smoothing, distorted human/equipment details, digital mockups, or surreal lighting.',
    'Step 1: In "explanation", analyze the visual details.',
    'Step 2: If the image is AI-generated, synthetic, CGI, or a digital mockup/graphic, set "isAiGenerated": true and "aiProbability" between 0.8 and 1.0.',
    'If the image is a genuine, authentic camera photograph of real scenes taken in the physical world, set "isAiGenerated": false and "aiProbability" between 0.0 and 0.2.',
    'Output JSON ONLY matching: {"explanation": string, "isAiGenerated": boolean, "aiProbability": number}'
  ].join(' ')

  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + groqApiKey.trim(),
      'Content-Type': 'application/json'
    },
    signal: AbortSignal.timeout(8_000),
    body: JSON.stringify({
      model: 'qwen/qwen3.8-27b',
      messages: [
        { role: 'user', content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:${mimeType};base64,${bytes.toString('base64')}` } }
        ]}
      ],
      response_format: { type: 'json_object' }
    })
  })

  if (!resp.ok) {
    throw new Error('Vision AI screening failed: ' + resp.status)
  }

  const json = await resp.json()
  const parsed = JSON.parse(json.choices?.[0]?.message?.content ?? '{}')
  const aiProbability = typeof parsed.aiProbability === 'number' ? Math.max(0, Math.min(1, parsed.aiProbability)) : (parsed.isAiGenerated ? 0.9 : 0.1)
  const isAiGenerated = Boolean(parsed.isAiGenerated || aiProbability > 0.5)

  return {
    aiProbability,
    modelVersion: 'qwen-vision-ai-detector-v1',
    isAiGenerated,
  }
}

export function createPhotoScreening(url, token, groqApiKey = process.env.GROQ_API_KEY) {
  // If no screening service and no groq key, screening is unavailable
  if (!url && !groqApiKey) return undefined

  return async ({ bytes, mimeType }) => {
    // 1. Try dedicated SigLIP microservice first if URL is configured
    if (url && token) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + token, 'Content-Type': mimeType },
          body: bytes,
          redirect: 'error',
          signal: AbortSignal.timeout(5_000),
        })
        if (response.ok) {
          const resJson = await response.json()
          const parsed = prediction.parse(resJson)
          return {
            ...parsed,
            isAiGenerated: parsed.aiProbability > 0.5,
          }
        }
      } catch (error) {
        console.warn('Dedicated SigLIP detector unreachable, using vision fallback:', error.message)
      }
    }

    // 2. Fallback to vision AI detector (Qwen 3.8 27B Vision on Groq)
    if (groqApiKey) {
      return await screenWithVisionAI(bytes, mimeType, groqApiKey)
    }

    return { aiProbability: 0, modelVersion: 'none', isAiGenerated: false }
  }
}
