/**
 * SearchAgent — web search via crawl4ai bridge (port 8001)
 *
 * Flow:
 *  1. If query is a URL → crawl it directly
 *  2. Try SearXNG for top URLs → batch crawl them
 *  3. If SearXNG down → crawl DuckDuckGo HTML search page
 *  4. If crawler bridge down → use Groq directly to answer
 *
 * Never throws — always returns a string.
 */

const CRAWLER_URL = process.env.CRAWLER_URL || 'http://127.0.0.1:8001'
const SEARXNG_URL = process.env.SEARXNG_URL || 'http://127.0.0.1:8080'
const GROQ_API_KEY = process.env.GROQ_API_KEY

function isUrl(str: string): boolean {
  try { new URL(str); return true } catch { return false }
}

// ── SearXNG search ────────────────────────────────────────────────
async function searchSearXNG(query: string, count = 4): Promise<string[]> {
  try {
    const params = new URLSearchParams({
      q: query, format: 'json',
      engines: 'google,bing,duckduckgo', language: 'en',
    })
    const res = await fetch(`${SEARXNG_URL}/search?${params}`, {
      signal: AbortSignal.timeout(8_000),
    })
    if (!res.ok) return []
    const data = await res.json()
    return (data.results ?? []).slice(0, count).map((r: { url: string }) => r.url).filter(Boolean)
  } catch {
    return []
  }
}

// ── Crawler bridge call ───────────────────────────────────────────
async function crawlUrl(url: string): Promise<string> {
  const res = await fetch(`${CRAWLER_URL}/crawl`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`Crawler API ${res.status}`)
  const data = await res.json()
  return data.markdown || ''
}

async function crawlBatch(urls: string[]): Promise<string> {
  const res = await fetch(`${CRAWLER_URL}/crawl/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ urls }),
    signal: AbortSignal.timeout(60_000),
  })
  if (!res.ok) throw new Error(`Crawler batch API ${res.status}`)
  const results: Array<{ url: string; markdown: string; title?: string; success: boolean }> =
    await res.json()
  return results
    .filter(r => r.success && r.markdown)
    .map(r => `### ${r.title || r.url}\n${r.markdown.slice(0, 2000)}`)
    .join('\n\n---\n\n')
}

// ── Groq direct answer fallback (no crawling needed) ─────────────
async function answerWithGroq(query: string): Promise<string> {
  if (!GROQ_API_KEY) throw new Error('No GROQ_API_KEY')
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: 'You are a helpful assistant. Answer the question directly and concisely using your knowledge. Be factual.',
        },
        { role: 'user', content: query },
      ],
      temperature: 0.3,
      max_tokens: 1024,
    }),
    signal: AbortSignal.timeout(30_000),
  })
  if (!res.ok) throw new Error(`Groq ${res.status}`)
  const data = await res.json()
  return `[Direct Answer — web search unavailable]\n\n${data.choices[0].message.content}`
}

// ── Main agent ────────────────────────────────────────────────────
export class SearchAgent {
  async execute(query: string): Promise<string> {
    console.log(`[SearchAgent] Searching: ${query}`)

    // ── 1. Direct URL crawl ───────────────────────────────────────
    if (isUrl(query)) {
      try {
        const md = await crawlUrl(query)
        return md || `[Crawled ${query} — no content extracted]`
      } catch (e) {
        console.warn('[SearchAgent] Direct crawl failed:', (e as Error).message)
        return await answerWithGroq(`Summarize what you know about: ${query}`)
      }
    }

    // ── 2. SearXNG → batch crawl ──────────────────────────────────
    const urls = await searchSearXNG(query, 4)

    if (urls.length > 0) {
      try {
        const combined = await crawlBatch(urls)
        if (combined.trim()) {
          return `[Search Results for: "${query}"]\n\n${combined}`
        }
      } catch (e) {
        console.warn('[SearchAgent] Batch crawl failed:', (e as Error).message)
      }
    }

    // ── 3. DuckDuckGo HTML fallback ───────────────────────────────
    try {
      const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
      const md = await crawlUrl(ddgUrl)
      if (md.trim()) {
        return `[Search Results for: "${query}"]\n\n${md.slice(0, 4000)}`
      }
    } catch (e) {
      console.warn('[SearchAgent] DuckDuckGo crawl failed:', (e as Error).message)
    }

    // ── 4. Groq direct answer (no web needed) ────────────────────
    console.warn('[SearchAgent] All web sources failed — using Groq direct answer')
    try {
      return await answerWithGroq(query)
    } catch (e) {
      console.warn('[SearchAgent] Groq fallback failed:', (e as Error).message)
      return `[Search unavailable for: "${query}". The web search service is not running. Start it with: bash run.sh]`
    }
  }
}
