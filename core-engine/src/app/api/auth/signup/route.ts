import { NextRequest, NextResponse } from 'next/server'
import { getSql } from '@/lib/db/supabase'
import { hashPassword, createSession } from '@/lib/auth/session'

export async function POST(req: NextRequest) {
  try {
    const { email, password, name } = await req.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }

    const sql = getSql()

    // Check if user exists
    const existing = await sql`SELECT id FROM users WHERE email = ${email.toLowerCase()} LIMIT 1`
    if (existing.length > 0) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 409 })
    }

    // Create user
    const passwordHash = await hashPassword(password)
    const users = await sql<{ id: string }[]>`
      INSERT INTO users (email, name, password_hash)
      VALUES (${email.toLowerCase()}, ${name || null}, ${passwordHash})
      RETURNING id
    `
    const userId = users[0].id

    // Create session
    const token = await createSession(userId)

    const res = NextResponse.json({ success: true, userId })
    res.cookies.set('darcie_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 86400,
      path: '/',
    })
    return res
  } catch (e) {
    console.error('[Auth/signup]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
