import { NextRequest, NextResponse } from 'next/server'
import { getSql } from '@/lib/db/supabase'
import { verifyPassword, createSession } from '@/lib/auth/session'

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password required' }, { status: 400 })
    }

    const sql = getSql()
    const users = await sql<{ id: string; password_hash: string; name: string | null }[]>`
      SELECT id, password_hash, name FROM users WHERE email = ${email.toLowerCase()} LIMIT 1
    `
    if (users.length === 0) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const user = users[0]
    const valid = await verifyPassword(password, user.password_hash)
    if (!valid) {
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const token = await createSession(user.id)
    const res = NextResponse.json({ success: true, userId: user.id, name: user.name })
    res.cookies.set('darcie_session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 86400,
      path: '/',
    })
    return res
  } catch (e) {
    console.error('[Auth/signin]', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
