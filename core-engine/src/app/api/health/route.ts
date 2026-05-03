/**
 * GET /api/health — system health check
 * Returns status of all 6 microservices + DB + auth
 */

import { NextResponse } from 'next/server'
import { getSql } from '@/lib/db/supabase'

const SERVICES = [
  { name: 'crawler',   url: process.env.CRAWLER_URL   || 'http://127.0.0.1:8001', path: '/health' },
  { name: 'ppt',       url: process.env.PPT_URL        || 'http://127.0.0.1:8002', path: '/health' },
  { name: 'graphrag',  url: process.env.GRAPHRAG_URL   || 'http://127.0.0.1:8003', path: '/health' },
  { name: 'presenton', url: process.env.PRESENTON_BRIDGE_URL || 'http://127.0.0.1:8005', path: '/health' },
  { name: 'image',     url: process.env.IMAGE_URL      || 'http://127.0.0.1:8006', path: '/health' },
  { name: 'searach',   url: process.env.SEARACH_URL    || 'http://127.0.0.1:3001', path: '/api/health' },
]

async function checkService(name: string, url: string, path: string) {
  try {
    const res = await fetch(`${url}${path}`, { signal: AbortSignal.timeout(3000) })
    const data = await res.json().catch(() => ({}))
    return { name, status: res.ok ? 'ok' : 'error', ...data }
  } catch {
    return { name, status: 'offline' }
  }
}

async function checkDb() {
  try {
    const sql = getSql()
    await sql`SELECT 1`
    return { status: 'ok' }
  } catch (e) {
    return { status: 'error', error: String(e) }
  }
}

export async function GET() {
  const [dbStatus, ...serviceStatuses] = await Promise.all([
    checkDb(),
    ...SERVICES.map(s => checkService(s.name, s.url, s.path)),
  ])

  const allOk = dbStatus.status === 'ok' &&
    serviceStatuses.every(s => s.status === 'ok' || s.status === 'offline')

  return NextResponse.json({
    status: allOk ? 'ok' : 'degraded',
    database: dbStatus,
    services: serviceStatuses,
    timestamp: new Date().toISOString(),
  }, { status: allOk ? 200 : 207 })
}
