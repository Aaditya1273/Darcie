/**
 * ChatMemory — pgvector-backed memory via direct Postgres (pooler URL)
 * Just DATABASE_URL → postgres.js → Supabase pooler. No SDK needed.
 * Embeddings: Cohere embed-english-v3.0 (free tier, 1024 dims)
 */

import { getSql } from '../db/supabase'

const COHERE_API_KEY = process.env.COHERE_API_KEY

async function getEmbedding(text: string): Promise<number[] | null> {
  if (!COHERE_API_KEY) return null
  try {
    const res = await fetch('https://api.cohere.com/v1/embed', {
      method: 'POST',
      headers: { Authorization: `Bearer ${COHERE_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        texts: [text.slice(0, 2048)],
        model: 'embed-english-v3.0',
        input_type: 'search_query',
        truncate: 'END',
      }),
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.embeddings?.[0] ?? null
  } catch { return null }
}

export class ChatMemory {
  private userId: string
  constructor(userId = 'default_user') { this.userId = userId }

  async addInteraction(query: string, response: string): Promise<void> {
    try {
      const sql = getSql()
      const content = `User: ${query}\nAssistant: ${response.slice(0, 500)}`
      const embedding = await getEmbedding(content)
      const meta = JSON.stringify({ query, ts: Date.now() })

      if (embedding) {
        await sql`
          INSERT INTO memories (user_id, content, embedding, metadata)
          VALUES (${this.userId}, ${content}, ${JSON.stringify(embedding)}::vector, ${meta}::jsonb)
        `
      } else {
        await sql`
          INSERT INTO memories (user_id, content, metadata)
          VALUES (${this.userId}, ${content}, ${meta}::jsonb)
        `
      }
    } catch (e) { console.warn('[Memory] addInteraction failed:', e) }
  }

  async getContext(query: string): Promise<string> {
    try {
      const sql = getSql()
      const embedding = await getEmbedding(query)

      if (embedding) {
        const vec = JSON.stringify(embedding)
        const rows = await sql<{ content: string }[]>`
          SELECT content
          FROM memories
          WHERE user_id = ${this.userId}
            AND embedding IS NOT NULL
            AND 1 - (embedding <=> ${vec}::vector) > 0.65
          ORDER BY embedding <=> ${vec}::vector
          LIMIT 5
        `
        if (rows.length > 0) return rows.map(r => r.content).join('\n---\n')
      }

      // Fallback: most recent memories
      const recent = await sql<{ content: string }[]>`
        SELECT content FROM memories
        WHERE user_id = ${this.userId}
        ORDER BY created_at DESC LIMIT 5
      `
      return recent.map(r => r.content).join('\n---\n')
    } catch (e) {
      console.warn('[Memory] getContext failed:', e)
      return ''
    }
  }
}
