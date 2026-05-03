/**
 * PPTAgent — calls ppt-master bridge (port 8002)
 * Passes search context if available so the LLM uses real data.
 */

const PPT_URL = process.env.PPT_URL || 'http://127.0.0.1:8002'

export class PPTAgent {
  async execute(topic: string, context: string = '', slideCount = 8): Promise<string> {
    console.log(`[PPTAgent] Generating PPT: ${topic}`)

    const res = await fetch(`${PPT_URL}/generate-ppt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topic, slide_count: slideCount, context }),
      signal: AbortSignal.timeout(300_000), // 5 min — pipeline takes time
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`PPT API ${res.status}: ${err}`)
    }

    const data = await res.json()
    const downloadUrl = `http://localhost:8002${data.download_url}`

    return (
      `### 📊 Presentation Ready\n\n` +
      `**Topic:** ${topic}\n` +
      `**Slides:** ${data.slide_count}\n` +
      `**Project:** ${data.project_name}\n\n` +
      `[⬇️ Download PPTX](${downloadUrl})`
    )
  }
}
