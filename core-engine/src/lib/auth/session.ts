/**
 * Auth — JWT session via Supabase Postgres
 * No external auth service. No SDK. Just:
 *   - bcrypt password hashing
 *   - JWT signed with NEXTAUTH_SECRET
 *   - Sessions stored in Supabase `sessions` table
 *   - userId extracted from cookie on every request
 */

import { cookies } from 'next/headers'
import { getSql } from '../db/supabase'

const JWT_SECRET = process.env.NEXTAUTH_SECRET || 'darcie-dev-secret-change-in-prod'
const SESSION_COOKIE = 'darcie_session'
const SESSION_TTL_DAYS = 30

// ── Tiny JWT (no external dep) ────────────────────────────────────
function base64url(str: string): string {
  return Buffer.from(str).toString('base64url')
}
function fromBase64url(str: string): string {
  return Buffer.from(str, 'base64url').toString('utf8')
}

async function hmacSign(payload: string, secret: string): Promise<string> {
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload))
  return Buffer.from(sig).toString('base64url')
}

export async function createJWT(payload: Record<string, unknown>): Promise<string> {
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = base64url(JSON.stringify({ ...payload, iat: Date.now() }))
  const sig = await hmacSign(`${header}.${body}`, JWT_SECRET)
  return `${header}.${body}.${sig}`
}

export async function verifyJWT(token: string): Promise<Record<string, unknown> | null> {
  try {
    const [header, body, sig] = token.split('.')
    const expected = await hmacSign(`${header}.${body}`, JWT_SECRET)
    if (sig !== expected) return null
    return JSON.parse(fromBase64url(body))
  } catch {
    return null
  }
}

// ── Password hashing (Web Crypto PBKDF2 — no bcrypt dep) ──────────
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const enc = new TextEncoder()
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' }, key, 256
  )
  const saltHex = Buffer.from(salt).toString('hex')
  const hashHex = Buffer.from(bits).toString('hex')
  return `${saltHex}:${hashHex}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [saltHex, hashHex] = stored.split(':')
    const salt = Buffer.from(saltHex, 'hex')
    const enc = new TextEncoder()
    const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits'])
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' }, key, 256
    )
    return Buffer.from(bits).toString('hex') === hashHex
  } catch {
    return false
  }
}

// ── Session helpers ───────────────────────────────────────────────
export type SessionUser = { id: string; email: string; name: string | null }

export async function getSession(): Promise<SessionUser | null> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE)?.value
    if (!token) return null

    const payload = await verifyJWT(token)
    if (!payload?.userId) return null

    const sql = getSql()
    const rows = await sql<SessionUser[]>`
      SELECT id, email, name FROM users WHERE id = ${payload.userId as string} LIMIT 1
    `
    return rows[0] ?? null
  } catch {
    return null
  }
}

export async function createSession(userId: string): Promise<string> {
  const token = await createJWT({ userId })
  const sql = getSql()
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86400_000)
  await sql`
    INSERT INTO sessions (user_id, token, expires_at)
    VALUES (${userId}, ${token}, ${expiresAt.toISOString()})
  `
  return token
}

export async function deleteSession(token: string): Promise<void> {
  const sql = getSql()
  await sql`DELETE FROM sessions WHERE token = ${token}`
}
