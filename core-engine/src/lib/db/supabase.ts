/**
 * Database — direct Postgres via Supabase pooler URL
 *
 * Only DATABASE_URL is needed. No Supabase SDK. No service key. No anon key.
 *
 * DATABASE_URL=postgresql://postgres.voybtucowpcmmnirostn:PASSWORD
 *             @aws-1-ap-northeast-2.pooler.supabase.com:6543/postgres
 */

import postgres from 'postgres'

let _sql: ReturnType<typeof postgres> | null = null

export function getSql(): ReturnType<typeof postgres> {
  if (!_sql) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set in .env.local')
    _sql = postgres(url, {
      max: 10,
      idle_timeout: 20,
      connect_timeout: 10,
      ssl: { rejectUnauthorized: false },
    })
  }
  return _sql
}

// Named export used throughout the codebase
export const db = { get sql() { return getSql() } }

// Thin compat shim — keeps old `supabase.from(...).insert(...)` calls working
// without changing every call site. All operations go through raw SQL underneath.
export const supabase = {
  from(table: string) {
    const sql = getSql()
    return {
      async insert(data: Record<string, unknown> | Record<string, unknown>[]) {
        try {
          const rows = Array.isArray(data) ? data : [data]
          for (const row of rows) {
            await sql`INSERT INTO ${sql(table)} ${sql(row)}`
          }
          return { error: null }
        } catch (e) {
          return { error: { message: String(e) } }
        }
      },
      async upsert(data: Record<string, unknown>, conflictCol = 'id') {
        try {
          await sql`
            INSERT INTO ${sql(table)} ${sql(data)}
            ON CONFLICT (${sql(conflictCol)}) DO UPDATE SET ${sql(data)}
          `
          return { error: null }
        } catch (e) {
          return { error: { message: String(e) } }
        }
      },
    }
  },
}
