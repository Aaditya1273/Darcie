/**
 * /api/workspace — SuperAgent (open-genspark merged into core-engine)
 *
 * Composio-powered agent with Google Sheets, Google Docs, slide generation,
 * and web search. Uses Gemini 2.5 Pro + Composio toolkits.
 *
 * Auth: reads real userId from session cookie (not cookie-based userId hack).
 */

import { NextRequest, NextResponse } from 'next/server'
import { generateText, generateObject } from 'ai'
import { google } from '@ai-sdk/google'
import { z } from 'zod'
import { getSession } from '@/lib/auth/session'

// ── Slide generation (self-contained, no Composio needed) ─────────
const slideSchema = z.object({
  slides: z.array(z.object({
    title: z.string(),
    content: z.string(),
    type: z.enum(['title', 'content', 'bullet']),
    bulletPoints: z.array(z.string()).optional(),
  }))
})

type SlideStyle = 'professional' | 'creative' | 'minimal' | 'academic'

const COLOR_SCHEMES: Record<SlideStyle, { background: string; text: string; cardBg: string; cardText: string; accent: string }> = {
  professional: { background: 'linear-gradient(135deg,#667eea 0%,#764ba2 100%)', text: '#fff', cardBg: '#fff', cardText: '#2d3748', accent: '#ed8936' },
  creative:     { background: 'linear-gradient(135deg,#ff6b6b 0%,#feca57 100%)', text: '#fff', cardBg: '#fff', cardText: '#2d3748', accent: '#38a169' },
  minimal:      { background: 'linear-gradient(135deg,#f8f9fa 0%,#e9ecef 100%)', text: '#2d3748', cardBg: '#fff', cardText: '#2d3748', accent: '#4299e1' },
  academic:     { background: 'linear-gradient(135deg,#4a5568 0%,#2d3748 100%)', text: '#fff', cardBg: '#fff', cardText: '#2d3748', accent: '#d69e2e' },
}

function buildSlideHTML(slide: { title: string; content: string; type: string; bulletPoints?: string[] }, style: SlideStyle = 'professional'): string {
  const c = COLOR_SCHEMES[style] ?? COLOR_SCHEMES.professional
  const css = `<style>
    .sc{width:100%;height:100%;isolation:isolate}
    .sc *{margin:0;padding:0;box-sizing:border-box}
    .sc .s{width:100%;min-height:500px;background:${c.background};color:${c.text};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:40px;position:relative;overflow:hidden}
    .sc .s::before{content:'';position:absolute;inset:0;background:rgba(0,0,0,.1);z-index:1}
    .sc .sc2{position:relative;z-index:2;text-align:center;max-width:800px;width:100%}
    .sc h1{font-size:3rem;font-weight:700;margin-bottom:1.5rem;line-height:1.2;letter-spacing:-.025em}
    .sc h2{font-size:2.5rem;font-weight:600;margin-bottom:1.5rem;line-height:1.2}
    .sc .sub{font-size:1.25rem;opacity:.9;margin-bottom:2rem}
    .sc .card{background:${c.cardBg};color:${c.cardText};padding:2rem;border-radius:16px;box-shadow:0 20px 40px rgba(0,0,0,.1);margin-top:2rem;text-align:left}
    .sc .card p{font-size:.95rem;line-height:1.6;margin-bottom:1rem}
    .sc ul{list-style:none;padding:0;margin:0}
    .sc ul li{font-size:.95rem;line-height:1.6;margin-bottom:1rem;padding-left:2rem;position:relative}
    .sc ul li::before{content:'•';color:${c.accent};font-size:1.5rem;position:absolute;left:0;top:0}
  </style>`

  let body = ''
  if (slide.type === 'title') {
    body = `<div class="sc"><div class="s"><div class="sc2"><h1>${slide.title}</h1>${slide.content ? `<p class="sub">${slide.content}</p>` : ''}</div></div></div>`
  } else if (slide.type === 'bullet' && slide.bulletPoints?.length) {
    const bullets = slide.bulletPoints.map(b => `<li>${b}</li>`).join('')
    body = `<div class="sc"><div class="s"><div class="sc2"><h2>${slide.title}</h2><div class="card"><ul>${bullets}</ul></div></div></div></div>`
  } else {
    body = `<div class="sc"><div class="s"><div class="sc2"><h2>${slide.title}</h2><div class="card"><p>${slide.content}</p></div></div></div></div>`
  }
  return css + body
}

