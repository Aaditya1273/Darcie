/**
 * PerplexicaAgent — calls searach (Perplexica fork) on port 3001
 *
 * searach /api/chat requires:
 *   message: { messageId, chatId, content }
 *   chatModel: { providerId, key }      ← must match a configured provider in searach
 *   embeddingModel: { providerId, key } ← must match a configured provider in searach
 *   optimizationMode: 'speed' | 'balanced' | 'quality'
 *   sources: string[]
 *   history: []
 *
 * Response: NDJSON stream of { type, block/patch } objects
 */

const SEARACH_URL = process.env.SEARACH_URL || 'http://127.0.0.1:3001'

// These must match provider IDs configured in searach's config
// searach uses its own config system — set these to match what you've configured there
const CHAT_MODEL = {
  providerId: process.env.SEARACH_PROVIDER_ID || 'groq',
  key: process.env.SEARACH_MODEL_KEY || 'llama-3.3-70b-versatile',
}
const EMBED_MODEL = {
  providerId: process.env.SEARACH_EMBED_PROVIDER_ID || 'openai',
  key: process.env.SEARACH_EMBED_KEY || 'text-embedding-3-small',
}

export class PerplexicaAgent {
  async execute(query: string): Promise<string> {
    console.log(`[PerplexicaAgent] Deep research: ${query}`)

    const body = {
      message: {
        messageId: crypto.randomUUID(),
        chatId: crypto.randomUUID(),
        content: query,
      },
      optimizationMode: 'balanced' as const,
      sources: ['webSearch'],
      history: [],
      files: [],
      chatModel: CHAT_MODEL,
      embeddingModel: EMBED_MODEL,
      systemInstructions: 'Be thorough, cite sources, and provide a comprehensive answer.',
    }

    const res = await fetch(`${SEARACH_URL}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`searach returned ${res.status}: ${errText.slice(0, 200)}`)
    }

    // Parse NDJSON stream
    const raw = await res.text()
    const lines = raw.split('\n').filter(l => l.trim())

    let answer = ''
    const sources: string[] = []

    for (const line of lines) {
      try {
        const ev = JSON.parse(line)
        // Text blocks
        if (ev.type === 'block' && ev.block?.type === 'text') {
          answer += ev.block.content ?? ''
        }
        // Streaming text patches
        if (ev.type === 'updateBlock') {
          const v = ev.patch?.value ?? ev.patch?.content ?? ''
          if (typeof v === 'string') answer += v
        }
        // Source blocks
        if (ev.type === 'block' && ev.block?.type === 'sources') {
          for (const s of ev.block.sources ?? []) {
            if (s.url) sources.push(`- [${s.title || s.url}](${s.url})`)
          }
        }
      } catch { /* skip malformed lines */ }
    }

    if (!answer.trim()) {
      throw new Error('searach returned empty response. Check that searach is running and providers are configured.')
    }

    const srcSection = sources.length > 0
      ? `\n\n**Sources:**\n${sources.slice(0, 6).join('\n')}`
      : ''

    return `### Deep Research\n\n${answer.trim()}${srcSection}`
  }
}
