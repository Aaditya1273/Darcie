/**
 * Darcie Orchestrator — Main API Route
 *
 * Flow:
 *  1. Parse query + userId
 *  2. Load memory context (Supabase pgvector)
 *  3. Planner → Groq Llama 3.3 70B generates task plan
 *  4. Execute ALL tasks in PARALLEL (Promise.allSettled)
 *  5. Synthesizer → Groq combines results
 *  6. Persist conversation + memory to Supabase
 *  7. Stream response back via SSE
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
import type { Task } from '@/lib/orchestrator/planner'

// ── SSE helpers ───────────────────────────────────────────────────
const encoder = new TextEncoder()

function sseEvent(type: string, data: unknown): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify({ type, data })}\n\n`)
}

// ── Task executor — calls the right agent for each task type ──────
async function executeTask(
  task: Task,
  agents: {
    search: SearchAgent
    ppt: PPTAgent
    graphrag: GraphRAGAgent
    perplexica: PerplexicaAgent
    presenton: PresentonAgent
    image: ImageAgent
  }
): Promise<string> {
  switch (task.type) {
    case 'search':
      return agents.search.execute(task.query)

    case 'deep_research':
      return agents.perplexica.execute(task.query)

    case 'research':
    case 'hybrid':
      return agents.graphrag.execute(task.query)

    case 'ppt':
      return agents.ppt.execute(task.query)

    case 'presenton_report':
      return agents.presenton.execute(task.query, task.styleContext)

    case 'generate_image':
    case 'image':
      return agents.image.execute(task.query)

    default:
      return `[Unknown task type: ${task.type}]`
  }
}

// ── Supabase persistence ──────────────────────────────────────────
async function persistConversation(
  userId: string,
  conversationId: string,
  query: string,
  response: string,
  plan: Task[]
): Promise<void> {
  try {
    const sql = getSql()
    await sql`
      INSERT INTO conversations (id, user_id, title, updated_at)
      VALUES (${conversationId}, ${userId}, ${query.slice(0, 80)}, NOW())
      ON CONFLICT (id) DO UPDATE SET updated_at = NOW()
    `
    await sql`
      INSERT INTO messages (conversation_id, role, content, metadata)
      VALUES
        (${conversationId}, 'user',      ${query},    '{}'::jsonb),
        (${conversationId}, 'assistant', ${response}, ${JSON.stringify({ plan })}::jsonb)
    `
  } catch (e) {
    console.warn('[Orchestrator] Failed to persist conversation:', e)
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

  // Resolve userId — real session if logged in, guest fallback
  const session = await getSession()
  const userId = session?.id ?? `guest_${req.headers.get('x-forwarded-for') ?? 'anon'}`
  const convId = conversationId || crypto.randomUUID()

  // ── Rate limiting (60 requests/hour per user) ─────────────────
  try {
    const sql = getSql()
    const oneHourAgo = new Date(Date.now() - 3600_000).toISOString()
    const usage = await sql<{ count: string }[]>`
      SELECT COUNT(*) as count FROM api_usage
      WHERE user_id = ${userId} AND endpoint = 'orchestrator' AND created_at > ${oneHourAgo}
    `
    const count = parseInt(usage[0]?.count ?? '0')
    const limit = session ? 60 : 10 // logged-in: 60/hr, guest: 10/hr
    if (count >= limit) {
      return new Response(
        JSON.stringify({ error: `Rate limit exceeded. ${session ? '60' : '10'} requests/hour allowed.` }),
        { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '3600' } }
      )
    }
    // Log this request (fire and forget)
    sql`INSERT INTO api_usage (user_id, endpoint) VALUES (${userId}, 'orchestrator')`.catch(() => {})
  } catch { /* never block on rate limit errors */ }

  // ── SSE Stream ────────────────────────────────────────────────
  const stream = new ReadableStream({
    async start(controller) {
      const send = (type: string, data: unknown) =>
        controller.enqueue(sseEvent(type, data))

      try {
        // ── Step 1: Memory ──────────────────────────────────────
        const memory = new ChatMemory(userId)
        send('status', { message: 'Loading memory context...' })

        // ── Step 2: Plan ────────────────────────────────────────
        send('status', { message: 'Analyzing your request...' })
        const planner = new Planner(userId)
        const plan = await planner.plan(query)

        send('plan', {
          intent: plan.intent,
          tasks: plan.tasks.map((t) => ({ type: t.type, query: t.query })),
        })

        // ── Step 3: Parallel agent execution ───────────────────
        const agents = {
          search: new SearchAgent(),
          ppt: new PPTAgent(),
          graphrag: new GraphRAGAgent(),
          perplexica: new PerplexicaAgent(),
          presenton: new PresentonAgent(),
          image: new ImageAgent(),
        }

        send('status', {
          message: `Running ${plan.tasks.length} task(s) in parallel...`,
        })

        // ALL tasks run at the same time — no sequential waiting
        const settled = await Promise.allSettled(
          plan.tasks.map((task) => {
            send('task_start', { type: task.type, query: task.query })
            return executeTask(task, agents).then((result) => {
              send('task_done', { type: task.type })
              return result
            })
          })
        )

        // Collect results — include error messages so synthesizer can handle them
        const results: string[] = settled.map((r, i) => {
          if (r.status === 'fulfilled') return r.value
          const task = plan.tasks[i]
          console.error(`[Orchestrator] Task ${task.type} failed:`, r.reason)
          return `[${task.type} failed: ${r.reason?.message ?? 'unknown error'}]`
        })

        // ── Step 4: Synthesize ──────────────────────────────────
        send('status', { message: 'Synthesizing response...' })
        const synthesizer = new Synthesizer()
        const finalResponse = await synthesizer.synthesize(query, results)

        // ── Step 5: Persist ─────────────────────────────────────
        await Promise.all([
          persistConversation(userId, convId, query, finalResponse, plan.tasks),
          memory.addInteraction(query, finalResponse),
        ])

        // ── Step 6: Done ────────────────────────────────────────
        send('response', {
          text: finalResponse,
          conversationId: convId,
          intent: plan.intent,
          plan: plan.tasks,
        })

        send('done', { conversationId: convId })
      } catch (error) {
        console.error('[Orchestrator] Critical error:', error)
        send('error', {
          message:
            error instanceof Error ? error.message : 'Failed to process query',
        })
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
