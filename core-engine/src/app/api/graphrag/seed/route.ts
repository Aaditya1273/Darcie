/**
 * POST /api/graphrag/seed
 * Seeds the GraphRAG index with documents.
 * Body: { documents: string[] } or { urls: string[] } (will crawl them first)
 *
 * This is the one-time setup step that makes the research agent work.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/auth/session'

const GRAPHRAG_URL = process.env.GRAPHRAG_URL || 'http://127.0.0.1:8003'
const CRAWLER_URL  = process.env.CRAWLER_URL  || 'http://127.0.0.1:8001'

export async function POST(req: NextRequest) {
  const session = await getSession()
  if (!session) return NextResponse.json({ error: 'Auth required' }, { status: 401 })

  const { documents, urls, reset = false } = await req.json()

  let docs: string[] = documents ?? []

  // If URLs provided, crawl them first
  if (urls?.length) {
    const crawlRes = await fetch(`${CRAWLER_URL}/crawl/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls }),
      signal: AbortSignal.timeout(60_000),
    })
    if (crawlRes.ok) {
      const results = await crawlRes.json()
      const crawled = results
        .filter((r: { success: boolean; markdown: string }) => r.success && r.markdown)
        .map((r: { markdown: string }) => r.markdown)
      docs = [...docs, ...crawled]
    }
  }

  if (docs.length === 0) {
    return NextResponse.json({ error: 'No documents to index' }, { status: 400 })
  }

  // Send to GraphRAG index
  const indexRes = await fetch(`${GRAPHRAG_URL}/index/init`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ documents: docs, reset }),
    signal: AbortSignal.timeout(10_000),
  })

  if (!indexRes.ok) {
    return NextResponse.json({ error: 'GraphRAG indexing failed' }, { status: 500 })
  }

  const data = await indexRes.json()
  return NextResponse.json({ ...data, documentsProvided: docs.length })
}

export async function GET() {
  // Check index status
  const res = await fetch(`${GRAPHRAG_URL}/health`, { signal: AbortSignal.timeout(3000) }).catch(() => null)
  if (!res?.ok) return NextResponse.json({ status: 'offline' })
  return NextResponse.json(await res.json())
}
