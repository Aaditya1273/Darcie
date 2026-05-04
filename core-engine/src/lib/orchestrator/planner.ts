/**
 * Planner — converts user query into a typed task plan
 *
 * Uses generateText + JSON prompt instead of generateObject.
 * generateObject uses the Responses API (/v1/responses) in ai SDK v6
 * which Groq, LLM7, and older Gemini models don't support.
 *
 * Strategy: ask the LLM to return JSON in the prompt, parse it manually.
 *
 * Primary:  Groq Llama 3.3 70B  (chat completions, fast, free)
 * Fallback: Google Gemini 2.0 Flash
 * Final:    GLM-4 (Zhipu, free)
 */

import { generateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { z } from 'zod'
import { ChatMemory } from '../memory/chat_memory'

// ── LLM clients — all use chat completions, not responses API ─────
const groq = createOpenAI({
  baseURL: 'https://api.groq.com/openai/v1',
  apiKey: process.env.GROQ_API_KEY,
})

const glm = createOpenAI({
  baseURL: 'https://open.bigmodel.cn/api/paas/v4',
  apiKey: process.env.GLM_API_KEY,
})

const llm7 = createOpenAI({
  baseURL: process.env.LLM7_BASE_URL || 'https://api.llm7.io/v1',
  apiKey: process.env.LLM7_API_KEY || 'free',
})

// ── Schemas ───────────────────────────────────────────────────────
export const TaskSchema = z.object({
  type: z.enum([
    'search',
    'deep_research',
    'research',
    'hybrid',
    'ppt',
    'presenton_report',
    'generate_image',
    'image',
  ]),
  query: z.string(),
  styleContext: z.string().optional(),
})

export const PlanSchema = z.object({
  intent: z.string(),
  tasks: z.array(TaskSchema).min(1),
})

export type Task = z.infer<typeof TaskSchema>
export type Plan = z.infer<typeof PlanSchema>

// ── JSON parser — strips markdown fences, parses, validates ───────
function parsePlan(raw: string): Plan {
  // Strip ```json ... ``` fences if present
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim()

  // Find the first { ... } block
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('No JSON object found in response')

  const json = JSON.parse(cleaned.slice(start, end + 1))
  return PlanSchema.parse(json)
}

// ── System + user prompt ──────────────────────────────────────────
function buildPrompt(query: string, memoryContext: string): string {
  return `You are the Brain of Darcie AI. Analyze the user query and return a JSON execution plan.

Available task types:
- "search"           → web search (factual questions, current events)
- "deep_research"    → multi-step research (complex topics)
- "research"         → knowledge graph query (user's own documents)
- "ppt"              → generate PowerPoint file
- "presenton_report" → generate styled presentation
- "generate_image"   → generate an image

User query: "${query}"
${memoryContext ? `User preferences: ${memoryContext}` : ''}

Rules:
- PPT request → [search(topic), ppt(topic)]
- Presentation request → [search(topic), presenton_report(topic)]
- Image request → [generate_image(prompt)]
- Deep research → [deep_research(topic)]
- Simple question → [search(question)]
- Keep plans minimal. Never add unnecessary tasks.

Respond with ONLY valid JSON, no explanation:
{
  "intent": "one sentence describing what the user wants",
  "tasks": [
    { "type": "search", "query": "specific search query" }
  ]
}`
}

// ── Planner class ─────────────────────────────────────────────────
export class Planner {
  private memory: ChatMemory

  constructor(userId = 'default_user') {
    this.memory = new ChatMemory(userId)
  }

  async plan(query: string): Promise<Plan> {
    let memoryContext = ''
    try {
      memoryContext = await this.memory.getContext(query)
    } catch {
      // memory offline — continue without context
    }

    const prompt = buildPrompt(query, memoryContext)

    // ── Tier 1: Groq Llama 3.3 70B ───────────────────────────────
    try {
      const { text } = await generateText({
        model: groq.chat('llama-3.3-70b-versatile'),
        prompt,
        temperature: 0.1,
      })
      return parsePlan(text)
    } catch (e) {
      console.warn('[Planner] Groq failed:', (e as Error).message?.slice(0, 80))
    }

    // ── Tier 2: Gemini 2.0 Flash ──────────────────────────────────
    try {
      const { google } = await import('@ai-sdk/google')
      const { generateText: gt } = await import('ai')
      const { text } = await gt({
        model: google('gemini-2.0-flash'),
        prompt,
        temperature: 0.1,
      })
      return parsePlan(text)
    } catch (e) {
      console.warn('[Planner] Gemini failed:', (e as Error).message?.slice(0, 80))
    }

    // ── Tier 3: GLM-4 (Zhipu, free) ──────────────────────────────
    try {
      const { text } = await generateText({
        model: glm.chat('glm-4-flash'),
        prompt,
        temperature: 0.1,
      })
      return parsePlan(text)
    } catch (e) {
      console.warn('[Planner] GLM failed:', (e as Error).message?.slice(0, 80))
    }

    // ── Tier 4: LLM7 ─────────────────────────────────────────────
    try {
      const { text } = await generateText({
        model: llm7.chat('llama-3.3-70b-instruct'),
        prompt,
        temperature: 0.1,
      })
      return parsePlan(text)
    } catch (e) {
      console.warn('[Planner] LLM7 failed:', (e as Error).message?.slice(0, 80))
    }

    // ── Hard fallback: parse the query ourselves ──────────────────
    console.warn('[Planner] All LLMs failed — using rule-based fallback')
    return buildFallbackPlan(query)
  }
}

// ── Rule-based fallback — never crashes ──────────────────────────
function buildFallbackPlan(query: string): Plan {
  const q = query.toLowerCase()

  if (/\b(image|picture|photo|draw|generate.*image|create.*image)\b/.test(q)) {
    return { intent: 'Generate an image', tasks: [{ type: 'generate_image', query }] }
  }
  if (/\b(ppt|powerpoint|presentation|slides)\b/.test(q)) {
    return {
      intent: 'Create a presentation',
      tasks: [
        { type: 'search', query },
        { type: 'ppt', query },
      ],
    }
  }
  if (/\b(report|document|styled presentation)\b/.test(q)) {
    return {
      intent: 'Generate a report',
      tasks: [
        { type: 'search', query },
        { type: 'presenton_report', query },
      ],
    }
  }
  if (/\b(deep research|research deeply|comprehensive research)\b/.test(q)) {
    return { intent: 'Deep research', tasks: [{ type: 'deep_research', query }] }
  }

  // Default: web search
  return { intent: 'Answer the question', tasks: [{ type: 'search', query }] }
}
