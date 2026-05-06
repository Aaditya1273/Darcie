/**
 * POST /api/analyze-image
 * Analyzes an uploaded image using Google Gemini Vision (free tier).
 * Accepts: multipart/form-data with `image` file + optional `prompt` text
 * Returns: { analysis: string }
 */

import { NextRequest, NextResponse } from 'next/server'

const GOOGLE_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY

export async function POST(req: NextRequest) {
  if (!GOOGLE_API_KEY) {
    return NextResponse.json({ error: 'Google API key not configured' }, { status: 503 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('image') as File | null
    const prompt = (formData.get('prompt') as string) || 'Analyze this image in detail. Describe what you see, identify key elements, colors, objects, text, and any notable features. Be thorough and specific.'

    if (!file) {
      return NextResponse.json({ error: 'No image provided' }, { status: 400 })
    }

    // Validate file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
    if (!validTypes.includes(file.type)) {
      return NextResponse.json({ error: 'Unsupported image format. Use JPEG, PNG, GIF, or WebP.' }, { status: 400 })
    }

    // Max 10MB
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: 'Image too large. Maximum size is 10MB.' }, { status: 400 })
    }

    // Convert to base64
    const bytes = await file.arrayBuffer()
    const base64 = Buffer.from(bytes).toString('base64')
    const mimeType = file.type

    // Call Gemini Vision API
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: base64,
                }
              }
            ]
          }],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 2048,
          }
        }),
        signal: AbortSignal.timeout(30_000),
      }
    )

    if (!response.ok) {
      const err = await response.text()
      console.error('[ImageAnalysis] Gemini error:', err)
      return NextResponse.json({ error: 'Image analysis failed. Please try again.' }, { status: 500 })
    }

    const data = await response.json()
    const analysis = data.candidates?.[0]?.content?.parts?.[0]?.text

    if (!analysis) {
      return NextResponse.json({ error: 'No analysis returned from model.' }, { status: 500 })
    }

    return NextResponse.json({ analysis })
  } catch (e) {
    console.error('[ImageAnalysis] Error:', e)
    return NextResponse.json({ error: 'Failed to analyze image.' }, { status: 500 })
  }
}
