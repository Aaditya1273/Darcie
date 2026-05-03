/**
 * PerplexicaAgent — calls the searach (Perplexica fork) deep search API
 *
 * searach runs on port 3001 and exposes POST /api/chat
 * Its API requires: message, chatModel, embeddingModel, optimizationMode
 *
 * We use the configured LLM providers from env.
 * Response is a NDJSON stream — we collect all blocks and return the final text.
 */

const SEARACH_URL = process.env.SEARACH_URL || 'http://127.0.0.1:3001'

// Default models — use whatever is configured in searach
const DEFAULT_CHAT_MODEL = {
  providerId: process.env.SEARACH_PROVIDER_ID || 'groq',
  key: process.env.SEARACH_MODEL_KEY || 'llama-3.3-70b-versatile',
}

const DEFAULT_EMBEDDING_MODEL = {
  providerId: process.env.SEARACH_EMBED_PROVIDER_ID || 'openai',
  key: process.env.SEARACH_EMBED_KEY || 'text-embedding-3-small',
}

export class PerplexicaAgent {
  /**
   * Calls searach's /api/chat endpoint.
   * searach streams NDJSON blocks — we collect them and return the final answer text.
   */
  async execute(query: string, focusMode: string = 'webSearch'): Promise<string> {
    console.log(`[PerplexicaAgent] Deep research: ${query}`)

    const messageId = crypto.randomUUID()
    const chatId = crypto.randomUUID()

    const body = {
      message: {
        messageId,
        chatId,
        content: query,
      },
      optimizationMode: 'balanced',
      sources: [focusMode],
      history: [],
      files: [],
      chatModel: DEFAULT_CHAT_MODEL,
      embeddingModel: DEFAULT_EMBEDDING_MODEL,
      systemInstructions: '',
    }

    try {
      const res = await fetch(`${SEARACH_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000), // 2 min timeout
      })

      if (!res.ok) {
        throw new Error(`searach /api/chat returned ${res.status}: ${await res.text()}`)
      }

      // searach streams NDJSON — each line is a JSON object
      const text = await res.text()
      const lines = text.split('\n').filter((l) => l.trim())

      let finalAnswer = ''
      const sources: string[] = []

      for (const line of lines) {
        try {
          const event = JSON.parse(line)

          if (event.type === 'block' && event.block?.type === 'text') {
            finalAnswer += event.block.content ?? ''
          }

          if (event.type === 'updateBlock' && event.patch) {
            // Patch may contain text delta
            const val = event.patch?.value ?? ''
            if (typeof val === 'string') finalAnswer += val
          }

          if (event.type === 'block' && event.block?.type === 'sources') {
            const srcs = event.block?.sources ?? []
            for (const s of srcs) {
              if (s.url) sources.push(`- [${s.title || s.url}](${s.url})`)
            }
          }
        } catch {
          // Skip malformed lines
        }
      }

      if (!finalAnswer) {
        throw new Error('searach returned no text content')
      }

      const sourcesSection =
        sources.length > 0 ? `\n\n**Sources:**\n${sources.slice(0, 5).join('\n')}` : ''

      return `[Deep Research]\n${finalAnswer}${sourcesSection}`
    } catch (error) {
      console.error('[PerplexicaAgent] Failed:', error)
      throw error
    }
  }
}
