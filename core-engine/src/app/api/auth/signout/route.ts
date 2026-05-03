import { NextRequest, NextResponse } from 'next/server'
import { deleteSession } from '@/lib/auth/session'

export async function POST(req: NextRequest) {
  const token = req.cookies.get('darcie_session')?.value
  if (token) await deleteSession(token).catch(() => {})
  const res = NextResponse.json({ success: true })
  res.cookies.delete('darcie_session')
  return res
}
