/**
 * SearchAgent — web search with AI-powered content extraction
 *
 * Flow:
 *  1. SearXNG → batch crawl → extract key facts with Groq
 *  2. DuckDuckGo HTML fallback → extract with Groq
 *  3. Groq direct answer (knowledge-based) if web unavailable
 *
 * The key improvement: raw crawled content is processed by Groq
 * to extract only the meaningful facts before passing to synthesizer.
 */

const CRAWLER_URL = process.env.CRAWLER_URL || 'http://127.0.0.1:8001'
const SEARXNG_URL = process.env.SEARXNG_URL || 'http://127.0.0.1:8080'
const GROQ_API_KEY = process.env.GROQ_API_KEY

function isUrl(str: string): boolean {
  try { new URL(str); return true } catch { return false }
}

// ── SearXNG ───────────────────────────────────────────────────────
async function searchSearXNG(query: string, count = 5): Promise<Array<{ url: string; title?: string; snippet?: string }>> {
  try {
    const params = new URLSearchParams({ q: query, format: 'json', language: 'en' })
    const res = await fetch(`${SEARXNG_URL}/search?${params}`, { signal: AbortSignal.timeout(8_000) })
    if (!res.ok) return []
    const data = await res.json()
    return (data.results ?? []).slice(0, count).map((r: { url: string; title?: string; content?: string }) => ({
      url: r.url,
      title: r.title,
      snippet: r.content,
    }))
  } catch { return [] }
}

// ── Crawl ─────────────────────────────────────────────────────────
async function crawlBatch(urls: string[]): Promise<string> {
  const res = await fetch(`${CRAWLER_URL}/crawl/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls }),
    signal: AbortSignal.timeout(45_000),
  })
  if (!res.ok) throw new Error(`Crawler ${res.status}`)
  const results: Array<{ url: string; markdown: string; title?: string; success: boolean }> = await res.json()
  return results
    .filter(r => r.success && r.markdown?.trim())
    .map(r => {
      // Strip navigation noise — keep only paragraphs with real content
      const lines = r.markdown.split('\n')
        .filter(l => l.trim().length > 40)  // skip short nav items
        .filter(l => !l.match(/^[#\[\]|]/))  // skip headers and table rows
        .filter(l => !l.match(/^\s*[-*]\s*\[/))  // skip link-only bullets
        .slice(0, 30)  // max 30 meaningful lines per source
      return `**Source: ${r.title || r.url}**\n${lines.join('\n')}`
    })
    .filter(s => s.length > 100)
    .join('\n\n---\n\n')
}

async function crawlSingle(url: string): Promise<string> {
  const res = await fetch(`${CRAWLER_URL}/crawl`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
    signal: AbortSignal.timeout(25_000),
  })
  if (!res.ok) throw new Error(`Crawler ${res.status}`)
  const data = await res.json()
  return data.markdown || ''
}

// ── Groq: extract facts from raw crawl content ───────────────────
async function extractFactsWithGroq(query: string, rawContent: string): Promise<string> {
  if (!GROQ_API_KEY) return rawContent.slice(0, 3000)

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: `You are a research assistant. Extract the most relevant, factual information from web content to answer a user's question.

Rules:
- Extract ONLY facts, data, explanations, and insights relevant to the question
- Remove all navigation links, ads, menus, footers, and irrelevant content  
- Organize extracted facts clearly with bullet points or short paragraphs
- Include specific numbers, dates, names, and statistics when present
- If the content doesn't contain relevant information, say so briefly
- Maximum 400 words`,
        },
        {
          role: 'user',
          content: `Question: "${query}"\n\nWeb content to extract from:\n${rawContent.slice(0, 6000)}`,
        },
      ],
      temperature: 0.2,
      max_tokens: 600,
    }),
    signal: AbortSignal.timeout(20_000),
  })
  if (!res.ok) return rawContent.slice(0, 2000)
  const data = await res.json()
  return data.choices[0].message.content
}

// ── Groq direct answer ────────────────────────────────────────────
async function answerWithGroq(query: string): Promise<string> {
  if (!GROQ_API_KEY) throw new Error('No GROQ_API_KEY')
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: `You are a knowledgeable AI assistant. Answer questions thoroughly with facts, explanations, and context. 
Use your training knowledge to give a complete, well-structured answer.
Format with headers and bullet points where appropriate.`,
        },
        { role: 'user', content: query },
      ],
      temperature: 0.4,
      max_tokens: 1200,
    }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`Groq ${res.status}`)
  const data = await res.json()
  return data.choices[0].message.content
}

// ── Main ──────────────────────────────────────────────────────────
export class SearchAgent {
  async execute(query: string): Promise<string> {
    console.log(`[SearchAgent] Searching: ${query}`)

    // Direct URL
    if (isUrl(query)) {
      try {
        const raw = await crawlSingle(query)
        if (raw.trim()) return await extractFactsWithGroq(query, raw)
      } catch { /* fall through */ }
      return await answerWithGroq(`Summarize: ${query}`)
    }

    // SearXNG → batch crawl → extract facts
    const searxResults = await searchSearXNG(query, 4)
    if (searxResults.length > 0) {
      try {
        const urls = searxResults.map(r => r.url)
        const rawContent = await crawlBatch(urls)
        if (rawContent.trim().length > 200) {
          const facts = await extractFactsWithGroq(query, rawContent)
          return facts
        }
      } catch (e) {
        console.warn('[SearchAgent] Batch crawl failed:', (e as Error).message)
      }
    }

    // DuckDuckGo fallback → extract facts
    try {
      const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
      const raw = await crawlSingle(ddgUrl)
      if (raw.trim().length > 200) {
        return await extractFactsWithGroq(query, raw)
      }
    } catch { /* fall through */ }

    // Final fallback: Groq knowledge
    console.warn('[SearchAgent] Web unavailable — using Groq knowledge')
    return await answerWithGroq(query)
  }
}