async function generateSlides(content: string, style: SlideStyle = 'professional', slideCount = 6) {
  const { object } = await generateObject({
    model: google('gemini-1.5-flash-latest'),
    schema: slideSchema,
    prompt: `Create a ${slideCount}-slide presentation from this content. Use 'title' for slide 1, 'bullet' for key-point slides, 'content' for detail slides.

Content:
---
${content.slice(0, 6000)}
---

Rules: Never use placeholder text. Every slide must have real, specific content from the source.`,
  })
  return object.slides.map(s => ({ ...s, html: buildSlideHTML(s, style) }))
}

// ── Composio tools (optional — graceful fallback if no API key) ───
async function getComposioTools(userId: string) {
  const apiKey = process.env.COMPOSIO_API_KEY
  if (!apiKey || apiKey === 'YOUR_COMPOSIO_API_KEY') return {}

  try {
    const { Composio } = await import('@composio/core' as string) as any
    const { VercelProvider } = await import('@composio/vercel' as string) as any
    const composio = new Composio({ apiKey, provider: new VercelProvider() })

    const [sheets, docs, search] = await Promise.allSettled([
      composio.tools.get(userId, { toolkits: ['GOOGLESHEETS'] }),
      composio.tools.get(userId, { tools: ['GOOGLEDOCS_GET_DOCUMENT_BY_ID', 'GOOGLEDOCS_UPDATE_DOCUMENT_MARKDOWN'] }),
      composio.tools.get(userId, { toolkits: ['COMPOSIO_SEARCH'] }),
    ])

    return Object.assign(
      {},
      sheets.status === 'fulfilled' ? sheets.value : {},
      docs.status === 'fulfilled' ? docs.value : {},
      search.status === 'fulfilled' ? search.value : {},
    )
  } catch (e) {
    console.warn('[Workspace] Composio unavailable:', e)
    return {}
  }
}

// ── Route ─────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const session = await getSession()
    const body = await req.json()
    const { prompt, conversationHistory = [], sheetUrl, docUrl, style = 'professional' } = body

    if (!prompt?.trim()) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 })
    }

    // Use real session userId, fall back to guest
    const userId = session?.id ?? 'guest'

    // Detect if user wants slides
    const wantsSlides = /\b(slide|presentation|ppt|deck|powerpoint)\b/i.test(prompt)

    // Get Composio tools (non-blocking)
    const tools = await getComposioTools(userId)
    const hasTools = Object.keys(tools).length > 0

    const systemPrompt = `You are Super Agent — a powerful AI assistant with access to Google Sheets, Google Docs, web search, and presentation generation.

${sheetUrl ? `Connected Google Sheet: ${sheetUrl}` : ''}
${docUrl ? `Connected Google Doc: ${docUrl}` : ''}

Rules:
- When a Google Sheet or Doc is connected, treat it as primary context.
- For presentation requests, outline the slides clearly then end with [SLIDES].
- Be concise, action-oriented, and professional.
- If asked to update a Google Doc, use the update tool.`

    const messages = [
      ...conversationHistory.slice(-10), // last 10 turns for context
      { role: 'user' as const, content: prompt },
    ]

    // Generate response
    const { text } = await generateText({
      model: google('gemini-1.5-flash-latest'),
      system: systemPrompt,
      messages,
      tools: hasTools ? tools : undefined,
    })

    // Check for slide generation trigger
    if (wantsSlides || text.includes('[SLIDES]')) {
      const cleanText = text.replace('[SLIDES]', '').trim()
      const slides = await generateSlides(cleanText || prompt, style as SlideStyle)
      return NextResponse.json({ response: cleanText, slides, hasSlides: true })
    }

    return NextResponse.json({ response: text, hasSlides: false })
  } catch (error) {
    console.error('[Workspace API]', error)
    return NextResponse.json(
      { error: 'Failed to process request. Please try again.' },
      { status: 500 }
    )
  }
}
