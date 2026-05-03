/**
 * Planner — converts user query into a typed task plan
 *
 * Primary:  Groq Llama 3.3 70B  (fast structured output)
 * Fallback: Google Gemini 1.5 Flash
 * Final:    LLM7 Llama 3.3 70B  (free)
 *
 * Memory context from Supabase pgvector is injected into the prompt
 * so the planner knows the user's past preferences and style.
 */

import { generateObject } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { z } from 'zod'
import { ChatMemory } from '../memory/chat_memory'

const groq = createOpenAI({
  baseURL: 'https://api.groq.com/openai/v1',
  apiKey: process.env.GROQ_API_KEY,
  compatibility: 'strict',
})

const llm7 = createOpenAI({
  baseURL: process.env.LLM7_BASE_URL || 'https://api.llm7.io/v1',
  apiKey: process.env.LLM7_API_KEY,
  compatibility: 'compatible',
})

// ── Schemas ───────────────────────────────────────────────────────
export const TaskSchema = z.object({
  type: z.enum([
    'search',        // crawl4ai web search
    'deep_research', // searach (Perplexica) multi-step research
    'research',      // GraphRAG knowledge graph query
    'hybrid',        // GraphRAG + search combined
    'ppt',           // ppt-master PPTX generation
    'presenton_report', // Presenton styled presentation
    'generate_image',   // ComfyUI image generation
    'image',            // alias for generate_image
  ]),
  query: z.string().describe('The specific query or prompt for this task'),
  styleContext: z.string().optional().describe('Style/formatting preferences from user memory'),
})

export const PlanSchema = z.object({
  intent: z.string().describe('One sentence describing what the user wants'),
  tasks: z.array(TaskSchema).min(1).describe('Ordered list of tasks to execute'),
})

export type Task = z.infer<typeof TaskSchema>
export type Plan = z.infer<typeof PlanSchema>

// ── Planner class ─────────────────────────────────────────────────
export class Planner {
  private memory: ChatMemory

  constructor(userId: string = 'default_user') {
    this.memory = new ChatMemory(userId)
  }

  async plan(query: string): Promise<Plan> {
    // Load user memory context (non-blocking — fails silently)
    let memoryContext = ''
    try {
      memoryContext = await this.memory.getContext(query)
    } catch {
      console.warn('[Planner] Memory offline')
    }

    const prompt = `
You are the Brain of Darcie, an AI workspace that can search, research, generate images, and create presentations.

Available task types:
- "search"           → Fast web search + crawl (use for factual questions, current events, data gathering)
- "deep_research"    → Multi-step web research via Perplexica (use for complex topics needing synthesis)
- "research"         → Knowledge graph query via GraphRAG (use when user has indexed their own documents)
- "ppt"              → Generate a downloadable PowerPoint file via ppt-master
- "presenton_report" → Generate a styled AI presentation via Presenton
- "generate_image"   → Generate an image via ComfyUI

User query: "${query}"
${memoryContext ? `\nUser's past preferences:\n${memoryContext}` : ''}

Planning rules:
1. For "make a PPT about X" → plan: [search(X), ppt(X)] — search first to get real data
2. For "make a presentation about X" → plan: [search(X), presenton_report(X)]
3. For "generate image of X" → plan: [generate_image(X)]
4. For "research X deeply" → plan: [deep_research(X)]
5. For simple questions → plan: [search(question)]
6. For "what is X" / "explain X" → plan: [search(X)]
7. Never add unnecessary tasks. Keep plans minimal and focused.
8. Pass styleContext from user memory into ppt/presenton tasks.

Generate the execution plan now:`.trim()

    // Tier 1: Groq
    try {
      const { object } = await generateObject({
        model: groq('llama-3.3-70b-versatile', { structuredOutputs: false }),
        schema: PlanSchema,
        prompt,
      })
      return object
    } catch (e) {
      console.warn('[Planner] Groq failed, trying Gemini...', e)
    }

    // Tier 2: Gemini Flash
    try {
      const { google } = await import('@ai-sdk/google')
      const { generateObject: go } = await import('ai')
      const { object } = await go({
        model: google('gemini-1.5-flash-latest'),
        schema: PlanSchema,
        prompt,
      })
      return object
    } catch (e) {
      console.warn('[Planner] Gemini failed, trying LLM7...', e)
    }

    // Tier 3: LLM7 (always free)
    const { generateObject: go } = await import('ai')
    const { object } = await go({
      model: llm7('llama-3.3-70b-instruct'),
      schema: PlanSchema,
      prompt,
    })
    return object
  }
}
