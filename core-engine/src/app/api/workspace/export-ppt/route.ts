/**
 * POST /api/workspace/export-ppt
 * Converts slide data to a downloadable PPTX via ppt-master bridge.
 * Falls back to a JSON export if the bridge is unavailable.
 */

import { NextRequest, NextResponse } from 'next/server'

const PPT_URL = process.env.PPT_URL || 'http://127.0.0.1:8002'

interface Slide {
  title: string
  content: string
  type: string
  bulletPoints?: string[]
}

export async function POST(req: NextRequest) {
  const { slides, title = 'Darcie Presentation' } = await req.json()

  if (!slides?.length) {
    return NextResponse.json({ error: 'No slides provided' }, { status: 400 })
  }

  // Build markdown content from slides for ppt-master
  const markdown = slides
    .map((s: Slide) => {
      if (s.type === 'title') return `# ${s.title}\n\n${s.content}`
      if (s.type === 'bullet' && s.bulletPoints?.length) {
        return `## ${s.title}\n\n${s.bulletPoints.map((b: string) => `- ${b}`).join('\n')}`
      }
      return `## ${s.title}\n\n${s.content}`
    })
    .join('\n\n---\n\n')

  try {
    // Try ppt-master bridge
    const res = await fetch(`${PPT_URL}/generate-ppt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: title,
        slide_count: slides.length,
        context: markdown,
      }),
      signal: AbortSignal.timeout(120_000),
    })

    if (res.ok) {
      const data = await res.json()
      // Redirect to download URL
      return NextResponse.json({ download_url: `http://localhost:8002${data.download_url}` })
    }
  } catch {
    // Bridge unavailable — fall through to JSON export
  }

  // Fallback: return slides as JSON for client-side handling
  return NextResponse.json({
    slides,
    title,
    message: 'PPT bridge unavailable. Slides returned as JSON.',
  })
}
