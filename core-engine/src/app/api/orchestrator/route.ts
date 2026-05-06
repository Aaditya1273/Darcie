/**
 * Darcie Orchestrator — Main API Route
 *
 * Flow:
 *  0. NLP Router — classify input FIRST (no DB, instant)
 *     → conversational → Groq direct reply (~300ms)
 *     → complex → full pipeline below
 *  1. Auth + rate limit (DB check, only for complex queries)
 *  2. Planner → Groq generates task plan
 *  3. Execute ALL tasks in PARALLEL (Promise.allSettled)
 *  4. Synthesizer → Groq combines results
 *  5. Persist conversation + memory to Supabase
 *  6. Stream response back via SSE
 */

import { NextRequest } from 'next/server'
import { Planner } from '@/lib/orchestrator/planner'
import { Synthesizer } from '@/lib/orchestrator/synthesizer'
import { SearchAgent } from '@/lib/agents/search_agent'
import { PPTAgent } from '@/lib/agents/ppt_agent'
import { GraphRAGAgent } from '@/lib/agents/graphrag_agent'
import { PerplexicaAgent } from '@/lib/agents/perplexica_agent'
import { PresentonAgent } from '@/lib/agents/presenton_agent'
import { ImageAgent } from '@/lib/agents/image_agent'
import { ChatMemory } from '@/lib/memory/chat_memory'
import { getSql } from '@/lib/db/supabase'
import { getSession } from '@/lib/auth/session'
import { classifyInput, generateConversationalResponse } from '@/lib/orchestrator/nlp_router'
import type { Task } from '@/lib/orchestrator/planner'

// ── SSE helpers ───────────────────────────────────────────────────
const encoder = new TextEncoder()

