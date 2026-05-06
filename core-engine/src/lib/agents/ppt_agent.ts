/**
 * PPTAgent — generates real PPTX via self-contained Groq+python-pptx bridge
 * Uses the same presenton_api.py engine (port 8005) which is proven working.
 * Passes context from search results so slides have real data.
 */

const PPT_URL = process.env.PRESENTON_BRIDGE_URL || 'http://127.0.0.1:8005'

export class PPTAgent {
  async execute(topic: string, context = '', slideCount = 8): Promise<string> {
    console.log(`[PPTAgent] Generating PPT: ${topic}`)

    const res = await fetch(`${PPT_URL}/generate-ppt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic,
        context,
        n_slides: slideCount,
        template: 'professional',
        tone: 'professional',
      }),
      signal: AbortSignal.timeout(120_000),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`PPT API ${res.status}: ${err}`)
    }

    const data = await res.json()
    const downloadUrl = `http://localhost:8005${data.download_url}`

    return (
      `### Presentation Ready\n\n` +
      `**Title:** ${data.title}\n` +
      `**Slides:** ${data.slide_count}\n\n` +
      `[Download PPTX](${downloadUrl})`
    )
  }
}
