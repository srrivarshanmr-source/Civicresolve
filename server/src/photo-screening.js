import { z } from 'zod'

const prediction = z.object({
  aiProbability: z.number().finite().min(0).max(1),
  modelVersion: z.string().trim().min(1).max(100),
  isAiGenerated: z.boolean().optional(),
})

async function screenWithVisionAI(bytes, mimeType, groqApiKey) {
  const prompt = [
    'You are a strict forensic AI Image Detector for a government public grievance portal.',
    'CivicResolve ONLY accepts genuine, authentic photographs taken by a human using a physical camera phone in the real world.',
    'Carefully inspect the image for ANY of the following: AI generation (Midjourney, DALL-E, Stable Diffusion, Flux, Imagen), AI upscaling, synthetic textures, surreal glossy smoothing, incoherent road markings, unnatural vegetation blending, CGI graphics, or digital screenshots.',
    'If you see ANY indication of AI generation, synthetic generation, digital art, or CGI, you MUST set "isAiGenerated": true and "aiProbability" between 0.75 and 1.0.',
    'Only set "isAiGenerated": false and "aiProbability": 0.05 if you are confident it is an unedited real camera photograph of a physical civic issue.',
    'Output JSON ONLY matching: {"isAiGenerated": boolean, "aiProbability": number, "explanation": string}'
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
  const aiProbability = typeof parsed.aiProbability === 'number' ? Math.max(0, Math.min(1, parsed.aiProbability)) : (parsed.isAiGenerated ? 0.95 : 0.05)
  const isAiGenerated = Boolean(parsed.isAiGenerated || aiProbability >= 0.45)

  return {
    aiProbability,
    modelVersion: 'SigLIP-Qwen-Forensic-v2',
    isAiGenerated,
    explanation: parsed.explanation || (isAiGenerated ? 'Synthetic/AI artifacts detected' : 'Authentic camera photo'),
  }
}

export function createPhotoScreening(url, token, groqApiKey = process.env.GROQ_API_KEY) {
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
            isAiGenerated: parsed.aiProbability >= 0.45,
          }
        }
      } catch (error) {
        console.warn('Dedicated SigLIP microservice unreachable, falling back:', error.message)
      }
    }

    // 2. High-sensitivity Forensic Vision Model
    if (groqApiKey) {
      return await screenWithVisionAI(bytes, mimeType, groqApiKey)
    }

    return { aiProbability: 0, modelVersion: 'none', isAiGenerated: false }
  }
}
