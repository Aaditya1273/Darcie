import { getSql } from '../db/supabase'

export class StyleMemory {
  private userId: string
  constructor(userId = 'default_user') { this.userId = userId }

  async addPreference(text: string): Promise<void> {
    try {
      const sql = getSql()
      await sql`
        INSERT INTO memories (user_id, content, metadata)
        VALUES (${this.userId}, ${'Style preference: ' + text}, '{"type":"style"}'::jsonb)
      `
    } catch (e) { console.warn('[StyleMemory] save failed:', e) }
  }

  async getPreferencesContext(): Promise<string> {
    try {
      const sql = getSql()
      const rows = await sql<{ content: string }[]>`
        SELECT content FROM memories
        WHERE user_id = ${this.userId}
          AND metadata->>'type' = 'style'
        ORDER BY created_at DESC LIMIT 5
      `
      return rows.length ? rows.map(r => r.content).join('\n') : 'Default professional style.'
    } catch { return 'Default professional style.' }
  }
}
