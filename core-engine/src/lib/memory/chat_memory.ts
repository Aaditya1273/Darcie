/**
 * ChatMemory — Supabase pgvector-backed memory
 *
 * Replaces Mem0 cloud API entirely.
 * Uses Cohere embed-v3 (free tier) for embeddings.
 * Stores and retrieves memories from Supabase memories table.
 */

import { supabase } from '../db/supabase'

const COHERE_API_KEY = process.env.COHERE_API_KEY
const EMBED_MODEL = 'embed-english-v3.0'

// ── Embedding via Cohere (free tier, 1536-dim) ────────────────────
async function getEmbedding(text: string): Promise<number[]> {
  if (!COHERE_API_KEY) {
    console.warn('[Memory] COHERE_API_KEY not set — memory search disabled')
    return []
  }

  const res = await fetch('https://api.cohere.com/v1/embed', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${COHERE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      texts: [text],
      model: EMBED_MODEL,
      input_type: 'search_query',
      truncate: 'END',
    }),
  })

  if (!res.ok) {
    console.warn(`[Memory] Cohere embed failed: ${res.status}`)
    return []
  }

  const data = await res.json()
  return data.embeddings?.[0] ?? []
}

// ── ChatMemory class ──────────────────────────────────────────────
export class ChatMemory {
  private userId: string

  constructor(userId: string = 'default_user') {
    this.userId = userId
  }

  /**
   * Store a conversation turn as a memory with vector embedding.
   */
  async addInteraction(query: string, response: string): Promise<void> {
    try {
      const content = `User: ${query}\nAssistant: ${response}`
      const embedding = await getEmbedding(content)

      const insertData: Record<string, unknown> = {
        user_id: this.userId,
        content,
        metadata: { query, response_preview: response.slice(0, 200) },
      }

      // Only include embedding if we got one
      if (embedding.length > 0) {
        insertData.embedding = JSON.stringify(embedding)
      }

      const { error } = await supabase.from('memories').insert(insertData)

      if (error) {
        console.warn('[Memory] Failed to store memory:', error.message)
      }
    } catch (e) {
      // Never crash the main flow due to memory errors
      console.warn('[Memory] addInteraction error:', e)
    }
  }

  /**
   * Retrieve relevant past memories using vector similarity search.
   * Falls back to recent memories if embeddings are unavailable.
   */
  async getContext(query: string): Promise<string> {
    try {
      const embedding = await getEmbedding(query)

      if (embedding.length > 0) {
        // Vector similarity search via Supabase RPC
        const { data, error } = await supabase.rpc('match_memories', {
          query_embedding: JSON.stringify(embedding),
          match_user_id: this.userId,
          match_count: 5,
          match_threshold: 0.7,
        })

        if (!error && data && data.length > 0) {
          return data.map((m: { content: string }) => m.content).join('\n---\n')
        }
      }

      // Fallback: get 5 most recent memories for this user
      const { data: recent } = await supabase
        .from('memories')
        .select('content')
        .eq('user_id', this.userId)
        .order('created_at', { ascending: false })
        .limit(5)

      if (recent && recent.length > 0) {
        return recent.map((m: { content: string }) => m.content).join('\n---\n')
      }

      return ''
    } catch (e) {
      console.warn('[Memory] getContext error:', e)
      return ''
    }
  }
}
