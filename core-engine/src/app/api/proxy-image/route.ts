/**
 * GET /api/proxy-image?url=...
 * Proxies images from ComfyUI (localhost:8188) so they load in production.
 * Without this, ComfyUI image URLs are unreachable from the browser in prod.
 */

import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_HOSTS = [
  '127.0.0.1',
  'localhost',
  process.env.COMFYUI_URL?.replace(/^https?:\/\//, '').split(':')[0] ?? '',
].filter(Boolean)

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get('url')

  if (!url) {
    return new NextResponse('Missing url parameter', { status: 400 })
  }

  // Security: only proxy from allowed hosts
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return new NextResponse('Invalid URL', { status: 400 })
  }

  const host = parsed.hostname
  if (!ALLOWED_HOSTS.includes(host)) {
    return new NextResponse(`Host not allowed: ${host}`, { status: 403 })
  }

  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) })
    if (!res.ok) {
      return new NextResponse(`Upstream error: ${res.status}`, { status: res.status })
    }

    const contentType = res.headers.get('content-type') ?? 'image/png'
    const buffer = await res.arrayBuffer()

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
      },
    })
  } catch (e) {
    return new NextResponse(`Proxy error: ${(e as Error).message}`, { status: 502 })
  }
}