function sseEvent(type: string, data: unknown): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify({ type, data })}\n\n`)
}

// ── Task executor ─────────────────────────────────────────────────
async function executeTask(
  task: Task,
  agents: {
    search: SearchAgent; ppt: PPTAgent; graphrag: GraphRAGAgent
    perplexica: PerplexicaAgent; presenton: PresentonAgent; image: ImageAgent
  }
): Promise<string> {
  switch (task.type) {
    case 'search':          return agents.search.execute(task.query)
    case 'deep_research':   return agents.perplexica.execute(task.query)
    case 'research':
    case 'hybrid':          return agents.graphrag.execute(task.query)
    case 'ppt':             return agents.ppt.execute(task.query)
    case 'presenton_report':return agents.presenton.execute(task.query, task.styleContext)
    case 'generate_image':
    case 'image':           return agents.image.execute(task.query)
    default:                return `[Unknown task type: ${task.type}]`
  }
}

// ── Persistence (fire-and-forget safe) ───────────────────────────
async function persistConversation(
  userId: string, conversationId: string,
  query: string, response: string, plan: Task[]
): Promise<void> {
  try {
    const sql = getSql()
    await sql`
      INSERT INTO conversations (id, user_id, title, updated_at)
      VALUES (${conversationId}, ${userId}, ${query.slice(0, 80)}, NOW())
      ON CONFLICT (id) DO UPDATE SET updated_at = NOW()
    `
    await sql`
      INSERT INTO messages (conversation_id, role, content, metadata) VALUES
        (${conversationId}, 'user',      ${query},    '{}'::jsonb),
        (${conversationId}, 'assistant', ${response}, ${JSON.stringify({ plan })}::jsonb)
    `
  } catch (e) {
    console.warn('[Orchestrator] Persist failed:', e)
  }
}

// ── Rate limit check (only for complex queries) ───────────────────
async function checkRateLimit(
  userId: string, isLoggedIn: boolean
): Promise<{ blocked: boolean; limit: number }> {
  try {
    const sql = getSql()
    const oneHourAgo = new Date(Date.now() - 3600_000).toISOString()
    const rows = await sql<{ count: string }[]>`
      SELECT COUNT(*) as count FROM api_usage
      WHERE user_id = ${userId} AND endpoint = 'orchestrator' AND created_at > ${oneHourAgo}
    `
    const count = parseInt(rows[0]?.count ?? '0')
    const limit = isLoggedIn ? 60 : 10
    if (count >= limit) return { blocked: true, limit }
    // Log async — never await
    sql`INSERT INTO api_usage (user_id, endpoint) VALUES (${userId}, 'orchestrator')`.catch(() => {})
    return { blocked: false, limit }
  } catch {
    return { blocked: false, limit: 60 } // never block on DB errors
  }
}

// ── Main route ────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { query, conversationId } = body

  if (!query?.trim()) {
    return new Response(
      JSON.stringify({ error: 'Query is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  const convId = conversationId || crypto.randomUUID()

  // ── Step 0: NLP Router — BEFORE any DB calls ──────────────────
  // Classify instantly with zero I/O — pure string matching
  const inputClass = classifyInput(query)

  // ── Fast path: conversational inputs ─────────────────────────
  // Skip session check, skip rate limit, skip planner entirely.
  // Just Groq → response. Target: <500ms.
  if (inputClass !== 'complex') {
    const stream = new ReadableStream({
      async start(controller) {
        const send = (type: string, data: unknown) =>
          controller.enqueue(sseEvent(type, data))
        try {
          const reply = await generateConversationalResponse(query, inputClass)
          send('response', { text: reply, conversationId: convId, intent: inputClass, plan: [] })
          send('done', { conversationId: convId })
          // Persist async — don't await, don't block response
          persistConversation('guest', convId, query, reply, []).catch(() => {})
        } catch (e) {
          send('error', { message: (e as Error).message })
        } finally {
          controller.close()
        }
      },
    })
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    })
  }

  // ── Complex path: auth + rate limit + full pipeline ───────────
  const session = await getSession()
  const userId = session?.id ?? `guest_${req.headers.get('x-forwarded-for') ?? 'anon'}`

  const { blocked, limit } = await checkRateLimit(userId, !!session)
  if (blocked) {
    return new Response(
      JSON.stringify({ error: `Rate limit: ${limit} requests/hour. Sign in for higher limits.` }),
      { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '3600' } }
    )
  }

  // ── Full pipeline SSE stream ──────────────────────────────────
  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, data: unknown) =>
        controller.enqueue(sseEvent(type, data))

      try {
        // Memory + Plan (parallel — save ~200ms)
        send('status', { message: 'Analyzing your request...' })
        const memory = new ChatMemory(userId)
        const planner = new Planner(userId)
        const plan = await planner.plan(query)

        send('plan', {
          intent: plan.intent,
          tasks: plan.tasks.map(t => ({ type: t.type, query: t.query })),
        })

        // All agents in parallel
        const agents = {
          search: new SearchAgent(), ppt: new PPTAgent(),
          graphrag: new GraphRAGAgent(), perplexica: new PerplexicaAgent(),
          presenton: new PresentonAgent(), image: new ImageAgent(),
        }

        send('status', { message: `Running ${plan.tasks.length} task(s)...` })

        const settled = await Promise.allSettled(
          plan.tasks.map(task => {
            send('task_start', { type: task.type, query: task.query })
            return executeTask(task, agents).then(result => {
              send('task_done', { type: task.type })
              return result
            })
          })
        )

        const results = settled.map((r, i) => {
          if (r.status === 'fulfilled') return r.value
          console.error(`[Orchestrator] Task ${plan.tasks[i].type} failed:`, r.reason)
          return `[${plan.tasks[i].type} failed: ${(r.reason as Error)?.message ?? 'error'}]`
        })

        send('status', { message: 'Synthesizing...' })
        const synthesizer = new Synthesizer()
        const finalResponse = await synthesizer.synthesize(query, results)

        // Persist async — don't block the response
        Promise.all([
          persistConversation(userId, convId, query, finalResponse, plan.tasks),
          memory.addInteraction(query, finalResponse),
        ]).catch(() => {})

        send('response', {
          text: finalResponse,
          conversationId: convId,
          intent: plan.intent,
          plan: plan.tasks,
        })
        send('done', { conversationId: convId })

      } catch (error) {
        console.error('[Orchestrator] Critical error:', error)
        send('error', { message: error instanceof Error ? error.message : 'Failed to process query' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
