/**
 * PresentonAgent — calls self-contained Groq+python-pptx bridge (port 8005)
 * Generates real PPTX files. No external Presenton service needed.
 */

const PRESENTON_BRIDGE_URL = process.env.PRESENTON_BRIDGE_URL || 'http://127.0.0.1:8005'

export class PresentonAgent {
  async execute(topic: string, context = ''): Promise<string> {
    console.log(`[PresentonAgent] Generating presentation: ${topic}`)

    const res = await fetch(`${PRESENTON_BRIDGE_URL}/generate-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic,
        context,
        n_slides: 8,
        template: 'professional',
        tone: 'professional',
      }),
      signal: AbortSignal.timeout(120_000),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Presenton API ${res.status}: ${err}`)
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
