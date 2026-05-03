/**
 * ImageAgent — calls ComfyUI bridge (port 8006)
 * ComfyUI runs the actual image generation via its workflow engine.
 * The bridge POSTs a workflow to ComfyUI's /prompt and polls for the result.
 */

const IMAGE_URL = process.env.IMAGE_URL || 'http://127.0.0.1:8006'
const COMFYUI_URL = process.env.COMFYUI_URL || 'http://127.0.0.1:8188'

export class ImageAgent {
  async execute(prompt: string): Promise<string> {
    console.log(`[ImageAgent] Generating image: ${prompt}`)

    const res = await fetch(`${IMAGE_URL}/generate-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt,
        negative_prompt: 'blurry, low quality, watermark, text, deformed',
        width: 512,
        height: 512,
        steps: 20,
      }),
      signal: AbortSignal.timeout(180_000), // 3 min
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Image API ${res.status}: ${err}`)
    }

    const data = await res.json()
    // image_url is a ComfyUI /view?filename=... URL — proxy it through our app
    const imageUrl = data.image_url

    return (
      `### 🎨 Generated Image\n\n` +
      `**Prompt:** ${prompt}\n\n` +
      `![Generated Image](${imageUrl})\n\n` +
      `[🔗 Open Full Size](${imageUrl})`
    )
  }
}
