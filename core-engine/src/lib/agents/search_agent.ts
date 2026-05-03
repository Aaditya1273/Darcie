/**
 * SearchAgent — calls the crawl4ai bridge (port 8001)
 *
 * For a search query (not a direct URL), we first use SearXNG
 * to get top URLs, then batch-crawl them via crawl4ai.
 * Falls back to direct URL crawl if query looks like a URL.
 */

const CRAWLER_URL = process.env.CRAWLER_URL || 'http://127.0.0.1:8001'
const SEARXNG_URL = process.env.SEARXNG_URL || 'http://127.0.0.1:8080'

function isUrl(str: string): boolean {
  try {
    new URL(str)
    return true
  } catch {
    return false
  }
}

async function searchSearXNG(query: string, count = 5): Promise<string[]> {
  try {
    const params = new URLSearchParams({
      q: query,
      format: 'json',
      engines: 'google,bing,duckduckgo',
      language: 'en',
    })
    const res = await fetch(`${SEARXNG_URL}/search?${params}`, {
      signal: AbortSignal.timeout(10_000),
    })
    if (!res.ok) throw new Error(`SearXNG ${res.status}`)
    const data = await res.json()
    return (data.results ?? [])
      .slice(0, count)
      .map((r: { url: string }) => r.url)
      .filter(Boolean)
  } catch (e) {
    console.warn('[SearchAgent] SearXNG unavailable:', e)
    return []
  }
}

export class SearchAgent {
  /**
   * If query is a URL → crawl it directly.
   * If query is text → search SearXNG for top URLs → batch crawl them.
   * Returns combined markdown from all crawled pages.
   */
  async execute(query: string): Promise<string> {
    console.log(`[SearchAgent] Searching: ${query}`)

    // ── Direct URL crawl ────────────────────────────────────────
    if (isUrl(query)) {
      const res = await fetch(`${CRAWLER_URL}/crawl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: query }),
        signal: AbortSignal.timeout(30_000),
      })
      if (!res.ok) throw new Error(`Crawler API ${res.status}`)
      const data = await res.json()
      return data.markdown || ''
    }

    // ── Search → batch crawl ────────────────────────────────────
    const urls = await searchSearXNG(query, 4)

    if (urls.length === 0) {
      // SearXNG not available — crawl a DuckDuckGo search page as fallback
      const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`
      const res = await fetch(`${CRAWLER_URL}/crawl`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: ddgUrl }),
        signal: AbortSignal.timeout(30_000),
      })
      if (!res.ok) throw new Error(`Crawler API ${res.status}`)
      const data = await res.json()
      return `[Search Results for: ${query}]\n\n${data.markdown || ''}`
    }

    // Batch crawl all URLs in parallel via crawl4ai
    const res = await fetch(`${CRAWLER_URL}/crawl/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls }),
      signal: AbortSignal.timeout(60_000),
    })

    if (!res.ok) throw new Error(`Crawler batch API ${res.status}`)
    const results: Array<{ url: string; markdown: string; title?: string; success: boolean }> =
      await res.json()

    const combined = results
      .filter((r) => r.success && r.markdown)
      .map((r) => `### ${r.title || r.url}\n${r.markdown.slice(0, 2000)}`)
      .join('\n\n---\n\n')

    return `[Search Results for: "${query}"]\n\n${combined}`
  }
}
