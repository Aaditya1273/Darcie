/**
 * PresentonAgent — calls Presenton bridge (port 8005)
 * Presenton generates fully styled AI presentations via its own FastAPI server.
 */

const PRESENTON_BRIDGE_URL = process.env.PRESENTON_BRIDGE_URL || 'http://127.0.0.1:8005'
const PRESENTON_APP_URL = process.env.PRESENTON_URL || 'http://127.0.0.1:7860'

export class PresentonAgent {
  async execute(topic: string, context: string = ''): Promise<string> {
    console.log(`[PresentonAgent] Generating report: ${topic}`)

    const res = await fetch(`${PRESENTON_BRIDGE_URL}/generate-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic,
        context,
        n_slides: 8,
        template: 'default',
        language: 'English',
        tone: 'professional',
        web_search: false,
      }),
      signal: AbortSignal.timeout(300_000), // 5 min
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Presenton API ${res.status}: ${err}`)
    }

    const data = await res.json()
    const viewUrl = `${PRESENTON_APP_URL}/presentation/${data.presentation_id}`

    return (
      `### 📑 Professional Presentation Ready\n\n` +
      `**Title:** ${data.title}\n` +
      `**Slides:** ${data.slide_count}\n\n` +
      `[🔗 View Presentation](${viewUrl})`
    )
  }
}
