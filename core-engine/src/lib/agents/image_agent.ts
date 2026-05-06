/**
 * ImageAgent — multi-provider image generation
 * Priority: ComfyUI (local GPU) → Pollinations.ai (free, no key)
 */

const IMAGE_URL = process.env.IMAGE_URL || 'http://127.0.0.1:8006'

export class ImageAgent {
  async execute(prompt: string): Promise<string> {
    console.log(`[ImageAgent] Generating: ${prompt}`)

    const res = await fetch(`${IMAGE_URL}/generate-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        negative_prompt: 'blurry, low quality, watermark, text, deformed, ugly',
        width: 512,
        height: 512,
        steps: 20,
      }),
      signal: AbortSignal.timeout(120_000),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Image API ${res.status}: ${err}`)
    }

    const data = await res.json()
    const imageUrl = data.image_url
    const provider = data.provider || 'unknown'

    // For ComfyUI proxy URLs, prefix with the bridge URL
    const displayUrl = imageUrl.startsWith('/proxy-comfyui')
      ? `http://localhost:8006${imageUrl}`
      : imageUrl

    return (
      `### Generated Image\n\n` +
      `**Prompt:** ${prompt}\n` +
      `**Provider:** ${provider}\n\n` +
      `![Generated Image](${displayUrl})\n\n` +
      `[Open full size](${displayUrl})`
    )
  }
}
